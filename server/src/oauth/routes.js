import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { audit, clientIp } from '../audit.js';
import { checkRateOnly } from '../auth.js';
import { consentPage } from './consent.js';
import { registerClient, getClient, issueCode, redeemCode, refreshToken } from './store.js';

const failures = new Map(); // ip -> { count, lockedUntil }

function lockedOut(ip) {
  const f = failures.get(ip);
  return !!(f && f.lockedUntil && Date.now() < f.lockedUntil);
}

function noteFailure(ip) {
  const f = failures.get(ip) || { count: 0, lockedUntil: 0 };
  f.count += 1;
  if (f.count >= config.rateLimit.maxFailedAuth) {
    f.lockedUntil = Date.now() + config.rateLimit.lockoutMs;
    f.count = 0;
    audit({ event: 'oauth.lockout', ip });
  }
  failures.set(ip, f);
}

function passwordOk(supplied) {
  const expected = config.oauth.password;
  if (!expected || typeof supplied !== 'string') return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function oauthRouter(baseUrlOf) {
  const r = express.Router();
  r.use(express.urlencoded({ extended: false }));

  // --- discovery ---------------------------------------------------------

  r.get('/.well-known/oauth-protected-resource', (req, res) => {
    const base = baseUrlOf(req);
    res.json({
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ['header'],
    });
  });

  r.get('/.well-known/oauth-authorization-server', (req, res) => {
    const base = baseUrlOf(req);
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });

  // --- dynamic client registration --------------------------------------
  // Clients are public and PKCE-protected, so registration is open; the
  // password on the consent screen is what actually gates access.

  r.post('/oauth/register', express.json(), (req, res) => {
    const client = registerClient(req.body || {});
    audit({ event: 'oauth.register', ip: clientIp(req), client: client.client_name });
    res.status(201).json({
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  });

  // --- authorization -----------------------------------------------------

  r.get('/oauth/authorize', (req, res) => {
    const p = req.query;
    const client = getClient(p.client_id);
    if (!client) return res.status(400).type('text/plain').send('Unknown client. Try connecting again.');
    if (p.code_challenge_method !== 'S256' || !p.code_challenge) {
      return res.status(400).type('text/plain').send('This server requires PKCE with S256.');
    }
    res.type('text/html').send(consentPage({ client, params: p, error: null }));
  });

  r.post('/oauth/authorize', (req, res) => {
    const ip = clientIp(req);
    const b = req.body || {};
    const client = getClient(b.client_id);
    if (!client) return res.status(400).type('text/plain').send('Unknown client. Try connecting again.');

    const rl = checkRateOnly(ip);
    if (!rl.ok || lockedOut(ip)) {
      audit({ event: 'oauth.blocked', ip });
      return res.status(429).type('text/html').send(
        consentPage({ client, params: b, error: 'Too many attempts. Wait a few minutes and try again.' }),
      );
    }

    if (!passwordOk(b.password)) {
      noteFailure(ip);
      audit({ event: 'oauth.fail', ip, client: client.client_name });
      return res.status(401).type('text/html').send(
        consentPage({ client, params: b, error: 'That password was not accepted.' }),
      );
    }

    const code = issueCode({
      clientId: client.client_id,
      redirectUri: b.redirect_uri,
      codeChallenge: b.code_challenge,
      label: `oauth:${client.client_name}`,
      scope: 'all',
    });
    audit({ event: 'oauth.granted', ip, client: client.client_name });

    const url = new URL(b.redirect_uri);
    url.searchParams.set('code', code);
    if (b.state) url.searchParams.set('state', b.state);
    res.redirect(302, url.toString());
  });

  // --- token -------------------------------------------------------------

  r.post('/oauth/token', (req, res) => {
    const b = req.body || {};
    if (b.grant_type === 'authorization_code') {
      const out = redeemCode(b.code, b.code_verifier);
      if (out.error) return res.status(400).json({ error: out.error });
      audit({ event: 'oauth.token', ip: clientIp(req) });
      return res.json({
        access_token: out.access,
        refresh_token: out.refresh,
        token_type: 'Bearer',
        expires_in: out.expiresIn,
      });
    }
    if (b.grant_type === 'refresh_token') {
      const out = refreshToken(b.refresh_token);
      if (out.error) return res.status(400).json({ error: out.error });
      return res.json({ access_token: out.access, token_type: 'Bearer', expires_in: out.expiresIn });
    }
    res.status(400).json({ error: 'unsupported_grant_type' });
  });

  return r;
}
