import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

// Small file-backed store. Volume here is a handful of clients and sessions,
// so a JSON file under the service account is proportionate.
const FILE = config.oauthStorePath;

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { clients: {}, codes: {}, tokens: {}, refresh: {} };
  }
}

function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db), { mode: 0o600 });
}

const now = () => Date.now();
const rand = (n = 32) => crypto.randomBytes(n).toString('base64url');

function sweep(db) {
  for (const [k, v] of Object.entries(db.codes)) if (v.expiresAt < now()) delete db.codes[k];
  for (const [k, v] of Object.entries(db.tokens)) if (v.expiresAt < now()) delete db.tokens[k];
}

export function registerClient(meta) {
  const db = load();
  const id = `c_${rand(16)}`;
  db.clients[id] = {
    client_id: id,
    client_name: meta.client_name || 'unnamed client',
    redirect_uris: meta.redirect_uris || [],
    created: new Date().toISOString(),
  };
  save(db);
  return db.clients[id];
}

export function getClient(id) {
  return load().clients[id] || null;
}

export function issueCode({ clientId, redirectUri, codeChallenge, label, scope }) {
  const db = load();
  sweep(db);
  const code = rand(24);
  db.codes[code] = {
    clientId, redirectUri, codeChallenge, label, scope,
    expiresAt: now() + 60_000,
  };
  save(db);
  return code;
}

export function redeemCode(code, verifier) {
  const db = load();
  sweep(db);
  const entry = db.codes[code];
  if (!entry) return { error: 'invalid_grant' };
  delete db.codes[code];

  const digest = crypto.createHash('sha256').update(verifier || '').digest('base64url');
  if (digest !== entry.codeChallenge) {
    save(db);
    return { error: 'invalid_grant' };
  }

  const access = rand(32);
  const refresh = rand(32);
  const ttl = config.oauth.accessTtlMs;
  db.tokens[access] = { label: entry.label, scope: entry.scope, clientId: entry.clientId, expiresAt: now() + ttl };
  db.refresh[refresh] = { label: entry.label, scope: entry.scope, clientId: entry.clientId };
  save(db);
  return { access, refresh, expiresIn: Math.floor(ttl / 1000) };
}

export function refreshToken(token) {
  const db = load();
  sweep(db);
  const entry = db.refresh[token];
  if (!entry) return { error: 'invalid_grant' };
  const access = rand(32);
  const ttl = config.oauth.accessTtlMs;
  db.tokens[access] = { ...entry, expiresAt: now() + ttl };
  save(db);
  return { access, expiresIn: Math.floor(ttl / 1000) };
}

export function verifyAccess(token) {
  if (!token) return null;
  const db = load();
  const entry = db.tokens[token];
  if (!entry || entry.expiresAt < now()) return null;
  return { label: entry.label, scope: entry.scope };
}
