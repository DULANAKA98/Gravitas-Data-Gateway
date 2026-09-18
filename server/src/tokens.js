import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from './config.js';

// Capability links: possession of the URL is the authorisation. No one is ever
// asked to type a secret, so nothing here resembles a credential prompt.
const STORE = config.tokenStorePath;

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch {
    return { tokens: [] };
  }
}

function save(db) {
  fs.writeFileSync(STORE, JSON.stringify(db, null, 2), { mode: 0o600 });
}

export function mint({ label, scope = 'all' }) {
  const db = load();
  // 160 bits, url-safe. Not guessable, not brute-forceable at our rate limit.
  const token = crypto.randomBytes(20).toString('base64url');
  db.tokens.push({ token, label, scope, created: new Date().toISOString(), revoked: false, lastUsed: null, uses: 0 });
  save(db);
  return token;
}

export function revoke(prefixOrLabel) {
  const db = load();
  let n = 0;
  for (const t of db.tokens) {
    if (!t.revoked && (t.token.startsWith(prefixOrLabel) || t.label === prefixOrLabel)) {
      t.revoked = true;
      t.revokedAt = new Date().toISOString();
      n += 1;
    }
  }
  save(db);
  return n;
}

export function list() {
  return load().tokens.map((t) => ({
    label: t.label,
    prefix: `${t.token.slice(0, 8)}...`,
    scope: t.scope,
    created: t.created.slice(0, 10),
    revoked: t.revoked,
    uses: t.uses,
    lastUsed: t.lastUsed,
  }));
}

// Constant-time lookup, then record the use so the audit trail names a person.
export function resolve(supplied) {
  if (typeof supplied !== 'string' || supplied.length < 16) return null;
  const db = load();
  const want = Buffer.from(supplied);
  for (const t of db.tokens) {
    const have = Buffer.from(t.token);
    if (have.length !== want.length) continue;
    if (!crypto.timingSafeEqual(have, want)) continue;
    if (t.revoked) return { revoked: true, label: t.label };
    t.uses += 1;
    t.lastUsed = new Date().toISOString();
    save(db);
    return { label: t.label, scope: t.scope };
  }
  return null;
}

export function allowsClient(holder, clientLabel) {
  if (!holder || holder.scope === 'all') return true;
  return holder.scope.split(',').map((s) => s.trim().toLowerCase()).includes(clientLabel.toLowerCase());
}
