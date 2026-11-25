// Thin adapters from the service's interfaces to the real Forge APIs.

import api, { route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import { graph as twg } from '@forge/teamwork-graph';
import { adfToText } from '../engine/text.js';
import { createStore } from '../store.js';
import { createService } from '../service.js';
import { decisionToDocument } from '../graph-objects.js';

export const forgeKv = {
  get: (k) => kvs.get(k),
  set: (k, v) => kvs.set(k, v),
  delete: (k) => kvs.delete(k),
  async list(prefix) {
    const out = [];
    let cursor;
    do {
      let q = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(100);
      if (cursor) q = q.cursor(cursor);
      const page = await q.getMany();
      out.push(...(page.results || []));
      cursor = page.nextCursor;
    } while (cursor && out.length < 5000);
    return out;
  },
};

const names = new Map();

export function createJira(asUser, store) {
  const client = () => (asUser ? api.asUser() : api.asApp());
  const j = async (path, init) => {
    const r = await client().requestJira(path, init);
    if (r.status === 404 || r.status === 403) return null;
    if (!r.ok) throw new Error(`Jira ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? {} : r.json();
  };
  return {
    async getIssue(key) {
      const k = String(key || '').trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(k)) return null;
      const data = await j(route`/rest/api/3/issue/${k}?fields=summary,description,labels,issuelinks,parent,status`);
      if (!data) return null;
      const f = data.fields || {};
      const links = (f.issuelinks || []).map((l) => {
        const other = l.outwardIssue || l.inwardIssue;
        return other ? { key: other.key, summary: other.fields?.summary, type: l.outwardIssue ? l.type?.outward : l.type?.inward } : null;
      }).filter(Boolean);
      if (f.parent) links.push({ key: f.parent.key, summary: f.parent.fields?.summary, type: 'parent' });
      return {
        id: data.id,
        key: data.key,
        summary: f.summary || '',
        description: typeof f.description === 'string' ? f.description : adfToText(f.description),
        labels: f.labels || [],
        status: f.status?.name,
        links,
      };
    },
    async baseUrl() {
      const cached = await store.getMeta('baseUrl');
      if (cached) return cached;
      const info = await api.asApp().requestJira(route`/rest/api/3/serverInfo`).then((r) => r.json());
      if (info?.baseUrl) await store.setMeta('baseUrl', info.baseUrl);
      return info?.baseUrl || '';
    },
    async userName(accountId) {
      if (!accountId) return null;
      if (names.has(accountId)) return names.get(accountId);
      const u = await j(route`/rest/api/3/user?accountId=${accountId}`);
      const n = u?.displayName || null;
      names.set(accountId, n);
      return n;
    },
    async addComment(key, adf) {
      const r = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/comment`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: adf }),
      });
      if (!r.ok) throw new Error(`Comment failed ${r.status}`);
    },
  };
}

export function createGraph(store, jira, { cloudId, asUser }) {
  return {
    async push(decisions) {
      const conn = await store.getMeta('twgConnection');
      if (!conn?.connectionId || !decisions.length) return { pushed: 0, reason: conn ? 'empty' : 'no Teamwork Graph connection yet' };
      const baseUrl = await jira.baseUrl();
      let pushed = 0;
      for (let i = 0; i < decisions.length; i += 100) {
        const objects = decisions.slice(i, i + 100).map((d) => decisionToDocument(d, { baseUrl }));
        const res = await twg.setObjects({ objects, connectionId: conn.connectionId });
        if (!res.success) console.warn('[precedent] setObjects failed', res.error, JSON.stringify(res.results?.rejected || []).slice(0, 500));
        else pushed += res.results?.accepted?.length ?? objects.length;
      }
      return { pushed };
    },
    // Curated query (Forge Preview): pull requests linked to the work item.
    async linkedPullRequests(issue) {
      if (!asUser || !cloudId || !issue?.id) return [];
      const query = `query precedent_linkedPrs($id: ID!) {
        jiraWorkItemLinkedExternalPullRequests(id: $id, first: 10) {
          edges { node { ... on ExternalPullRequest { displayName title url status } } }
        }
      }`;
      const r = await api.asUser().requestTeamworkGraph(query, { id: `ari:cloud:jira:${cloudId}:issue/${issue.id}` });
      const body = await r.json();
      if (body.errors?.length) { console.warn('[precedent] TWG', JSON.stringify(body.errors).slice(0, 400)); return []; }
      return (body.data?.jiraWorkItemLinkedExternalPullRequests?.edges || []).map((e) => e.node).filter(Boolean);
    },
  };
}

export function services({ asUser = true, cloudId } = {}) {
  const store = createStore(forgeKv);
  const jira = createJira(asUser, store);
  const graph = createGraph(store, jira, { cloudId, asUser });
  return { store, jira, graph, service: createService({ store, jira, graph }) };
}
