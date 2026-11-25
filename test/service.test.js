import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryKv } from '../src/store.js';
import { createService } from '../src/service.js';
import { decisionToDocument } from '../src/graph-objects.js';

function setup(issues = {}) {
  const kv = memoryKv();
  const store = createStore(kv);
  const comments = [];
  const pushed = [];
  const jira = {
    async getIssue(k) { return issues[String(k).toUpperCase()] || null; },
    async baseUrl() { return 'https://acme.atlassian.net'; },
    async userName(id) { return id === 'u1' ? 'Priya Shah' : null; },
    async addComment(key, adf) { comments.push({ key, adf }); },
  };
  const graph = {
    async push(ds) { pushed.push(...ds.map((d) => d.id)); return { pushed: ds.length }; },
    async linkedPullRequests() { return [{ title: 'BILL-9: add read replica', status: 'OPEN', url: 'https://bitbucket.org/x/pr/1' }]; },
  };
  return { kv, store, comments, pushed, service: createService({ store, jira, graph }) };
}

const ISSUES = {
  'BILL-1': { id: '10001', key: 'BILL-1', summary: 'Choose billing datastore', description: '', labels: [], links: [] },
  'BILL-7': { id: '10007', key: 'BILL-7', summary: 'Migrate billing service to DynamoDB', description: 'Costs are high, DynamoDB would scale better.', labels: [], links: [{ key: 'BILL-1', type: 'relates to' }] },
  'WEB-3': { id: '10030', key: 'WEB-3', summary: 'Fix typo in footer', description: '', labels: [], links: [] },
};

test('record links the issue, names the person, pushes to the graph', async () => {
  const { service, pushed } = setup(ISSUES);
  const r = await service.record({ statement: 'Use Postgres over DynamoDB for the billing service', rationale: 'Need transactions', issueKey: 'bill-1', actor: 'u1' });
  assert.match(r.summary, /^Recorded D-/);
  assert.deepEqual(r.decision.issues, ['BILL-1']);
  assert.equal(r.decision.decidedBy, 'Priya Shah');
  assert.deepEqual(r.decision.rejectedAlternatives, ['DynamoDB']);
  assert.deepEqual(pushed, [r.decision.id]);
});

