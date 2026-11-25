import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryKv } from '../src/store.js';
import { createService } from '../src/service.js';
import { loadHistory, loadConflicts, HISTORY, AGAINST } from '../src/demo.js';

function fakeJira() {
  const issues = {};
  const comments = [];
  let n = 0;
  const api = {
    async get(path) {
      if (path.includes('/createmeta/')) return { issueTypes: [{ id: '10001', name: 'Task' }] };
      throw new Error('unexpected GET ' + path);
    },
    async post(path, body) {
      if (path === '/rest/api/3/issue') {
        const key = `DEMO-${++n}`;
        issues[key] = { id: String(n), key, summary: body.fields.summary, description: body.fields.description.content.map((p) => p.content?.[0]?.text || '').join('\n'), links: [] };
        return { key };
      }
      if (path.endsWith('/comment')) return { id: String(1000 + comments.push(path)) };
      if (path === '/rest/api/3/issueLink') return null;
      throw new Error('unexpected POST ' + path);
    },
  };
  return { api, issues };
}

test('demo loader records the history and warns on the conflicting issues', async () => {
  const { api, issues } = fakeJira();
  const store = createStore(memoryKv());
  const warnings = [];
  const service = createService({
    store,
    graph: { push: async () => {}, linkedPullRequests: async () => [] },
    jira: { getIssue: async (k) => issues[k], baseUrl: async () => 'https://x', userName: async () => null, addComment: async (k) => warnings.push(k) },
  });
  const h = await loadHistory({ jira: api, service, projectKey: 'DEMO', actor: 'u1', baseUrl: 'https://x' });
  assert.equal(h.keys.length, HISTORY.length);
  const all = await store.all();
  assert.equal(all.filter((d) => d.status === 'active').length, 4);
  assert.equal(all.filter((d) => d.status === 'suggested').length, 2);
  const c = await loadConflicts({ jira: api, service, projectKey: 'DEMO', historyKeys: h.keys });
  assert.equal(c.keys.length, AGAINST.length);
  // DynamoDB + homegrown toggle conflict with active decisions; IE11 is only a suggestion so it stays quiet.
  assert.deepEqual(c.warned, [c.keys[0], c.keys[2]]);
  assert.deepEqual(warnings, c.warned);
});
