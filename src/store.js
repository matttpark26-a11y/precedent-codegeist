// Decision ledger on top of a tiny key-value interface, so tests can use an in-memory map
// and Forge uses @forge/kvs (see forge/kv.js).
//
// kv: { get(key), set(key, value), delete(key), list(prefix) -> [{key, value}] }

import { makeTitle, detectAlternatives } from './engine/extract.js';
import { truncate } from './engine/text.js';

export const STATUSES = ['active', 'suggested', 'superseded', 'dismissed'];
const PREFIX = 'decision:';

function newId() {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.random().toString(36).slice(2, 5);
  return `D-${(t + r).toUpperCase()}`;
}

export function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cleanKeys(keys) {
  return [...new Set((keys || []).filter(Boolean).map((k) => String(k).trim().toUpperCase()))]
    .filter((k) => /^[A-Z][A-Z0-9_]+-\d+$/.test(k));
}

export function createStore(kv, { now = () => new Date().toISOString() } = {}) {
  async function all({ includeDismissed = false } = {}) {
    const rows = await kv.list(PREFIX);
    return rows.map((r) => r.value).filter((d) => d && (includeDismissed || d.status !== 'dismissed'))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function get(id) {
    if (!id) return null;
    return (await kv.get(PREFIX + String(id).trim().toUpperCase())) || null;
  }

  async function put(d) {
    await kv.set(PREFIX + d.id, d);
    return d;
  }

  async function findDuplicate(statement) {
    const n = normalize(statement);
    return (await all({ includeDismissed: true })).find((d) => normalize(d.statement) === n) || null;
  }

  async function create(input) {
    const statement = String(input.statement || '').trim();
    if (statement.length < 4) throw new Error('A decision needs a statement (at least a few words).');
    if (statement.length > 1000) throw new Error('Keep the decision statement under 1000 characters; put detail in the rationale.');
    const dup = await findDuplicate(statement);
    if (dup) return { ...dup, duplicate: true };

    const polarity = input.polarity === 'reject' ? 'reject' : 'adopt';
    const alternatives = (input.alternatives && input.alternatives.length)
      ? input.alternatives.map((a) => String(a).trim()).filter(Boolean)
      : (polarity === 'adopt' ? detectAlternatives(statement) : []);
    const status = STATUSES.includes(input.status) && input.status !== 'superseded' ? input.status : 'active';
    const d = {
      id: newId(),
      title: truncate(input.title ? String(input.title).trim() : makeTitle(statement, input.polarity), 120),
      statement,
      rationale: truncate(String(input.rationale || '').trim(), 2000),
      polarity,
      alternatives,
      status,
      issueKeys: cleanKeys(input.issueKeys),
      tags: (input.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean),
      decidedBy: input.decidedBy || null,
      source: input.source || { type: 'manual' },
      supersedes: null,
      supersededBy: null,
      createdAt: now(),
      updatedAt: now(),
      history: [{ at: now(), by: input.decidedBy || null, what: status === 'suggested' ? 'suggested' : 'recorded' }],
    };
    return put(d);
  }

  async function update(id, patch, by = null, what = 'updated') {
    const d = await get(id);
    if (!d) throw new Error(`No decision ${id}.`);
    const next = { ...d, ...patch, updatedAt: now(), history: [...(d.history || []), { at: now(), by, what }].slice(-20) };
    if (patch.issueKeys) next.issueKeys = cleanKeys(patch.issueKeys);
    return put(next);
  }

  async function confirm(id, by) {
    const d = await get(id);
    if (!d) throw new Error(`No decision ${id}.`);
    if (d.status !== 'suggested') return d;
    return update(id, { status: 'active', decidedBy: d.decidedBy || by }, by, 'confirmed');
  }

  async function dismiss(id, by) {
    return update(id, { status: 'dismissed' }, by, 'dismissed');
  }

  async function linkIssue(id, issueKey, by) {
    const d = await get(id);
    if (!d) throw new Error(`No decision ${id}.`);
    return update(id, { issueKeys: [...d.issueKeys, issueKey] }, by, `linked ${String(issueKey).toUpperCase()}`);
  }

  async function supersede(oldId, input) {
    const old = await get(oldId);
    if (!old) throw new Error(`No decision ${oldId}.`);
    if (old.status === 'superseded') throw new Error(`${old.id} was already superseded by ${old.supersededBy}.`);
    const created = await create({
      ...input,
      issueKeys: [...(old.issueKeys || []), ...(input.issueKeys || [])],
      tags: input.tags || old.tags,
      status: 'active',
    });
    if (created.duplicate) throw new Error(`That statement already exists as ${created.id}.`);
    const fresh = await update(created.id, { supersedes: old.id }, input.decidedBy, `supersedes ${old.id}`);
    await update(old.id, { status: 'superseded', supersededBy: fresh.id }, input.decidedBy, `superseded by ${fresh.id}`);
    return { decision: fresh, superseded: { ...old, status: 'superseded', supersededBy: fresh.id } };
  }

  async function chain(id) {
    const out = [];
    let d = await get(id);
    const seen = new Set();
    while (d && d.supersedes && !seen.has(d.supersedes)) { seen.add(d.id); d = await get(d.supersedes); }
    while (d && !seen.has('fwd:' + d.id)) {
      seen.add('fwd:' + d.id);
      out.push(d);
      d = d.supersededBy ? await get(d.supersededBy) : null;
    }
    return out;
  }

  async function getMeta(name) { return kv.get('meta:' + name); }
  async function setMeta(name, value) { return kv.set('meta:' + name, value); }

  return { all, get, create, update, confirm, dismiss, linkIssue, supersede, chain, findDuplicate, getMeta, setMeta };
}

export function memoryKv() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; },
    async set(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { m.delete(k); },
    async list(prefix) { return [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) })); },
  };
}
