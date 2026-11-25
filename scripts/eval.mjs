const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const { compare } = await import(root + '/src/engine/conflict.js');
const { extractDecisions, detectAlternatives } = await import(root + '/src/engine/extract.js');
const D = (s, p='adopt') => ({ statement: s, title: s, polarity: p, alternatives: p==='adopt'?detectAlternatives(s):[] });
const cases = [
 [D('Standardize on React instead of Angular for all new frontends'), 'Build the admin dashboard in Angular', 'revives'],
 [D('Use GitHub Actions rather than Jenkins for CI'), 'Set up a Jenkins pipeline for the mobile app', 'revives'],
 [D("We won't store card numbers ourselves", 'reject'), 'Store card numbers in our database to speed up checkout', 'revives'],
 [D('Use Okta for SSO'), 'Remove Okta and roll our own login', 'reverses'],
 [D('All services deploy to Kubernetes'), 'Move the reporting service off Kubernetes onto plain EC2', 'reverses'],
 [D('Use Kafka over SQS for order events'), 'Add a consumer group for order events in Kafka', 'aligned'],
 [D('Use Kafka over SQS for order events'), 'Investigate flaky order event tests', 'related'],
 [D('Decided not to offer a free tier', 'reject'), 'Launch a free tier for students', 'revives'],
 [D('Use Stripe for payments, not Braintree'), 'Switch payments to Braintree for lower fees', 'revives'],
 [D('Use TypeScript for all new services'), 'Write the new pricing service in TypeScript', 'aligned'],
];
let ok = 0;
for (const [d, p, want] of cases) { const got = compare(p, d).verdict; ok += got === want; if (got !== want) console.log('MISS', JSON.stringify(p), 'want', want, 'got', got); }
console.log(`conflict: ${ok}/${cases.length}`);
const ex = [
 ['Okay, final call: we go with Figma for design handoff.', 1],
 ['Team has agreed that on-call rotations are weekly.', 1],
 ['We are not going to support Windows 7.', 1],
 ['Can someone check if we decided anything about retries?', 0],
 ['I think we might switch to pnpm at some point.', 0],
 ['Merged the PR, deploying now.', 0],
 ['Consensus: keep the monorepo.', 1],
 ['We decided to postpone the launch to January because QA found blockers.', 1],
];
let eok = 0;
for (const [t, n] of ex) { const got = extractDecisions(t).length; eok += got === n; if (got !== n) console.log('MISS extract', JSON.stringify(t), 'want', n, 'got', got); }
console.log(`extract: ${eok}/${ex.length}`);

const isConflict = (v) => v === 'revives' || v === 'reverses';
const cases2 = [
 [D('Use Redis rather than Memcached for session storage'), 'Add Memcached cluster for sessions', true],
 [D('Use Redis rather than Memcached for session storage'), 'Bump Redis client library to v5', false],
 [D('Host everything on AWS, not GCP'), 'Prototype the ML pipeline on GCP Vertex', true],
 [D('Host everything on AWS, not GCP'), 'Rotate AWS access keys for the staging account', false],
 [D("We won't build a native desktop app", 'reject'), 'Electron desktop app for offline mode', false /* honest: no shared words; expect miss */],
 [D("We won't build a native desktop app", 'reject'), 'Start a native desktop app for Windows users', true],
 [D("We won't build a native desktop app", 'reject'), 'Fix crash in the web app login form', false],
 [D('Use pnpm instead of npm for the monorepo'), 'Replace pnpm with yarn in the monorepo', true],
 [D('Use pnpm instead of npm for the monorepo'), 'Document pnpm workspace commands', false],
 [D('Decided against offering on-prem installs', 'reject'), 'Customer asks for on-prem install of the reporting module', true],
 [D('Decided against offering on-prem installs', 'reject'), 'Update pricing page copy', false],
 [D('Sunset the v1 API by June'), 'Extend v1 API support for Acme until December', true /* expect miss: "extend" */],
 [D('Use Postgres over DynamoDB for billing'), 'Billing report shows wrong totals for December', false],
 [D('Use Postgres over DynamoDB for billing'), 'Use DynamoDB streams to feed the billing audit log', true],
];
let tp=0, fp=0, fn=0, tn=0;
for (const [d, p, want] of cases2) {
  const got = isConflict(compare(p, d).verdict);
  if (got && want) tp++; else if (got && !want) { fp++; console.log('FALSE ALARM', JSON.stringify(p)); }
  else if (!got && want) { fn++; console.log('MISSED', JSON.stringify(p)); } else tn++;
}
console.log({ caught: `${tp}/${tp+fn}`, falseAlarms: `${fp}/${fp+tn}` });
