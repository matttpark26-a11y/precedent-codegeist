import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDecisions, detectAlternatives } from '../src/engine/extract.js';
import { rankDecisions } from '../src/engine/search.js';
import { compare, checkProposal } from '../src/engine/conflict.js';
import { adfToText, storageToText, stem } from '../src/engine/text.js';

const D = (id, statement, polarity = 'adopt', extra = {}) => ({
  id, statement, title: statement, polarity,
  alternatives: polarity === 'adopt' ? detectAlternatives(statement) : [],
  status: 'active', issueKeys: [], ...extra,
});

const LEDGER = [
  D('d1', 'Use Postgres over DynamoDB for the billing service'),
  D('d2', "We won't support IE11 in the customer portal", 'reject'),
  D('d3', 'Feature flags go through LaunchDarkly, not homegrown config toggles'),
  D('d4', 'Mobile app releases ship every two weeks on Tuesday'),
  D('d5', 'Decided not to build a GraphQL gateway for public APIs', 'reject'),
  D('d6', 'Use Stripe for payments instead of Adyen', 'adopt', { status: 'superseded' }),
];

test('stemmer joins word families', () => {
  assert.equal(stem('migrating'), stem('migrate'));
  assert.equal(stem('migration'), stem('migrate'));
  assert.equal(stem('flags'), stem('flag'));
});

test('explicit DECISION lines are captured as explicit', () => {
  const d = extractDecisions('Notes from sync\nDECISION: Use Postgres over DynamoDB for billing\nthanks all');
  assert.equal(d.length, 1);
  assert.equal(d[0].explicit, true);
  assert.equal(d[0].polarity, 'adopt');
  assert.deepEqual(d[0].alternatives, ['DynamoDB']);
});

test('explicit negative decision is a rejection', () => {
  const [d] = extractDecisions('Decision: no support for IE11 in the portal');
  assert.equal(d.polarity, 'reject');
});

test('implicit decisions are found, questions and hedges are not', () => {
  const text = `Great discussion today. After the review we agreed to standardize on LaunchDarkly for flags.
  Should we move to GraphQL? Maybe we could try it later.
  We won't support IE11 anymore since usage is under 0.1%.`;
  const d = extractDecisions(text);
  assert.equal(d.length, 2, JSON.stringify(d));
  assert.equal(d[0].polarity, 'adopt');
  assert.equal(d[1].polarity, 'reject');
  assert.ok(d.every((x) => !x.explicit));
});

test('nothing is extracted from ordinary chatter', () => {
  assert.equal(extractDecisions('Pushed a fix for the login bug, please review.').length, 0);
  assert.equal(extractDecisions('Do we know who owns the billing service?').length, 0);
});

test('alternatives: over / instead of / rather than / not', () => {
  assert.deepEqual(detectAlternatives('Use Kafka rather than SQS for events'), ['SQS']);
  assert.deepEqual(detectAlternatives('Go with React instead of Vue'), ['Vue']);
  assert.deepEqual(detectAlternatives('Use Stripe in favour of Adyen'), []);
});

test('ranking puts the relevant decision first and explains why', () => {
  const r = rankDecisions('Billing service database is slow, consider DynamoDB', LEDGER);
  assert.equal(r[0].decision.id, 'd1');
  assert.ok(r[0].matchedTerms.includes('dynamodb'));
});

test('ranking skips superseded decisions unless asked', () => {
  assert.ok(!rankDecisions('Stripe payments Adyen', LEDGER).some((r) => r.decision.id === 'd6'));
  assert.ok(rankDecisions('Stripe payments Adyen', LEDGER, { includeSuperseded: true }).some((r) => r.decision.id === 'd6'));
});

test('linked issue keys boost a decision even with no word overlap', () => {
  const ledger = [...LEDGER, D('d7', 'Freeze schema changes during Q4', 'adopt', { issueKeys: ['OPS-12'] })];
  const r = rankDecisions('unrelated words entirely', ledger, { boostIssueKeys: ['ops-12'] });
  assert.equal(r[0].decision.id, 'd7');
});

test('unrelated query returns nothing', () => {
  assert.equal(rankDecisions('Update the office wifi password', LEDGER).length, 0);
});

test('conflict: proposal revives a rejected alternative', () => {
  const c = compare('Migrate billing service to DynamoDB for scale', LEDGER[0]);
  assert.equal(c.verdict, 'revives');
  assert.equal(c.confidence, 'high');
});

test('conflict: proposal reverses an adopted decision', () => {
  const c = compare('Replace Postgres in the billing service with something managed', LEDGER[0]);
  assert.equal(c.verdict, 'reverses');
});

test('conflict: "migrate from X" reverses', () => {
  assert.equal(compare('Migrate the billing service from Postgres to Aurora', LEDGER[0]).verdict, 'reverses');
});

test('conflict: proposal revives a rejected thing', () => {
  assert.equal(compare('Add IE11 polyfills for one enterprise customer', LEDGER[1]).verdict, 'revives');
  assert.equal(compare('Build a GraphQL gateway in front of the public APIs', LEDGER[4]).verdict, 'revives');
});

test('aligned work is not a conflict', () => {
  const c = compare('Add a Postgres read replica for billing reports', LEDGER[0]);
  assert.equal(c.verdict, 'aligned');
});

test('checkProposal sorts conflicts first', () => {
  const r = checkProposal('Switch feature flags to homegrown config toggles to save cost', LEDGER);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].decision.id, 'd3');
  assert.equal(r.conflicts[0].verdict, 'revives');
});

test('checkProposal: harmless issue has no conflicts', () => {
  const r = checkProposal('Fix typo on the billing invoice email footer', LEDGER);
  assert.equal(r.conflicts.length, 0);
});

test('ADF and storage format become plain text', () => {
  const adf = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'DECISION: Use Kafka' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
  ] };
  assert.equal(adfToText(adf).trim(), 'DECISION: Use Kafka\nsecond');
  assert.equal(storageToText('<p>We agreed&nbsp;to <b>ship</b></p><p>x</p>'), 'We agreed to ship\nx');
});
