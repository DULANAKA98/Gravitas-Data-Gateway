---
name: social-analytics
description: Pull and analyse social media performance for Gravitas client brands via the Dulanaka Data Gateway. Use when asked about a client's posts, reach, engagement, follower growth or how content performed on Instagram, Facebook, TikTok or YouTube — for example "how did CIMB do last week", "compare Pocky's Instagram vs Facebook", "which 7DAYS post performed best".
---

# Social analytics via the Dulanaka Data Gateway

Read-only access to two data sources for Gravitas client brands. The gateway
holds the upstream API credentials; these tools never see them.

## Start here

Call `list_clients` first. It returns the brands this access token covers, each
with a `blogId` and its connected networks. Never guess a `blogId` — they are
account-specific, and a wrong one returns an error or another brand's data.

## Choosing a source

**Metricool** (`metricool_content`) — use for almost everything. Covers
Instagram, Facebook, TikTok, YouTube and more, so it is the only way to compare
across networks. Returns published posts with per-post metrics.

**Meta** (`meta_ig_insights`, `meta_ig_media`, `meta_page_insights`) — account-level
metrics straight from Facebook and Instagram: reach, follower counts, page views.
Covers only the gateway's default Meta account, not every client. Reach for it
when the question is about reach or followers rather than individual posts.

If a request needs both — "how did reach track against what we posted" — call
both and join on dates yourself.

## Date handling

All dates are `YYYY-MM-DD`. `metricool_content` requires explicit `start` and
`end`. When someone says "last week" or "this month", resolve it to real dates
before calling, and state the range you used so they can check it.

## Metric names that do not work

Meta deprecated several Page metrics. These error on the current API version:

- `page_impressions`
- `page_fans`
- `page_impressions_unique`

Use instead: `page_views_total`, `page_post_engagements`, `page_follows`,
`page_daily_follows`, `page_actions_post_reactions_total`.

For Instagram, `reach` is confirmed working. Others may need a different `period`.

## Analysing results

- Engagement rate is already computed per post by Metricool. Do not recompute it
  from raw likes unless asked, and say which figure you used.
- Post volume varies a lot by network. Comparing totals across networks without
  normalising by post count is usually misleading; say so when it applies.
- A brand with no connected networks has nothing to pull. Report that plainly
  rather than presenting an empty result as a finding.

## Scope and failure

An access token may cover only some clients. If a tool returns a scope error,
tell the user their link does not cover that client and who to ask. Do not retry
other clients hoping one works.

This gateway is read-only. Nothing here posts, edits or deletes; send those
requests back to the platform itself.
