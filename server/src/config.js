// Central config. Everything secret comes from the environment, never from git.
export const config = {
  port: Number(process.env.PORT || 8790),
  bindHost: process.env.BIND_HOST || '127.0.0.1',
  publicUrl: process.env.PUBLIC_URL || 'https://dulanaka-data-gateway.duckdns.org',

  // Shared access password. No default on purpose - refuse to boot without it.
  password: process.env.GATEWAY_PASSWORD,

  metricool: {
    baseUrl: process.env.METRICOOL_BASE_URL || 'https://app.metricool.com/api',
    token: process.env.METRICOOL_TOKEN,
    userId: process.env.METRICOOL_USER_ID,
  },

  meta: {
    baseUrl: process.env.META_BASE_URL || 'https://graph.facebook.com',
    apiVersion: process.env.META_API_VERSION || 'v21.0',
    accessToken: process.env.META_ACCESS_TOKEN,
    // Defaults so an agent can omit ids for the common case.
    defaultPageId: process.env.META_PAGE_ID || null,
    defaultIgUserId: process.env.META_INSTAGRAM_ACCOUNT_ID || null,
    defaultPageLabel: process.env.META_PAGE_LABEL || 'CIMB Malaysia',
  },

  rateLimit: {
    windowMs: 60_000,
    maxPerWindow: Number(process.env.RATE_LIMIT_PER_MIN || 30),
    maxFailedAuth: Number(process.env.MAX_FAILED_AUTH || 5),
    lockoutMs: Number(process.env.LOCKOUT_MS || 900_000), // 15 min
  },

  tokenStorePath: process.env.TOKEN_STORE_PATH || '/var/lib/dulanaka-gateway/tokens.json',
  auditLogPath: process.env.AUDIT_LOG_PATH || '/var/log/dulanaka-gateway/audit.log',
};

export function assertBootConfig() {
  const missing = [];
  if (!config.password) missing.push('GATEWAY_PASSWORD');
  if (missing.length) {
    console.error(`[boot] refusing to start, missing required env: ${missing.join(', ')}`);
    process.exit(1);
  }
  const warn = [];
  if (!config.metricool.token) warn.push('METRICOOL_TOKEN (metricool tools will return a clear error)');
  if (!config.meta.accessToken) warn.push('META_ACCESS_TOKEN (meta tools will return a clear error)');
  for (const w of warn) console.warn(`[boot] not configured: ${w}`);
}
