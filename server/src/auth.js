import crypto from 'node:crypto';
import { config } from './config.js';
import { audit, clientIp } from './audit.js';

// Timing-safe compare so response latency cannot leak the password.
function passwordMatches(supplied) {
  if (typeof supplied !== 'string' || supplied.length === 0) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(config.password);
  if (a.length !== b.length) {
    // Still burn a comparison to keep timing flat.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

const buckets = new Map();   // ip -> { count, resetAt }
const failures = new Map();  // ip -> { count, lockedUntil }

function rateLimited(ip) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + config.rateLimit.windowMs });
    return false;
  }
  b.count += 1;
  return b.count > config.rateLimit.maxPerWindow;
}

function lockedOut(ip) {
  const f = failures.get(ip);
  return !!(f && f.lockedUntil && Date.now() < f.lockedUntil);
}

function noteFailure(ip) {
  const now = Date.now();
  const f = failures.get(ip) || { count: 0, lockedUntil: 0 };
  f.count += 1;
  if (f.count >= config.rateLimit.maxFailedAuth) {
    f.lockedUntil = now + config.rateLimit.lockoutMs;
    f.count = 0;
    audit({ event: 'auth.lockout', ip, forMs: config.rateLimit.lockoutMs });
  }
  failures.set(ip, f);
}

function noteSuccess(ip) {
  failures.delete(ip);
}

// Headers only. A credential in a query string leaks into server logs, proxy
// logs and browser history, so the URL-borne forms were removed.
export function extractPassword(req) {
  return (
    req.get?.('x-gateway-password') ||
    (req.get?.('authorization') || '').replace(/^Bearer\s+/i, '') ||
    null
  );
}

// Shared check used by both the REST layer and the MCP tools.
export function checkAccess({ ip, supplied, action }) {
  if (lockedOut(ip)) {
    audit({ event: 'auth.blocked', reason: 'locked_out', ip, action });
    return { ok: false, status: 429, error: 'Too many failed attempts. Try again later.' };
  }
  if (rateLimited(ip)) {
    audit({ event: 'auth.blocked', reason: 'rate_limited', ip, action });
    return { ok: false, status: 429, error: 'Rate limit exceeded. Slow down.' };
  }
  if (!passwordMatches(supplied)) {
    noteFailure(ip);
    audit({ event: 'auth.fail', ip, action });
    return { ok: false, status: 401, error: 'Invalid or missing password.' };
  }
  noteSuccess(ip);
  return { ok: true };
}

export function requirePassword(req, res, next) {
  const ip = clientIp(req);
  const result = checkAccess({ ip, supplied: extractPassword(req), action: `${req.method} ${req.path}` });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  audit({ event: 'auth.ok', ip, action: `${req.method} ${req.path}`, ua: req.get('user-agent') || null });
  next();
}

// Capability links carry no password, so they need the rate limiter alone.
export function checkRateOnly(ip) {
  if (lockedOut(ip)) return { ok: false, status: 429, error: 'Too many requests. Try again later.' };
  if (rateLimited(ip)) return { ok: false, status: 429, error: 'Rate limit exceeded. Slow down.' };
  return { ok: true };
}
