const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// A normal sign-in form on the gateway's own origin. The password is posted in
// a request body, never placed in a URL, and never handled by an AI agent.
export function consentPage({ client, params, error }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to Gravitas Data Gateway</title>
<style>
  :root{--bg:#fbfbfa;--fg:#1a1a18;--muted:#6b6b66;--line:#e4e4e0;--accent:#2f6f4f;--err:#b3261e;--card:#fff}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#17171a;--fg:#e9e9e6;--muted:#9a9a94;--line:#2c2c30;--accent:#7fc7a0;--err:#f2b8b5;--card:#1e1e22}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);
       font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px}
  .card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:28px}
  h1{font-size:1.15rem;margin:0 0 6px;letter-spacing:-.01em}
  p.sub{color:var(--muted);font-size:.9rem;margin:0 0 22px}
  .who{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:20px;font-size:.88rem}
  .who b{font-weight:600}
  label{display:block;font-size:.85rem;font-weight:600;margin-bottom:6px}
  input[type=password]{width:100%;padding:10px 12px;font-size:1rem;border:1px solid var(--line);
       border-radius:8px;background:var(--bg);color:var(--fg)}
  input:focus{outline:2px solid var(--accent);outline-offset:1px}
  button{width:100%;margin-top:16px;padding:11px;font-size:.95rem;font-weight:600;border:0;border-radius:8px;
       background:var(--accent);color:#fff;cursor:pointer}
  button:hover{opacity:.92}
  .err{color:var(--err);font-size:.85rem;margin-top:10px}
  ul{margin:10px 0 0;padding-left:18px;color:var(--muted);font-size:.83rem}
  li{margin:3px 0}
  footer{margin-top:20px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:.78rem}
</style></head>
<body>
<form class="card" method="POST" action="/oauth/authorize">
  <h1>Gravitas Data Gateway</h1>
  <p class="sub">Social media analytics for Gravitas clients</p>

  <div class="who"><b>${esc(client.client_name)}</b> is asking to connect.
    <ul>
      <li>Read post and account metrics</li>
      <li>Read-only — it cannot post, edit or delete</li>
    </ul>
  </div>

  <label for="pw">Access password</label>
  <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
  ${error ? `<div class="err">${esc(error)}</div>` : ''}

  <input type="hidden" name="client_id" value="${esc(params.client_id)}">
  <input type="hidden" name="redirect_uri" value="${esc(params.redirect_uri)}">
  <input type="hidden" name="state" value="${esc(params.state)}">
  <input type="hidden" name="code_challenge" value="${esc(params.code_challenge)}">
  <input type="hidden" name="code_challenge_method" value="${esc(params.code_challenge_method)}">

  <button type="submit">Connect</button>
  <footer>Ask Dulanaka for the password if you do not have it.</footer>
</form>
</body></html>`;
}
