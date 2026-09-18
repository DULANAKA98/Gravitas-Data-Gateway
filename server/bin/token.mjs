#!/usr/bin/env node
// Mint, list and revoke access links.
import { mint, revoke, list } from '../src/tokens.js';
import { config } from '../src/config.js';

const [, , cmd, ...rest] = process.argv;
const base = config.publicUrl.replace(/\/$/, '');

function show() {
  const rows = list();
  if (!rows.length) {
    console.log('no links issued yet');
    return;
  }
  console.log('\n LABEL                 PREFIX        SCOPE    USES  LAST USED            STATE');
  for (const r of rows) {
    console.log(
      ` ${r.label.padEnd(20)}  ${r.prefix.padEnd(12)}  ${String(r.scope).padEnd(7)}  ${String(r.uses).padStart(4)}  ${(r.lastUsed || '-').slice(0, 19).padEnd(19)}  ${r.revoked ? 'REVOKED' : 'active'}`,
    );
  }
  console.log('');
}

if (cmd === 'new') {
  const label = rest[0];
  const scope = rest[1] || 'all';
  if (!label) {
    console.error('usage: token new "<who it is for>" [client1,client2|all]');
    process.exit(1);
  }
  const t = mint({ label, scope });
  console.log(`\nAccess link for ${label} (scope: ${scope}):\n\n  ${base}/d/${t}\n\nThat link is the credential - anyone holding it has this access.\nRevoke it alone with:  token revoke "${label}"\n`);
} else if (cmd === 'revoke') {
  const n = revoke(rest[0] || '');
  console.log(n ? `revoked ${n} link(s)` : 'nothing matched');
} else if (cmd === 'list') {
  show();
} else {
  console.log('usage:\n  token new "<label>" [scope]   scope is "all" or a comma list of client names\n  token list\n  token revoke <prefix|label>');
}
