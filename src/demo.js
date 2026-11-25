// One-click demo data: a small billing team's decision history, then new work that goes against it.
// Runs as the signed-in user, through the same capture path as real comments.
// Split in two steps so each resolver call stays well inside Forge's time limit.

export const HISTORY = [
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
    comments: ["After talking to support and sales, we won't support IE11 in the customer portal anymore. Enterprise customers were notified in March."],
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

export const AGAINST = [
  { summary: 'Migrate billing service to DynamoDB to cut hosting costs', description: 'The Postgres instance costs too much. DynamoDB on-demand would be cheaper.', linkTo: 0 },
  { summary: 'Add IE11 polyfills to the customer portal for Contoso', description: 'Contoso still runs IE11 on their finance desktops and wants the portal.' },
  { summary: 'Add a small config toggle for the new invoice PDF layout', description: 'Quick homegrown config toggle so we can turn the new layout on per customer.' },
];

const adf = (text) => ({
  type: 'doc',
  version: 1,
  content: String(text).split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })),
});

// jira: { post(path, body) -> json, get(path) -> json }
async function issueTypeId(jira, projectKey) {
  const meta = await jira.get(`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  const types = meta?.issueTypes || meta?.values || [];
  const t = types.find((x) => /^(task|story)$/i.test(x.name)) || types.find((x) => !x.subtask);
  if (!t) throw new Error(`No usable work type in ${projectKey}.`);
  return t.id;
}

async function createIssue(jira, projectKey, typeId, summary, description) {
  const r = await jira.post('/rest/api/3/issue', {
    fields: { project: { key: projectKey }, summary, description: adf(description), issuetype: { id: typeId } },
  });
  return r.key;
}

export async function loadHistory({ jira, service, projectKey, actor, baseUrl }) {
  const typeId = await issueTypeId(jira, projectKey);
  const keys = [];
  let decisions = 0;
  for (const h of HISTORY) {
    const key = await createIssue(jira, projectKey, typeId, h.summary, h.description);
    keys.push(key);
    for (const text of h.comments) {
      const c = await jira.post(`/rest/api/3/issue/${key}/comment`, { body: adf(text) });
      // Capture now rather than waiting for the comment trigger (it dedupes later).
      const made = await service.ingest({
        text,
        issueKey: key,
        actor,
        source: { type: 'jira-comment', issueKey: key, commentId: c?.id, url: baseUrl && c?.id ? `${baseUrl}/browse/${key}?focusedCommentId=${c.id}` : undefined },
      });
      decisions += made.length;
    }
  }
  return { keys, decisions };
}

// Issues the app creates don't fire its own triggers (ignoreSelf), so run the new-issue check here.
export async function loadConflicts({ jira, service, projectKey, historyKeys = [] }) {
  const typeId = await issueTypeId(jira, projectKey);
  const keys = [];
  for (const a of AGAINST) {
    const key = await createIssue(jira, projectKey, typeId, a.summary, a.description);
    keys.push(key);
    if (a.linkTo != null && historyKeys[a.linkTo]) {
      await jira.post('/rest/api/3/issueLink', { type: { name: 'Relates' }, inwardIssue: { key }, outwardIssue: { key: historyKeys[a.linkTo] } }).catch(() => null);
    }
  }
  const warned = [];
  for (const key of keys) {
    const r = await service.watchNewIssue({ issueKey: key }).catch(() => ({ commented: false }));
    if (r.commented) warned.push(key);
  }
  return { keys, warned };
}
