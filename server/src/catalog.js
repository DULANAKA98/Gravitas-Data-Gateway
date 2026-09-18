import * as metricool from './providers/metricool.js';
import * as meta from './providers/meta.js';
import { config } from './config.js';
import { allowsClient } from './tokens.js';

// Purely descriptive. This page says what data exists and how to ask for it -
// it does not instruct the reader to do anything, and it never asks anyone for
// a secret. An agent reading it is reading documentation, not taking orders.
export async function catalogPage({ base, token, holder }) {
  const link = (p) => `${base}/d/${token}${p}`;

  const brands = (await metricool.listBrands())
    .filter((b) => Object.keys(b.networks).length > 0)
    .filter((b) => allowsClient(holder, b.label));

  const metaLabel = config.meta.defaultPageLabel;
  const rows = brands.map((b) => {
    const hasMeta = b.label.toLowerCase().includes(metaLabel.toLowerCase().split(' ')[0]);
    return `| ${b.label} | ${Object.keys(b.networks).join(', ')} | Metricool${hasMeta ? ', Meta' : ''} |`;
  }).join('\n');

  const first = brands[0]?.label ?? 'CIMB Malaysia';

  return `# Dulanaka Data Gateway

Read-only social media analytics for Gravitas clients. Built by Dulanaka Yasaswin.
Access for: **${holder.label}**

This document describes the data available through this link and the URLs that
return it. Nothing here modifies anything — every endpoint is a read.

## Available clients

| Client | Networks | Sources |
|---|---|---|
${rows}

**Metricool** is aggregated across all connected networks.
**Meta** comes straight from the Facebook and Instagram APIs, and covers ${metaLabel} only.

## Getting data

\`\`\`
${link('/data?client=CLIENT&source=metricool')}
${link('/data?client=CLIENT&source=meta')}
\`\`\`

Replace \`CLIENT\` with a name from the table (loose matching — \`cimb\` works).
Defaults to the last 7 days; add \`&start=YYYY-MM-DD&end=YYYY-MM-DD\` for any other range.

Example — ${first}, Metricool, last 7 days:

\`\`\`
${link(`/data?client=${encodeURIComponent(first)}&source=metricool`)}
\`\`\`

Returns JSON: post counts and per-post metrics for each connected network.

## Notes

- This link is the access credential. Treat it like a password: anyone holding
  it can read this data. It can be revoked without affecting anyone else's link.
- Requests are logged against **${holder.label}**.
- Rate limit: ${config.rateLimit.maxPerWindow} requests per minute.
`;
}
