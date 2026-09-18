import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { checkRateOnly } from './auth.js';
import { audit } from './audit.js';
import { resolve as resolveToken, allowsClient } from './tokens.js';
import { verifyAccess } from './oauth/store.js';
import * as metricool from './providers/metricool.js';
import * as meta from './providers/meta.js';

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function fail(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

// Auth happens once, at the transport, from the Authorization header the client
// was configured with. No tool asks anyone to type a secret.
function gated({ ip, holder }, name, handler) {
  return async (args = {}) => {
    try {
      const data = await handler(args);
      audit({ event: 'mcp.tool', ip, who: holder.label, tool: name, args });
      return ok(data);
    } catch (err) {
      audit({ event: 'mcp.error', ip, who: holder.label, tool: name, error: err.message });
      return fail(err.message);
    }
  };
}

export function buildMcpServer(ctx) {
  const server = new McpServer({ name: 'Dulanaka Data Gateway', version: '2.0.0' });
  const g = (name, cfg, handler) => server.registerTool(name, cfg, gated(ctx, name, handler));

  // Scope check for tools that name a brand.
  const scoped = (label) => {
    if (!allowsClient(ctx.holder, label)) {
      const e = new Error(`This access link does not cover ${label}.`);
      e.status = 403;
      throw e;
    }
  };

  g('list_clients', {
    title: 'List clients',
    description: 'List the client brands available through this gateway, with their blogId and connected networks. Call this first to find a blogId.',
    inputSchema: {},
  }, async () => {
    const all = await metricool.listBrands();
    return all.filter((b) => allowsClient(ctx.holder, b.label));
  });

  g('metricool_content', {
    title: 'Metricool: posts, stories or reels',
    description: 'Published content and its metrics for one client and network over a date range. kind=posts works for all networks; stories and reels are Instagram and Facebook only.',
    inputSchema: {
      kind: z.enum(['posts', 'stories', 'reels']),
      network: z.enum(['instagram', 'facebook', 'tiktok', 'twitter', 'linkedin', 'youtube', 'pinterest']),
      blogId: z.union([z.string(), z.number()]).describe('From list_clients'),
      start: z.string().describe('YYYY-MM-DD'),
      end: z.string().describe('YYYY-MM-DD'),
    },
  }, async (a) => {
    const all = await metricool.listBrands();
    const b = all.find((x) => String(x.blogId) === String(a.blogId));
    if (b) scoped(b.label);
    return metricool.content(a);
  });

  g('meta_ig_insights', {
    title: 'Meta: Instagram insights',
    description: 'Instagram business account metrics, straight from the Graph API. Verified working metric: reach. Covers the gateway default Instagram account only.',
    inputSchema: {
      metrics: z.array(z.string()).describe('e.g. ["reach"]'),
      period: z.enum(['day', 'week', 'days_28', 'lifetime']).optional(),
      since: z.string().optional(),
      until: z.string().optional(),
    },
  }, (a) => meta.igUserInsights(a));

  g('meta_ig_media', {
    title: 'Meta: recent Instagram posts',
    description: 'Recent Instagram media with like and comment counts.',
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  }, (a) => meta.igMedia(a));

  g('meta_page_insights', {
    title: 'Meta: Facebook page insights',
    description: 'Facebook Page metrics. Verified working: page_views_total, page_post_engagements, page_follows, page_daily_follows, page_actions_post_reactions_total. Note page_impressions, page_fans and page_impressions_unique are deprecated on v21 and will error.',
    inputSchema: {
      metrics: z.array(z.string()),
      period: z.enum(['day', 'week', 'days_28', 'lifetime']).optional(),
      since: z.string().optional(),
      until: z.string().optional(),
    },
  }, (a) => meta.pageInsights(a));

  return server;
}

export async function handleMcpRequest(req, res, ip) {
  const rl = checkRateOnly(ip);
  if (!rl.ok) {
    res.status(rl.status).json({ jsonrpc: '2.0', error: { code: -32000, message: rl.error } });
    return;
  }

  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

  // Two ways in: an OAuth access token from the sign-in flow, or a capability
  // token issued from the CLI. Both resolve to the same holder shape.
  const oauthHolder = verifyAccess(bearer);
  const capHolder = oauthHolder ? null : resolveToken(bearer);
  const holder = oauthHolder || (capHolder && !capHolder.revoked ? capHolder : null);

  if (!holder) {
    audit({ event: 'mcp.denied', ip, reason: capHolder?.revoked ? 'revoked' : 'unknown' });
    const base = `${req.protocol}://${req.get('host')}`;
    res.set('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Authentication required. Connect through the gateway sign-in, or supply an access token issued by the gateway operator.' },
    });
    return;
  }

  const server = buildMcpServer({ ip, holder });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
