// Shared fetch helper. Two jobs: consistent errors, and never letting a
// credential escape in a message that gets handed back to an AI agent.
export function redact(text, secrets) {
  let out = String(text ?? '');
  for (const s of secrets) {
    if (s && s.length > 6) out = out.split(s).join('[REDACTED]');
  }
  return out;
}

export async function getJson(url, { headers = {}, secrets = [], timeoutMs = 20_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const raw = await res.text();
    let body;
    try { body = JSON.parse(raw); } catch { body = { raw: raw.slice(0, 2000) }; }

    if (!res.ok) {
      const msg = redact(body?.error?.message || body?.message || raw.slice(0, 400), secrets);
      const err = new Error(`upstream ${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return body;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`upstream timed out after ${timeoutMs}ms`);
    err.message = redact(err.message, secrets);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
