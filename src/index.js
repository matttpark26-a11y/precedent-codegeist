// Forge entry points. Every handler is a thin shell over service.js.

import Resolver from '@forge/resolver';
import api, { assumeTrustedRoute } from '@forge/api';
import { loadHistory, loadConflicts } from './demo.js';
import { services } from './forge/adapters.js';
import { adfToText } from './engine/text.js';

// ---------- Rovo actions (shared by the Rovo agent and the MCP server) ----------

function actionCtx(payload = {}, context = {}) {
  const pc = payload.context || {};
  return {
    issueKey: pc.jira?.issueKey || pc.jira?.issue?.key || null,
    accountId: context.principal?.accountId || pc.accountId || context.accountId || null,
    cloudId: pc.cloudId || context.cloudId || null,
  };
}

function wrap(fn) {
  return async (payload, context) => {
    const ctx = actionCtx(payload, context);
    try {
      const { service } = services({ asUser: true, cloudId: ctx.cloudId });
      return await fn(service, payload || {}, ctx);
    } catch (e) {
      console.error('[precedent] action failed', e?.stack || e);
      return { error: e?.message || String(e) };
    }
  };
}

export const searchDecisions = wrap((s, p) =>
  s.searchDecisions({ query: p.query, includeSuperseded: p.includeSuperseded === true || p.includeSuperseded === 'true' }));

export const checkProposal = wrap((s, p, ctx) =>
  s.check({ proposal: p.proposal, issueKey: p.issueKey || (!p.proposal ? ctx.issueKey : null) }));

export const recordDecision = wrap((s, p, ctx) =>
  s.record({
    statement: p.statement,
    rationale: p.rationale,
    issueKey: p.issueKey || ctx.issueKey,
    alternatives: p.rejectedAlternatives,
    kind: p.kind,
    actor: ctx.accountId,
    source: { type: 'rovo' },
  }));

export const supersedeDecision = wrap((s, p, ctx) =>
  s.supersede({ decisionId: p.decisionId, statement: p.statement, rationale: p.rationale, actor: ctx.accountId }));

export const decisionHistory = wrap((s, p) => s.history({ decisionId: p.decisionId }));

export const decisionBrief = wrap((s, p, ctx) => {
  const key = p.issueKey || ctx.issueKey;
  if (!key) throw new Error('Which issue? Give me an issue key like PROJ-123.');
  return s.brief({ issueKey: key });
});

// ---------- UI resolvers (issue panel + Decision Log page) ----------

const resolver = new Resolver();
const ui = (req) => services({ asUser: true, cloudId: req.context?.cloudId });
const panelIssueKey = (req) => req.payload?.issueKey || req.context?.extension?.issue?.key;

resolver.define('panel', async (req) => {
  const { service } = ui(req);
  return service.brief({ issueKey: panelIssueKey(req) });
});

resolver.define('record', async (req) => {
  const { service } = ui(req);
  const p = req.payload || {};
  return service.record({ ...p, issueKey: p.issueKey || panelIssueKey(req), actor: req.context?.accountId, source: { type: 'manual' } });
});

resolver.define('confirm', async (req) => ui(req).service.confirm(req.payload.id, req.context?.accountId));

resolver.define('dismiss', async (req) => {
  const { store } = ui(req);
  return store.dismiss(req.payload.id, req.context?.accountId);
});

resolver.define('link', async (req) => {
  const { store, service } = ui(req);
  return service.view(await store.linkIssue(req.payload.id, panelIssueKey(req), req.context?.accountId));
});

resolver.define('supersede', async (req) => {
  const { service } = ui(req);
  return service.supersede({ ...req.payload, actor: req.context?.accountId });
});

resolver.define('search', async (req) => ui(req).service.searchDecisions({ query: req.payload?.query, includeSuperseded: !!req.payload?.includeSuperseded, limit: 50 }));

resolver.define('log', async (req) => {
  const { store, service } = ui(req);
  const all = await store.all();
  const status = req.payload?.status;
  const rows = all.filter((d) => !status || status === 'all' || d.status === status);
  const counts = all.reduce((m, d) => ({ ...m, [d.status]: (m[d.status] || 0) + 1 }), {});
  return { counts, total: all.length, decisions: await Promise.all(rows.slice(0, 200).map(service.view)) };
});

resolver.define('history', async (req) => ui(req).service.history({ decisionId: req.payload.id }));