test('record rejects unknown issues and duplicates are returned, not re-created', async () => {
  const { service, store } = setup(ISSUES);
  await assert.rejects(service.record({ statement: 'Something real here', issueKey: 'NOPE-1' }), /Couldn't find issue/);
  await service.record({ statement: 'Use Postgres over DynamoDB for billing' });
  const again = await service.record({ statement: 'use postgres over dynamodb for billing!' });
  assert.equal(again.duplicate, true);
  assert.equal((await store.all()).length, 1);
});

test('kind "decided against" records a rejection', async () => {
  const { service } = setup(ISSUES);
  const r = await service.record({ statement: 'Support IE11 in the customer portal', kind: 'decided against' });
  assert.equal(r.decision.kind, 'decided against');
});

test('brief finds the conflict, the linked-issue decision and the pull requests', async () => {
  const { service } = setup(ISSUES);
  const { decision } = await service.record({ statement: 'Use Postgres over DynamoDB for the billing service', issueKey: 'BILL-1' });
  const b = await service.brief({ issueKey: 'BILL-7' });
  assert.equal(b.conflicts.length, 1);
  assert.equal(b.conflicts[0].id, decision.id);
  assert.equal(b.conflicts[0].verdict, 'revives');
  assert.equal(b.onLinked[0].id, decision.id);
  assert.equal(b.pullRequests.length, 1);
  assert.match(b.summary, /possible conflict/);
});

test('supersede keeps history and the old decision stops conflicting', async () => {
  const { service, store } = setup(ISSUES);
  const { decision: old } = await service.record({ statement: 'Use Postgres over DynamoDB for the billing service', issueKey: 'BILL-1' });
  const s = await service.supersede({ decisionId: old.id, statement: 'Use DynamoDB for billing events, keep Postgres for invoices', rationale: 'Event volume grew 40x' });
  assert.equal(s.superseded.status, 'superseded');
  assert.equal(s.superseded.supersededBy, s.decision.id);
  assert.deepEqual(s.decision.issues, ['BILL-1']);
  const chain = await service.history({ decisionId: s.decision.id });
  assert.deepEqual(chain.chain.map((d) => d.id), [old.id, s.decision.id]);
  const b = await service.brief({ issueKey: 'BILL-7' });
  assert.ok(!b.conflicts.some((c) => c.id === old.id));
  await assert.rejects(service.supersede({ decisionId: old.id, statement: 'again and again' }), /already superseded/);
  assert.equal((await store.all()).length, 2);
});

test('ingest: DECISION lines are active, decision-sounding prose is suggested', async () => {
  const { service, pushed } = setup(ISSUES);
  const created = await service.ingest({
    text: 'Sync notes\nDECISION: Use Kafka rather than SQS for billing events\nAlso we agreed to keep the nightly batch job for now.',
    issueKey: 'BILL-1', actor: 'u1', source: { type: 'jira-comment' },
  });
  assert.deepEqual(created.map((d) => d.status), ['active', 'suggested']);
  assert.deepEqual(pushed, [created[0].id]); // only active ones go to the graph
  const again = await service.ingest({ text: 'DECISION: Use Kafka rather than SQS for billing events', issueKey: 'BILL-1' });
  assert.equal(again.length, 0);
});

test('confirm turns a suggestion active and publishes it', async () => {
  const { service, pushed } = setup(ISSUES);
  const [s] = await service.ingest({ text: 'After the review we agreed to keep the nightly batch job.', issueKey: 'BILL-1' });
  const v = await service.confirm(s.id, 'u1');
  assert.equal(v.status, 'active');
  assert.ok(pushed.includes(s.id));
});

test('new conflicting issue gets one warning comment; harmless issue gets none; can be disabled', async () => {
  const { service, store, comments } = setup(ISSUES);
  await service.record({ statement: 'Use Postgres over DynamoDB for the billing service', issueKey: 'BILL-1' });
  assert.equal((await service.watchNewIssue({ issueKey: 'WEB-3' })).commented, false);
  const r = await service.watchNewIssue({ issueKey: 'BILL-7' });
  assert.equal(r.commented, true);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].adf.content[0].type, 'panel');
  await store.setMeta('settings', { autoComment: false });
  assert.equal((await service.watchNewIssue({ issueKey: 'BILL-7' })).reason, 'disabled');
});

test('search: recent lists, topic ranks, empty explains', async () => {
  const { service } = setup(ISSUES);
  await service.record({ statement: 'Use Postgres over DynamoDB for the billing service' });
  await service.record({ statement: 'Mobile releases ship every second Tuesday' });
  assert.equal((await service.searchDecisions({ query: 'recent' })).decisions.length, 2);
  const r = await service.searchDecisions({ query: 'which database does billing use' });
  assert.match(r.decisions[0].title, /Postgres/);
  assert.match((await service.searchDecisions({ query: 'kubernetes autoscaling' })).summary, /Nothing on record/);
});

test('check needs input and reports unknown issues clearly', async () => {
  const { service } = setup(ISSUES);
  await assert.rejects(service.check({}), /proposal to check/);
  await assert.rejects(service.check({ issueKey: 'ZZZ-9' }), /Couldn't read ZZZ-9/);
});

test('Teamwork Graph document matches the SDK shape', () => {
  const d = { id: 'D-ABC', title: 'Use Postgres', statement: 'Use Postgres over DynamoDB', polarity: 'adopt', alternatives: ['DynamoDB'],
    status: 'active', issueKeys: ['BILL-1'], decidedBy: 'u1', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z', tags: [] };
  const o = decisionToDocument(d, { baseUrl: 'https://acme.atlassian.net', seq: 5 });
  for (const k of ['schemaVersion', 'id', 'updateSequenceNumber', 'displayName', 'url', 'createdAt', 'lastUpdatedAt', 'permissions']) assert.ok(o[k] != null, k);
  assert.equal(o['atlassian:document'].type.category, 'DOCUMENT');
  assert.equal(o['atlassian:document'].content.mimeType, 'text/plain');
  assert.match(o['atlassian:document'].content.text, /Rejected alternatives: DynamoDB/);
  assert.deepEqual(o.associations.set, [{ associationType: 'issueIdOrKeys', values: ['BILL-1'] }]);
  assert.equal(o.url, 'https://acme.atlassian.net/browse/BILL-1');
  assert.equal(o.permissions[0].accessControls[0].principals[0].type, 'ATLASSIAN_WORKSPACE');
});
