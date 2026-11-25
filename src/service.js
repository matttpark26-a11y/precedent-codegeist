// Everything Precedent can do, independent of how it is called (issue panel, Rovo agent, MCP, triggers).
//
// deps = {
//   store,                         // createStore(...)
//   jira: { getIssue(key), baseUrl(), userName(accountId), addComment(key, adf) },
//   graph: { push(decisions), linkedPullRequests(issue) },
// }

import { extractDecisions } from './engine/extract.js';
import { rankDecisions } from './engine/search.js';
import { checkProposal } from './engine/conflict.js';
import { truncate } from './engine/text.js';

const ISSUE_KEY = /\b[A-Z][A-Z0-9_]+-\d+\b/;

export function issueText(issue) {
  if (!issue) return '';
  return [issue.summary, issue.summary, issue.description, (issue.labels || []).join(' ')].filter(Boolean).join('\n');
}

export function createService(deps) {
  const { store, jira, graph } = deps;

  async function view(d) {
    const base = await safe(() => jira.baseUrl(), '');
    const who = d.decidedBy ? await safe(() => jira.userName(d.decidedBy), null) : null;
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      kind: d.polarity === 'reject' ? 'decided against' : 'decided',
      statement: d.statement,
      rationale: d.rationale || undefined,
      rejectedAlternatives: d.alternatives?.length ? d.alternatives : undefined,
      issues: d.issueKeys,
      decidedBy: who || d.decidedBy || undefined,
      decidedOn: String(d.createdAt).slice(0, 10),
      source: d.source?.url || (d.issueKeys?.[0] && base ? `${base}/browse/${d.issueKeys[0]}` : d.source?.type),
      supersededBy: d.supersededBy || undefined,
      supersedes: d.supersedes || undefined,
    };
  }

  function line(v) {
    const tag = v.status === 'active' ? '' : ` [${v.status}]`;
    return `${v.id}${tag}: ${v.kind}: "${v.title}" (${v.decidedOn}${v.decidedBy ? `, ${v.decidedBy}` : ''}${v.issues?.length ? `, ${v.issues.join(', ')}` : ''})`;
  }

  async function searchDecisions({ query, includeSuperseded = false, limit = 8 }) {
    const all = await store.all();
    const q = String(query || '').trim();
    let hits;
    if (!q || /^(all|recent|latest|\*)$/i.test(q)) {
      hits = all.filter((d) => includeSuperseded || d.status !== 'superseded').slice(0, limit).map((d) => ({ decision: d, matchedTerms: [] }));
    } else {
      const keyMatch = q.match(ISSUE_KEY);
      hits = rankDecisions(q, all, { limit, includeSuperseded, boostIssueKeys: keyMatch ? [keyMatch[0]] : [], minScore: 0.3 });
    }
    const decisions = await Promise.all(hits.map(async (h) => ({ ...(await view(h.decision)), matchedTerms: h.matchedTerms?.length ? h.matchedTerms : undefined })));
    return {
      summary: decisions.length
        ? `${decisions.length} decision(s) found:\n` + decisions.map(line).join('\n')
        : `No recorded decision matches "${q}". Nothing on record has settled this yet.`,
      total: all.length,
      decisions,
    };
  }

  async function check({ proposal, issueKey }) {
    let text = String(proposal || '').trim();
    let issue = null;
    const keys = [];
    if (issueKey) {
      issue = await jira.getIssue(issueKey);
      if (!issue) throw new Error(`Couldn't read ${issueKey}. Check the key and that you can see it.`);
      keys.push(issue.key, ...(issue.links || []).map((l) => l.key));
      if (!text) text = issueText(issue);
    }
    if (!text) throw new Error('Give me a proposal to check, or an issue key.');
    const all = await store.all();
    const res = checkProposal(text, all, { issueKeys: keys, limit: 8 });
    const pack = async (r) => ({ ...(await view(r.decision)), verdict: r.verdict, confidence: r.confidence, reason: r.reason, evidence: r.evidence });
    const conflicts = await Promise.all(res.conflicts.map(pack));
    const aligned = await Promise.all(res.aligned.map(pack));
    const related = await Promise.all(res.related.map(pack));
    const head = conflicts.length
      ? `⚠ ${conflicts.length} possible conflict(s) with precedent:\n` + conflicts.map((c) => `${c.id} (${c.verdict}, ${c.confidence}): ${c.reason} Decision: "${c.title}"`).join('\n')
      : 'No conflict with recorded decisions.';
    const tail = [...aligned, ...related].length ? '\nRelated precedent:\n' + [...aligned, ...related].map(line).join('\n') : '';
    return { summary: head + tail, issueKey: issue?.key, conflicts, aligned, related };
  }

  async function record({ statement, rationale, issueKey, alternatives, kind, actor, source, status }) {
    const keys = [];
    if (issueKey) {
      const issue = await safe(() => jira.getIssue(issueKey), null);
      if (!issue) throw new Error(`Couldn't find issue ${issueKey}.`);
      keys.push(issue.key);
    }
    const alts = Array.isArray(alternatives) ? alternatives : String(alternatives || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const polarity = /^(reject|against|no|decided against|won't|not)/i.test(String(kind || '')) ? 'reject' : 'adopt';
    const d = await store.create({ statement, rationale, issueKeys: keys, alternatives: alts, polarity, decidedBy: actor, source: source || { type: 'manual' }, status });
    if (d.duplicate) return { summary: `Already on record as ${d.id}: "${d.title}".`, decision: await view(d), duplicate: true };
    await safe(() => graph.push([d]), null);
    return { summary: `Recorded ${d.id}: ${d.polarity === 'reject' ? 'decided against' : 'decided'} "${d.title}".`, decision: await view(d) };
  }

  async function supersede({ decisionId, statement, rationale, actor }) {
    const { decision, superseded } = await store.supersede(decisionId, { statement, rationale, decidedBy: actor, source: { type: 'manual' } });
    await safe(() => graph.push([decision, superseded]), null);
    return { summary: `${superseded.id} is superseded. New decision ${decision.id}: "${decision.title}".`, decision: await view(decision), superseded: await view(superseded) };
  }

  async function history({ decisionId }) {
    const chain = await store.chain(decisionId);
    if (!chain.length) throw new Error(`No decision ${decisionId}.`);
    const views = await Promise.all(chain.map(view));
    return { summary: views.map((v, i) => `${i + 1}. ${line(v)}`).join('\n'), chain: views };
  }

  // The context pack for one issue: what's linked, what precedent applies, what might clash.
  async function brief({ issueKey }) {
    const issue = await jira.getIssue(issueKey);
    if (!issue) throw new Error(`Couldn't read ${issueKey}.`);
    const all = await store.all();
    const linkedKeys = (issue.links || []).map((l) => l.key);
    const onThisIssue = all.filter((d) => d.issueKeys?.includes(issue.key));
    const onLinked = all.filter((d) => !d.issueKeys?.includes(issue.key) && d.issueKeys?.some((k) => linkedKeys.includes(k)));
    const checked = await check({ issueKey: issue.key });
    const pullRequests = await safe(() => graph.linkedPullRequests(issue), []);
    const suggestions = onThisIssue.filter((d) => d.status === 'suggested');
    const parts = [
      `${issue.key}: ${issue.summary}`,
      onThisIssue.length ? `Decided on this issue: ${onThisIssue.filter((d) => d.status === 'active').map((d) => `${d.id} "${d.title}"`).join('; ') || 'none confirmed'}` : 'No decisions recorded on this issue yet.',
      onLinked.length ? `Decided on linked issues: ${onLinked.map((d) => `${d.id} "${d.title}" (${d.issueKeys.join(', ')})`).join('; ')}` : null,
      checked.summary,
      pullRequests.length ? `Linked pull requests (Teamwork Graph): ${pullRequests.map((p) => `${p.title || p.displayName} [${p.status || '?'}]`).join('; ')}` : null,
      suggestions.length ? `${suggestions.length} suggested decision(s) from comments are waiting for confirmation.` : null,
    ].filter(Boolean);
    return {
      summary: parts.join('\n'),
      issue: { key: issue.key, summary: issue.summary, links: issue.links },
      onThisIssue: await Promise.all(onThisIssue.filter((d) => d.status !== 'dismissed').map(view)),
      onLinked: await Promise.all(onLinked.map(view)),
      conflicts: checked.conflicts,
      aligned: checked.aligned,
      related: checked.related,
      pullRequests,
    };
  }

  // Called by triggers: pull decisions out of a comment / page.
  async function ingest({ text, issueKey, actor, source }) {
    const found = extractDecisions(text);
    const created = [];
    for (const f of found) {
      const d = await store.create({
        statement: f.statement,
        rationale: f.rationale,
        title: f.title,
        polarity: f.polarity,
        alternatives: f.alternatives,
        issueKeys: issueKey ? [issueKey] : [],
        decidedBy: actor,
        source,
        status: f.explicit ? 'active' : 'suggested',
      });
      if (!d.duplicate) created.push(d);
    }
    const active = created.filter((d) => d.status === 'active');
    if (active.length) await safe(() => graph.push(active), null);
    return created;
  }

  // Called when an issue is created: warn on high-confidence conflicts, once.
  async function watchNewIssue({ issueKey }) {
    const settings = (await store.getMeta('settings')) || {};
    if (settings.autoComment === false) return { commented: false, reason: 'disabled' };
    const res = await check({ issueKey });
    const strong = res.conflicts.filter((c) => c.confidence === 'high' && c.status === 'active');
    if (!strong.length) return { commented: false, conflicts: res.conflicts.length };
    await jira.addComment(issueKey, conflictCommentAdf(strong));
    return { commented: true, conflicts: strong.map((c) => c.id) };
  }

  async function confirm(id, actor) {
    const d = await store.confirm(id, actor);
    await safe(() => graph.push([d]), null);
    return view(d);
  }

  return { searchDecisions, check, record, supersede, history, brief, ingest, watchNewIssue, confirm, view };
}

export function conflictCommentAdf(conflicts) {
  const text = (t, marks) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
  return {
    type: 'doc',
    version: 1,
    content: [
      { type: 'panel', attrs: { panelType: 'warning' }, content: [
        { type: 'paragraph', content: [text('Precedent: this issue may go against a recorded team decision.', [{ type: 'strong' }])] },
        { type: 'bulletList', content: conflicts.slice(0, 3).map((c) => ({ type: 'listItem', content: [
          { type: 'paragraph', content: [text(`${c.id} `, [{ type: 'strong' }]), text(`"${truncate(c.title, 100)}" (${c.decidedOn}). ${c.reason}`)] },
        ] })) },
        { type: 'paragraph', content: [text('If things changed, supersede the decision from the Precedent panel so the record stays true.')] },
      ] },
    ],
  };
}

async function safe(fn, fallback) {
  try { return await fn(); } catch (e) { console.warn('[precedent]', e?.message || e); return fallback; }
}
