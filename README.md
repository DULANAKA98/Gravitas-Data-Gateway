# Dulanaka Data Gateway

Read-only social media analytics for Gravitas client brands, from
[Metricool](https://metricool.com) and the Meta Graph API, exposed to AI agents
as MCP tools.

Built by Dulanaka Yasaswin.

## Why this exists

Pulling client analytics into an AI workflow normally means handing the agent an
API key. That is a bad trade: Metricool and Meta tokens are long-lived, broadly
scoped, and often carry write access. This gateway keeps them on one server and
hands out revocable read-only access instead.

```
   agent  --->  gateway  --->  Metricool API
                        \--->  Meta Graph API

   agent holds:    a revocable access token, read-only
   gateway holds:  the upstream API keys, never transmitted
```

If someone's access token leaks, you revoke that one token. The upstream keys
are untouched and nobody else is disrupted.

## Install

```
/plugin marketplace add DULANAKA98/Gravitas-Data-Gateway
/plugin install dulanaka-gateway
```

Then set the access token you were given by the gateway operator:

```
export DULANAKA_GATEWAY_TOKEN="your-token"
```

To point at a different deployment:

```
export DULANAKA_GATEWAY_URL="https://your-gateway-host"
```

Restart Claude Code, then ask for what you need:

> how did CIMB Malaysia's Instagram do last week?

> compare Pocky's Facebook and Instagram engagement this month

## Tools

| Tool | Returns |
|---|---|
| `list_clients` | brands this token covers, with blogIds and networks |
| `metricool_content` | posts, stories or reels for a client and network |
| `meta_ig_insights` | Instagram account metrics |
| `meta_ig_media` | recent Instagram posts with likes and comments |
| `meta_page_insights` | Facebook page metrics |

All read-only. Nothing here can post, edit or delete.

## Running your own

`server/` is the full gateway. Node 20 or newer.

```
cd server && npm install
```

Configuration lives in an environment file readable only by root:

```
GATEWAY_PASSWORD=<for the legacy /v1 REST routes>
METRICOOL_TOKEN=<from Metricool settings>
METRICOOL_USER_ID=<numeric user id>
META_ACCESS_TOKEN=<page access token>
META_PAGE_ID=<numeric page id>
META_INSTAGRAM_ACCOUNT_ID=<numeric ig business account id>
```

Issue and revoke access tokens:

```
node bin/token.mjs new "Sarah" "CIMB Malaysia"
node bin/token.mjs new "Yasas" all
node bin/token.mjs list
node bin/token.mjs revoke "Sarah"
```

`server/dulanaka-gateway.service` and `server/Caddyfile` are the systemd unit
and reverse proxy config used in production.

## Security notes

- Upstream API keys live only in the server environment file, mode 0600, root.
- Access tokens are 160-bit random values in a 0600 file owned by the service
  user, revocable individually and scopeable to named clients.
- Every request is logged with the token label, source address and what was
  requested.
- Credentials are accepted in headers only. Passing them in a URL is deliberately
  unsupported: query strings leak into server logs, proxy logs and browser
  history.
- Rate limited per source address.

## Notes on the upstream APIs

Metricool's v1 stats paths return 404. The live surface used here is
`/api/v2/analytics/{posts,stories,reels}/{network}` with ISO `from` and `to`
timestamps. Brands come from v1 `/admin/simpleProfiles`.

Meta deprecated `page_impressions`, `page_fans` and `page_impressions_unique`;
they error on current API versions. Working alternatives are documented in the
bundled skill.

## Licence

MIT