resolver.define('check', async (req) => ui(req).service.check({ proposal: req.payload?.proposal }));

resolver.define('resetDemo', async (req) => {
  if (String(req.context?.environmentType || '').toUpperCase() !== 'DEVELOPMENT') throw new Error('Reset is only available in development.');
  const { store } = ui(req);
  return { removed: await store.clearAll() };
});

resolver.define('settings', async (req) => {
  const { store } = ui(req);
  const current = (await store.getMeta('settings')) || { autoComment: true };
  if (req.payload && 'autoComment' in req.payload) {
    const next = { ...current, autoComment: !!req.payload.autoComment };
    await store.setMeta('settings', next);
    return { ...next, graphConnected: !!(await store.getMeta('twgConnection')), dev: String(req.context?.environmentType || '').toUpperCase() === 'DEVELOPMENT' };
  }
  return { ...current, graphConnected: !!(await store.getMeta('twgConnection')), dev: String(req.context?.environmentType || '').toUpperCase() === 'DEVELOPMENT' };
});

// ---------- Demo data (Settings tab) ----------

function userJira() {
  const call = async (path, body) => {
    const r = await api.asUser().requestJira(assumeTrustedRoute(path), body
      ? { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Jira ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json();
  };
  return { get: (p) => call(p), post: (p, b) => call(p, b) };
}

resolver.define('projects', async () => {
  const r = await userJira().get('/rest/api/3/project/search?maxResults=50&action=create');
  return (r.values || []).map((p) => ({ key: p.key, name: p.name }));
});

resolver.define('demoHistory', async (req) => {
  const { service, jira } = ui(req);
  const projectKey = String(req.payload?.projectKey || '').toUpperCase();
  if (!/^[A-Z][A-Z0-9_]+$/.test(projectKey)) throw new Error('Pick a project first.');
  const baseUrl = await jira.baseUrl().catch(() => '');
  return loadHistory({ jira: userJira(), service, projectKey, actor: req.context?.accountId, baseUrl });
});

resolver.define('demoConflicts', async (req) => {
  const projectKey = String(req.payload?.projectKey || '').toUpperCase();
  return loadConflicts({ jira: userJira(), service: ui(req).service, projectKey, historyKeys: req.payload?.historyKeys || [] });
});

export const handler = resolver.getDefinitions();

// ---------- Triggers ----------

export async function onIssueCommented(event) {
  try {
    const key = event?.issue?.key;
    const comment = event?.comment;
    if (!key || !comment) return;
    const text = typeof comment.body === 'string' ? comment.body : adfToText(comment.body);
    const { service, jira } = services({ asUser: false });
    const base = await jira.baseUrl().catch(() => '');
    const created = await service.ingest({
      text,
      issueKey: key,
      actor: comment.author?.accountId || event.atlassianId || null,
      source: { type: 'jira-comment', issueKey: key, commentId: comment.id, url: base ? `${base}/browse/${key}?focusedCommentId=${comment.id}` : undefined },
    });
    if (created.length) console.log(`[precedent] ${key}: captured ${created.map((d) => `${d.id}(${d.status})`).join(', ')}`);
  } catch (e) {
    console.error('[precedent] onIssueCommented', e?.stack || e);
  }
}

export async function onIssueCreated(event) {
  try {
    const key = event?.issue?.key;
    if (!key) return;
    const { service } = services({ asUser: false });
    const r = await service.watchNewIssue({ issueKey: key });
    console.log(`[precedent] new issue ${key}:`, JSON.stringify(r));
  } catch (e) {
    console.error('[precedent] onIssueCreated', e?.stack || e);
  }
}

// ---------- Teamwork Graph connector ----------

export async function onConnectionChange(request) {
  const { store, graph } = services({ asUser: false });
  const action = request?.action;
  if (action === 'DELETED') {
    await store.setMeta('twgConnection', null);
    return;
  }
  await store.setMeta('twgConnection', { connectionId: request.connectionId, name: request.name, at: new Date().toISOString() });
  // Backfill everything already decided so it shows up in Rovo Search straight away.
  const all = (await store.all()).filter((d) => d.status === 'active' || d.status === 'superseded');
  const r = await graph.push(all);
  console.log(`[precedent] Teamwork Graph connection ${action}: backfilled ${r.pushed} decision(s)`);
}
