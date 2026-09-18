import { config } from '../config.js';
import { getJson } from './http.js';

// Endpoint shapes below were verified against the live account rather than
// taken from docs - Metricool's v1 stats paths 404 and v2 is what answers.
const NETWORKS = ['instagram', 'facebook', 'tiktok', 'twitter', 'linkedin', 'youtube', 'pinterest'];
const CONTENT_KINDS = { posts: NETWORKS, stories: ['instagram', 'facebook'], reels: ['instagram', 'facebook'] };

function requireKeys() {
  if (!config.metricool.token || !config.metricool.userId) {
    const e = new Error('Metricool is not configured on this gateway (missing METRICOOL_TOKEN or METRICOOL_USER_ID).');
    e.status = 503;
    throw e;
  }
}

const auth = () => ({ 'X-Mc-Auth': config.metricool.token, Accept: 'application/json' });
const secrets = () => [config.metricool.token];

// v2 wants full ISO timestamps, not bare dates.
function toIso(d, endOfDay = false) {
  const s = String(d).trim();
  if (s.includes('T')) return s;
  return `${s}T${endOfDay ? '23:59:59' : '00:00:00'}`;
}

export async function listBrands() {
  requireKeys();
  const url = `${config.metricool.baseUrl}/admin/simpleProfiles?userId=${encodeURIComponent(config.metricool.userId)}`;
  const data = await getJson(url, { headers: auth(), secrets: secrets() });
  const rows = Array.isArray(data) ? data : (data?.data ?? []);
  return rows.map((b) => ({
    blogId: b.id ?? null,
    label: b.label ?? b.title ?? null,
    networks: Object.fromEntries(
      NETWORKS.map((n) => [n, b[n] ?? null]).filter(([, v]) => v),
    ),
  }));
}

// posts | stories | reels, per network.
export async function content({ kind, network, blogId, start, end }) {
  requireKeys();
  const allowed = CONTENT_KINDS[kind];
  if (!allowed) throw new Error(`kind must be one of: ${Object.keys(CONTENT_KINDS).join(', ')}`);
  if (!allowed.includes(network)) throw new Error(`${kind} is not available for ${network}; try: ${allowed.join(', ')}`);
  if (!blogId) throw new Error('blogId is required - call metricool_list_brands first');

  const qs = new URLSearchParams({
    blogId: String(blogId),
    userId: config.metricool.userId,
    from: toIso(start),
    to: toIso(end, true),
  });
  const url = `${config.metricool.baseUrl}/v2/analytics/${kind}/${network}?${qs}`;
  const data = await getJson(url, { headers: auth(), secrets: secrets() });
  const rows = data?.data ?? data ?? [];
  return { kind, network, blogId, from: toIso(start), to: toIso(end, true), count: Array.isArray(rows) ? rows.length : null, rows };
}

// Escape hatch for any Metricool GET not wrapped above.
export async function raw({ path, query = {} }) {
  requireKeys();
  if (!/^\/[A-Za-z0-9/_\-.]*$/.test(path)) throw new Error('invalid path');
  const qs = new URLSearchParams({ userId: config.metricool.userId, ...query });
  const url = `${config.metricool.baseUrl}${path}?${qs}`;
  return getJson(url, { headers: auth(), secrets: secrets() });
}
