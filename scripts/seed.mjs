// Seeds a Jira project with a realistic decision history, through the REAL pipeline:
// it creates issues and comments, and Precedent's triggers capture the decisions.
//
// Run it yourself in your own terminal (your token never leaves your machine):
//   export JIRA_SITE=https://YOUR-SITE.atlassian.net
//   export JIRA_EMAIL=you@example.com
//   export JIRA_API_TOKEN=...          # id.atlassian.com > Security > API tokens
//   export PROJECT=BILL                # an existing project key on that site
//   npm run seed
//
// Step 1 writes the history. Triggers can take up to ~3 minutes, so step 2 (new issues
// that go against the history) waits, then creates them so the warning comments fire.

const { JIRA_SITE, JIRA_EMAIL, JIRA_API_TOKEN, PROJECT, SKIP_WAIT } = process.env;
if (!JIRA_SITE || !JIRA_EMAIL || !JIRA_API_TOKEN || !PROJECT) {
  console.error('Set JIRA_SITE, JIRA_EMAIL, JIRA_API_TOKEN and PROJECT first (see the top of this file).');
  process.exit(1);
}
const base = JIRA_SITE.replace(/\/$/, '');
const auth = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

async function jira(path, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json();
}

const adf = (text) => ({ type: 'doc', version: 1, content: text.split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) });

let issueTypeId;
async function createIssue(summary, description) {
  if (!issueTypeId) {
    const meta = await jira(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes`);
    const types = meta.issueTypes || meta.values || [];
    issueTypeId = (types.find((t) => /^(task|story)$/i.test(t.name)) || types.find((t) => !t.subtask))?.id;
    if (!issueTypeId) throw new Error(`No usable issue type in ${PROJECT}`);
  }
  const r = await jira('/rest/api/3/issue', { fields: { project: { key: PROJECT }, summary, description: adf(description), issuetype: { id: issueTypeId } } });
  console.log(`  created ${r.key}: ${summary}`);
  return r.key;
}
const comment = (key, text) => jira(`/rest/api/3/issue/${key}/comment`, { body: adf(text) });
const link = (a, b) => jira('/rest/api/3/issueLink', { type: { name: 'Relates' }, inwardIssue: { key: a }, outwardIssue: { key: b } }).catch((e) => console.warn('  (link skipped)', e.message));

const HISTORY = [
  {
    summary: 'Pick the datastore for the new billing service',
    description: 'Invoices, credits and refunds need to stay consistent. Options: Postgres, DynamoDB.',
    comments: [
      'Spiked both. DynamoDB is cheaper at idle but cross-invoice transactions get ugly fast.',
      'DECISION: Use Postgres over DynamoDB for the billing service\nWhy: multi-row transactions across invoices and refunds; the team already runs Postgres well.',
    ],
  },
  {
    summary: 'Browser support policy for the customer portal',
    description: 'IE11 is 0.08% of portal sessions and blocks modern CSS and JS.',
    comments: ['After talking to support and sales, we won\'t support IE11 in the customer portal anymore. Enterprise customers were notified in March.'],
  },
  {
    summary: 'Feature flag approach for billing rollouts',
    description: 'We have three homegrown toggle systems. Consolidate.',
    comments: ['DECISION: Feature flags go through LaunchDarkly, not homegrown config toggles\nWhy: audit trail, percentage rollouts, one place to kill a feature.'],
  },
  {
    summary: 'Event bus for invoice lifecycle events',
    description: 'Downstream consumers (analytics, emails, ledger) need invoice events.',
    comments: ['DECISION: Use Kafka rather than SQS for invoice events\nWhy: replay for the ledger rebuild, ordering per invoice.'],
  },
  {
    summary: 'Public API style',
    description: 'Partners asked for GraphQL. We have REST + OpenAPI today.',
    comments: ['DECISION: We decided not to build a GraphQL gateway for public APIs\nWhy: two API surfaces to secure and version; partners are fine with REST + webhooks.'],
  },
  {
    summary: 'Release cadence for the billing mobile app',
    description: 'Ad-hoc releases keep colliding with app store review.',
    comments: ['We agreed to ship mobile releases every second Tuesday, with a code freeze the Friday before.'],
  },
];

const AGAINST = [
  { summary: 'Migrate billing service to DynamoDB to cut hosting costs', description: 'The Postgres instance costs too much. DynamoDB on-demand would be cheaper.', linkTo: 0 },
  { summary: 'Add IE11 polyfills to the customer portal for Contoso', description: 'Contoso still runs IE11 on their finance desktops and wants the portal.' },
  { summary: 'Add a small config toggle for the new invoice PDF layout', description: 'Quick homegrown config toggle so we can turn the new layout on per customer.' },
];

console.log(`Seeding ${PROJECT} on ${base}`);
console.log('Step 1: decision history');
const keys = [];
for (const h of HISTORY) {
  const k = await createIssue(h.summary, h.description);
  keys.push(k);
  for (const c of h.comments) await comment(k, c);
}

if (!SKIP_WAIT) {
  console.log('Waiting 3 minutes so Precedent\'s comment triggers finish capturing decisions…');
  await new Promise((r) => setTimeout(r, 180_000));
}

console.log('Step 2: new work that goes against the history');
for (const a of AGAINST) {
  const k = await createIssue(a.summary, a.description);
  if (a.linkTo != null) await link(k, keys[a.linkTo]);
}
console.log('\nDone. Open the issues above: the Precedent panel and warning comments should appear within ~3 minutes.');
console.log('Two history comments were written as plain prose, so they appear as "suggested" decisions to confirm in the panel.');
