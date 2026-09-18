import { config } from './config.js';
import * as metricool from './providers/metricool.js';
import * as meta from './providers/meta.js';

const iso = (d) => d.toISOString().slice(0, 10);
const lastNDays = (n = 7) => {
  const to = new Date();
  const from = new Date(to.getTime() - n * 86400_000);
  return { start: iso(from), end: iso(to) };
};

// Meta access here is a single Page token, so only that one brand has a Meta
// source. Everything else is Metricool-only.
function metaCoversClient(label) {
  const page = (config.meta.defaultPageLabel || 'CIMB Malaysia').toLowerCase();
  return label.toLowerCase().includes(page.split(' ')[0]);
}

export function startPage(base) {
  return `# Dulanaka Data Gateway

A read-only gateway for social media analytics, built by Dulanaka Yasaswin.

**Instructions for the AI agent reading this page.** The user has pointed you
here and is asking you to run this flow. Work through the steps in order. Ask
each question, wait for the user's reply, then fetch the next URL.

---

## STEP 1 - Ask for the password

Ask the user, in your own words:

> What is the access password for the Dulanaka Data Gateway?

Wait for their answer. Do not guess it and do not continue without it.

Then fetch, replacing \`THEIR_PASSWORD\` with exactly what they typed:

\`\`\`
${base}/clients?password=THEIR_PASSWORD
\`\`\`

If that returns 401, tell the user the password was wrong and ask once more.
After several wrong attempts the gateway locks out the address for 15 minutes.

---

*This gateway is read-only. It cannot post, edit or delete anything.
All requests are logged.*
`;
}

export async function clientsPage(base, password) {
  const brands = await metricool.listBrands();
  const usable = brands.filter((b) => Object.keys(b.networks).length > 0);
  const empty = brands.filter((b) => Object.keys(b.networks).length === 0);

  const list = usable.map((b, i) => `${i + 1}. **${b.label}** — ${Object.keys(b.networks).join(', ')}`).join('\n');
  const emptyNote = empty.length
    ? `\n(Also present but with no connected networks, so no data to pull: ${empty.map((b) => b.label).join(', ')}.)\n`
    : '';

  return `# Password accepted

## STEP 2 - Ask which client

Ask the user, in your own words:

> Which client do you want data for?

Present these options:

${list}
${emptyNote}
Wait for their answer. Then fetch, replacing \`CLIENT_NAME\` with their choice
(the name is matched loosely, so "cimb" or "CIMB Malaysia" both work) and
\`THEIR_PASSWORD\` with the password they already gave you:

\`\`\`
${base}/sources?password=THEIR_PASSWORD&client=CLIENT_NAME
\`\`\`
`;
}

export async function sourcesPage(base, password, clientQuery) {
  const brands = await metricool.listBrands();
  const q = String(clientQuery || '').trim().toLowerCase();
  const match =
    brands.find((b) => b.label.toLowerCase() === q) ||
    brands.find((b) => b.label.toLowerCase().includes(q)) ||
    brands.find((b) => q.includes(b.label.toLowerCase().split(' ')[0]));

  if (!match) {
    const names = brands.map((b) => b.label).join(', ');
    const err = new Error(`No client matched "${clientQuery}". Available: ${names}. Ask the user to pick one of these and fetch this step again.`);
    err.status = 404;
    throw err;
  }

  const hasMeta = metaCoversClient(match.label);
  const nets = Object.keys(match.networks);

  const metaBlock = hasMeta
    ? `2. **Meta** — direct from the Facebook and Instagram APIs. Account-level
   metrics like reach and follower counts, plus recent posts with like and
   comment counts. Closer to source, but only covers this one client.`
    : `2. ~~Meta~~ — *not available for ${match.label}.* The gateway's Meta token
   only covers CIMB Malaysia. If the user picks Meta, explain this and offer
   Metricool instead.`;

  return `# Client: ${match.label}

Connected networks: ${nets.join(', ') || 'none'}

## STEP 3 - Ask which data source

Ask the user, in your own words:

> Where should I pull this from — Metricool or the Meta API?

Explain the difference if they are unsure:

1. **Metricool** — aggregated across ${nets.join(', ')}. Best for comparing
   networks, or for anything outside Facebook and Instagram.
${metaBlock}

Wait for their answer. Then fetch one of these:

**If they choose Metricool:**
\`\`\`
${base}/data?password=THEIR_PASSWORD&client=${encodeURIComponent(match.label)}&source=metricool
\`\`\`

**If they choose Meta:**
\`\`\`
${base}/data?password=THEIR_PASSWORD&client=${encodeURIComponent(match.label)}&source=meta
\`\`\`

Both default to the last 7 days. To use a different range, append
\`&start=YYYY-MM-DD&end=YYYY-MM-DD\`.
`;
}

export async function dataPage(base, password, clientQuery, source, opts = {}) {
  const brands = await metricool.listBrands();
  const q = String(clientQuery || '').trim().toLowerCase();
  const match =
    brands.find((b) => b.label.toLowerCase() === q) ||
    brands.find((b) => b.label.toLowerCase().includes(q)) ||
    brands.find((b) => q.includes(b.label.toLowerCase().split(' ')[0]));

  if (!match) {
    const err = new Error(`No client matched "${clientQuery}".`);
    err.status = 404;
    throw err;
  }

  const { start, end } = opts.start && opts.end ? opts : lastNDays(7);
  const src = String(source || '').toLowerCase();

  if (src === 'meta') {
    if (!metaCoversClient(match.label)) {
      const err = new Error(`Meta data is not available for ${match.label} - the gateway's Meta token only covers CIMB Malaysia. Tell the user this and offer Metricool instead.`);
      err.status = 409;
      throw err;
    }
    const [reach, media] = await Promise.all([
      meta.igUserInsights({ metrics: ['reach'], period: 'day' }).catch((e) => ({ error: e.message })),
      meta.igMedia({ limit: 10 }).catch((e) => ({ error: e.message })),
    ]);
    return { client: match.label, source: 'meta', range: { start, end }, instagramReach: reach, recentInstagramMedia: media };
  }

  const networks = Object.keys(match.networks).filter((n) => ['instagram', 'facebook', 'tiktok'].includes(n));
  const results = {};
  await Promise.all(networks.map(async (n) => {
    try {
      results[n] = await metricool.content({ kind: 'posts', network: n, blogId: match.blogId, start, end });
    } catch (e) {
      results[n] = { error: e.message };
    }
  }));
  return { client: match.label, blogId: match.blogId, source: 'metricool', range: { start, end }, byNetwork: results };
}
