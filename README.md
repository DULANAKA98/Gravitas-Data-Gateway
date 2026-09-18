# Gravitas Data Gateway

Ask an AI assistant about your clients' social media performance, in plain
English. It pulls live numbers from Metricool and Meta.

> how did CIMB Malaysia's Instagram do last week?

> compare Pocky's Facebook and Instagram engagement this month

> which 7DAYS TikTok post performed best in September?

Works in **Claude Code** and **Codex**. Setup is two commands and takes a minute.

---

## Setup

You need an access token. Ask Dulanaka for one — it is a short phrase he will
give you. Everything below refers to it as `YOUR_TOKEN`.

### Claude Code

Paste these two lines into Claude Code, one at a time:

```
/plugin marketplace add DULANAKA98/Gravitas-Data-Gateway
```

```
/plugin install dulanaka-gateway
```

Then set your token. On **Windows**, paste this into Command Prompt:

```
setx DULANAKA_GATEWAY_TOKEN "YOUR_TOKEN"
```

On **Mac**, paste this into Terminal:

```
echo 'export DULANAKA_GATEWAY_TOKEN="YOUR_TOKEN"' >> ~/.zshrc && source ~/.zshrc
```

Close Claude Code and open it again. That is it.

### Codex

Paste this into your terminal, replacing `YOUR_TOKEN`:

```
codex mcp add gravitas --url https://167-233-142-168.sslip.io/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

If your version of Codex does not have `codex mcp add`, open `~/.codex/config.toml`
in any text editor and add these three lines at the bottom:

```toml
[mcp_servers.gravitas]
url = "https://167-233-142-168.sslip.io/mcp"
http_headers = { Authorization = "Bearer YOUR_TOKEN" }
```

Restart Codex.

### Checking it worked

Ask your assistant:

> which clients can you see in the Gravitas gateway?

It should list frisogoldmy, 7DAYS, CIMB Malaysia and Pocky. If it says it has no
such tool, close the app completely and reopen it — the token is only read at
startup.

---

## What you can ask for

**Clients:** frisogoldmy, 7DAYS, CIMB Malaysia, Pocky
**Networks:** Instagram, Facebook, TikTok, YouTube (varies by client)

Posts, stories and reels with their engagement numbers, for any date range.
For CIMB Malaysia there is also direct Meta data: reach, follower counts and
page metrics.

You never need to remember a client ID or a date format. Just ask.

## What it cannot do

It is read-only. It cannot post, schedule, edit, delete, or touch ad spend.
There is no tool here that changes anything, by design.

---

## Troubleshooting

**"I don't have access to that tool"** — close the app fully and reopen it.
Environment variables are read once at startup.

**"Invalid or missing token"** — your token may have been revoked, or there is a
typo. Check with Dulanaka.

**"This access link does not cover X"** — your token is scoped to certain
clients only. Ask Dulanaka to widen it.

**Nothing comes back for a client** — some brands have no connected social
accounts, so there is genuinely nothing to pull.

---

## For whoever runs the gateway

`server/` holds the gateway. Node 20 or newer.

```
cd server && npm install
```

Secrets live in an environment file readable only by root:

```
METRICOOL_TOKEN=<from Metricool settings>
METRICOOL_USER_ID=<numeric user id>
META_ACCESS_TOKEN=<page access token>
META_PAGE_ID=<numeric page id>
META_INSTAGRAM_ACCOUNT_ID=<numeric ig business account id>
```

Issue and revoke access tokens:

```
node bin/token.mjs new "Sarah" "CIMB Malaysia"     # one client only
node bin/token.mjs new "Team" all                  # everything
node bin/token.mjs new "Team" all my-chosen-phrase # pick the value yourself
node bin/token.mjs list                            # who has one, and their usage
node bin/token.mjs revoke "Sarah"                  # kill one, others unaffected
```

Chosen values must be at least 16 characters. A single dictionary word is
guessable on a public host; the gateway rejects anything shorter.

`server/dulanaka-gateway.service` and `server/Caddyfile` are the systemd unit
and reverse proxy config used in production.

### How access works

The Metricool and Meta API keys never leave the server. Users hold a revocable
token that lets them read through the gateway and nothing else. If a user's
token leaks you revoke that one token; the upstream keys are untouched and
nobody else is disrupted.

Credentials are accepted in request headers only — never in a URL — because
query strings end up in server logs, proxy logs and browser history.

Every request is logged with the token label, source address and what was asked
for. Rate limited per source address, with lockout after repeated failures.

## Notes on the upstream APIs

Metricool's v1 stats paths return 404. The live surface used here is
`/api/v2/analytics/{posts,stories,reels}/{network}` with ISO `from` and `to`
timestamps. Brands come from v1 `/admin/simpleProfiles`.

Meta deprecated `page_impressions`, `page_fans` and `page_impressions_unique`;
they error on current API versions. Working alternatives are documented in the
bundled skill.

## Licence

MIT
