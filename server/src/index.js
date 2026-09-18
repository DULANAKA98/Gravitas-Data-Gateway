import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, assertBootConfig } from './config.js';
import { audit, clientIp } from './audit.js';
import { handleMcpRequest } from './mcp.js';
import { dataPage } from './flow.js';
import { catalogPage } from './catalog.js';
import { oauthRouter } from './oauth/routes.js';
import { resolve as resolveToken, allowsClient } from './tokens.js';
import { checkAccess, extractPassword, checkRateOnly } from './auth.js';
import * as metricool from './providers/metricool.js';
import * as meta from './providers/meta.js';

assertBootConfig();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // sits behind Caddy
app.use(express.json({ limit: '256kb' }));

// OAuth sign-in: discovery, registration, consent and token endpoints.
app.use(oauthRouter((req) => `${req.protocol}://${req.get('host')}`));

// --- public, no password ---------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Dulanaka Data Gateway',
    version: '1.0.0',
    providers: {
      metricool: Boolean(config.metricool.token && config.metricool.userId),
      meta: Boolean(config.meta.accessToken),
    },
  });
});

app.use('/', express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

// --- capability links ------------------------------------------------------
// The link itself is the credential. Nobody is prompted for a secret, so none
// of this resembles a credential-collection flow.

function holderFor(req, res) {
  const ip = clientIp(req);
  const rl = checkRateOnly(ip);
  if (!rl.ok) { res.status(rl.status).type('text/plain').send(rl.error); return null; }

  const holder = resolveToken(req.params.token);
  if (!holder || holder.revoked) {
    audit({ event: 'link.denied', ip, reason: holder?.revoked ? 'revoked' : 'unknown' });
    res.status(404).type('text/plain').send('This link is not valid. It may have been revoked. Ask whoever gave it to you for a new one.');
    return null;
  }
  return { ip, holder };
}

app.get('/d/:token', async (req, res) => {
  const ctx = holderFor(req, res);
  if (!ctx) return;
  try {
    audit({ event: 'link.catalog', ip: ctx.ip, who: ctx.holder.label });
    const md = await catalogPage({ base: `${req.protocol}://${req.get('host')}`, token: req.params.token, holder: ctx.holder });
    res.type('text/markdown; charset=utf-8').send(md);
  } catch (err) {
    res.status(502).type('text/plain').send(`gateway error: ${err.message}`);
  }
});

app.get('/d/:token/data', async (req, res) => {
  const ctx = holderFor(req, res);
  if (!ctx) return;
  const { client, source, start, end } = req.query;
  if (!client || !source) {
    return res.status(400).json({ ok: false, error: 'client and source are required. Fetch the catalog link for the list of clients.' });
  }
  try {
    const data = await dataPage(null, null, client, source, { start, end });
    if (!allowsClient(ctx.holder, data.client)) {
      audit({ event: 'link.scope_denied', ip: ctx.ip, who: ctx.holder.label, client: data.client });
      return res.status(403).json({ ok: false, error: `This link does not have access to ${data.client}.` });
    }
    audit({ event: 'link.data', ip: ctx.ip, who: ctx.holder.label, client: data.client, source });
    res.json({ ok: true, accessFor: ctx.holder.label, data });
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: err.message });
  }
});

// --- MCP endpoint ----------------------------------------------------------
// Password is checked per tool call inside mcp.js, so the agent can connect
// and list tools, then gets prompted for the password on first real call.

app.post('/mcp', async (req, res) => {
  try {
    await handleMcpRequest(req, res, clientIp(req));
  } catch (err) {
    audit({ event: 'mcp.error', ip: clientIp(req), error: err.message });
    if (!res.headersSent) res.status(500).json({ error: 'internal error' });
  }
});
app.get('/mcp', (_req, res) => res.status(405).json({ error: 'Use POST for MCP (streamable HTTP).' }));

// --- REST fallback, password required on every route -----------------------

const api = express.Router();
// Same capability tokens as everything else. The shared password is gone: it
// was weak, shared, unrevocable, and it outlived the flow it was built for.
api.use((req, res, next) => {
  const ip = clientIp(req);
  const rl = checkRateOnly(ip);
  if (!rl.ok) return res.status(rl.status).json({ ok: false, error: rl.error });

  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    || req.get('x-gateway-token') || '';
  const holder = resolveToken(bearer);
  if (!holder || holder.revoked) {
    audit({ event: 'rest.denied', ip, action: `${req.method} ${req.path}` });
    return res.status(401).json({ ok: false, error: 'A valid access token is required in the Authorization header.' });
  }
  req.holder = holder;
  audit({ event: 'rest.ok', ip, who: holder.label, action: `${req.method} ${req.path}` });
  next();
});

const send = (res) => (data) => res.json({ ok: true, data });
const oops = (res) => (err) => res.status(err.status || 502).json({ ok: false, error: err.message });

api.get('/metricool/brands', (req, res) => metricool.listBrands().then(send(res), oops(res)));
api.get('/metricool/content', (req, res) => {
  const { kind, network, blogId, start, end } = req.query;
  if (!kind || !network || !blogId || !start || !end) {
    return res.status(400).json({ ok: false, error: 'kind, network, blogId, start and end are required' });
  }
  metricool.content({ kind, network, blogId, start, end }).then(send(res), oops(res));
});
api.get('/metricool/raw', (req, res) => {
  const { path: p, ...query } = req.query;
  if (!p) return res.status(400).json({ ok: false, error: 'path is required' });
  metricool.raw({ path: p, query }).then(send(res), oops(res));
});

api.get('/meta/pages', (req, res) => meta.listPages().then(send(res), oops(res)));
api.get('/meta/page-insights', (req, res) => {
  const { pageId, metrics, period, since, until } = req.query;
  if (!metrics) return res.status(400).json({ ok: false, error: 'metrics is required' });
  meta.pageInsights({ pageId, metrics: String(metrics).split(','), period, since, until }).then(send(res), oops(res));
});
api.get('/meta/ig-insights', (req, res) => {
  const { igUserId, metrics, period, since, until } = req.query;
  if (!metrics) return res.status(400).json({ ok: false, error: 'metrics is required' });
  meta.igUserInsights({ igUserId, metrics: String(metrics).split(','), period, since, until }).then(send(res), oops(res));
});
api.get('/meta/ig-media', (req, res) => {
  const { igUserId, limit } = req.query;
  meta.igMedia({ igUserId, limit: limit ? Number(limit) : undefined }).then(send(res), oops(res));
});
api.get('/meta/raw', (req, res) => {
  const { path: p, ...query } = req.query;
  if (!p) return res.status(400).json({ ok: false, error: 'path is required' });
  meta.raw({ path: p, query }).then(send(res), oops(res));
});

app.use('/v1', api);

app.use((req, res) => res.status(404).json({ error: `no route for ${req.method} ${req.path}` }));

app.listen(config.port, config.bindHost, () => {
  console.log(`[boot] Dulanaka Data Gateway listening on ${config.bindHost}:${config.port}`);
  console.log(`[boot] public url: ${config.publicUrl}`);
});
