// Register quickiefix.app custom domains on Firebase Hosting via REST and
// print the DNS records Namecheap needs.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const store = JSON.parse(
  readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'),
);
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: store.tokens.refresh_token,
    grant_type: 'refresh_token',
  }),
});
const { access_token } = await tokenRes.json();
const H = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

const MAP = [
  { site: 'quickiefix-2ea2a', domain: 'quickiefix.app' },
  { site: 'quickiefix-2ea2a', domain: 'www.quickiefix.app' },
  { site: 'quickiefix-app', domain: 'my.quickiefix.app' },
  { site: 'quickiefix-portal', domain: 'portal.quickiefix.app' },
];

for (const { site, domain } of MAP) {
  const base = `https://firebasehosting.googleapis.com/v1beta1/projects/quickiefix-2ea2a/sites/${site}/customDomains`;
  // Create (idempotent-ish: 409 means it already exists)
  const create = await fetch(`${base}?customDomainId=${domain}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({}),
  });
  const created = await create.json();
  console.log(`\n=== ${domain} → ${site} : create ${create.status}${created.error ? ' ' + created.error.message : ''}`);
  // Fetch state + required DNS updates
  const get = await fetch(`${base}/${domain}`, { headers: H });
  const d = await get.json();
  if (d.error) { console.log('  GET failed:', d.error.message); continue; }
  console.log(`  ownershipState=${d.ownershipState} certState=${d.certState} hostState=${d.hostState}`);
  const updates = d.requiredDnsUpdates?.desired ?? [];
  for (const u of updates) {
    for (const r of u.records ?? []) {
      console.log(`  DNS NEEDED: host=${r.domainName} type=${r.type} value=${r.rdata}`);
    }
  }
}
