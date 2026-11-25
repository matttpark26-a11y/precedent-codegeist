// BM25 ranking of decisions against a query (an issue's text, a proposal, a question).
// Deterministic and explainable: every hit says which terms matched.

import { tokens, expandedTokens } from './text.js';

const K1 = 1.4;
const B = 0.75;

export function decisionText(d) {
  return [d.title, d.title, d.statement, d.rationale, (d.alternatives || []).join(' '), (d.tags || []).join(' ')]
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {string} query
 * @param {object[]} decisions
 * @param {{limit?:number, minScore?:number, includeSuperseded?:boolean, boostIssueKeys?:string[]}} opts
 */
export function rankDecisions(query, decisions, opts = {}) {
  const { limit = 5, minScore = 0.5, includeSuperseded = false, boostIssueKeys = [] } = opts;
  const pool = decisions.filter((d) => includeSuperseded || d.status !== 'superseded');
  if (!pool.length) return [];

  const docs = pool.map((d) => expandedTokens(decisionText(d)));
  const N = docs.length;
  const avgdl = docs.reduce((a, t) => a + t.length, 0) / N || 1;
  const df = new Map();
  for (const t of docs) for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1);

  const q = [...new Set(tokens(query))];
  const boost = new Set(boostIssueKeys.map((k) => k.toUpperCase()));

  const scored = pool.map((d, i) => {
    const tf = new Map();
    for (const w of docs[i]) tf.set(w, (tf.get(w) || 0) + 1);
    let score = 0;
    const matched = [];
    for (const w of q) {
      const f = tf.get(w);
      if (!f) continue;
      const n = df.get(w) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * docs[i].length) / avgdl)));
      matched.push(w);
    }
    const linked = (d.issueKeys || []).some((k) => boost.has(String(k).toUpperCase()));
    if (linked) score += 3;
    if (d.status === 'suggested') score *= 0.8;
    return { decision: d, score: Math.round(score * 100) / 100, matchedTerms: matched, linked };
  });

  return scored
    .filter((s) => s.linked || (s.score >= minScore && s.matchedTerms.length >= Math.min(2, q.length)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
