import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let stream = null;
try {
  fs.mkdirSync(path.dirname(config.auditLogPath), { recursive: true });
  stream = fs.createWriteStream(config.auditLogPath, { flags: 'a' });
} catch (err) {
  console.warn(`[audit] file log unavailable (${err.message}); falling back to stdout only`);
}

// Every call gets a line. With a shared password we cannot say *who* called,
// so the source IP and user agent are the only attribution available.
export function audit(event) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
  console.log(`[audit] ${line}`);
  if (stream) stream.write(line + '\n');
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
