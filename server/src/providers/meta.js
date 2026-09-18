import { config } from '../config.js';
import { getJson } from './http.js';

function requireKeys() {
  if (!config.meta.accessToken) {
    const e = new Error('Meta is not configured on this gateway (missing META_ACCESS_TOKEN).');
    e.status = 503;
    throw e;
  }
}

function secrets() {
  return [config.meta.accessToken];
}

function url(path, query = {}) {
  const qs = new URLSearchParams({ ...query, access_token: config.meta.accessToken });
  return `${config.meta.baseUrl}/${config.meta.apiVersion}${path}?${qs}`;
}

const PAGE_FIELDS = 'id,name,category,instagram_business_account';

function shapePage(p) {
  return {
    pageId: p.id,
    name: p.name ?? null,
    category: p.category ?? null,
    instagramBusinessAccountId: p.instagram_business_account?.id ?? null,
  };
}

// Works with either token type. A User token has a /me/accounts edge listing
// every page; a Page token does not - there /me is the page itself.
export async function listPages() {
  requireKeys();
  try {
    const data = await getJson(url('/me/accounts', { fields: PAGE_FIELDS }), { secrets: secrets() });
    if (Array.isArray(data?.data)) return data.data.map(shapePage);
  } catch (err) {
    if (!/nonexisting field \(accounts\)/i.test(err.message)) throw err;
  }
  const me = await getJson(url('/me', { fields: PAGE_FIELDS }), { secrets: secrets() });
  return [shapePage(me)];
}

export async function pageInsights({ pageId = config.meta.defaultPageId, metrics, period = 'day', since, until }) {
  requireKeys();
  const q = { metric: Array.isArray(metrics) ? metrics.join(',') : metrics, period };
  if (since) q.since = since;
  if (until) q.until = until;
  return getJson(url(`/${encodeURIComponent(pageId)}/insights`, q), { secrets: secrets() });
}

export async function igUserInsights({ igUserId = config.meta.defaultIgUserId, metrics, period = 'day', since, until }) {
  requireKeys();
  const q = { metric: Array.isArray(metrics) ? metrics.join(',') : metrics, period };
  if (since) q.since = since;
  if (until) q.until = until;
  return getJson(url(`/${encodeURIComponent(igUserId)}/insights`, q), { secrets: secrets() });
}

export async function igMedia({ igUserId = config.meta.defaultIgUserId, limit = 25 }) {
  requireKeys();
  const q = {
    fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
    limit: String(limit),
  };
  return getJson(url(`/${encodeURIComponent(igUserId)}/media`, q), { secrets: secrets() });
}

// Read-only passthrough for any Graph GET, for metrics not wrapped above.
export async function raw({ path, query = {} }) {
  requireKeys();
  if (!/^\/[A-Za-z0-9/_\-.]*$/.test(path)) throw new Error('invalid path');
  return getJson(url(path, query), { secrets: secrets() });
}
