// Does a proposal (issue summary + description, a PR plan, a chat question) go against precedent?
//
//   decision ADOPT "Use Postgres over DynamoDB for billing"
//     proposal "Migrate billing to DynamoDB"     -> revives   (brings back a rejected alternative)
//     proposal "Replace Postgres in billing"     -> reverses  (undoes the decision)
//     proposal "Add Postgres read replica"       -> aligned
//   decision REJECT "We won't support IE11"
//     proposal "Add IE11 polyfills"              -> revives

import { tokens, isTech } from './text.js';
import { rankDecisions } from './search.js';

const SUBJECT_NOISE = new Set(['adopt', 'support', 'mov', 'migrat', 'switch', 'keep', 'stay', 'stick',
  'standardiz', 'standardis', 'drop', 'add', 'implement', 'build', 'ship', 'remov', 'replac', 'stop',
  'start', 'continu', 'against', 'never', 'avoid', 'longer', 'allow', 'enabl', 'disabl', 'requir', 'go', 'all', 'new', 'only', 'default', 'over']);

const REMOVE = /\b(?:remove|removing|drop|dropping|deprecate|deprecating|sunset|sunsetting|get rid of|rip out|stop using|abandon|revert|reverting|kill|disable|disabling|move off|moving off|move away from|moving away from|migrate away from|migrating away from|switch away from|replace|replacing)\s+([^.;:!?\n]{1,80})/gi;
const FROM_AFTER_MOVE = /\b(?:migrat\w*|mov\w*|switch\w*|port\w*|convert\w*)\b[^.;\n]{0,60}?\b(?:from|off of|off)\s+([^.;:!?\n]{1,60})/gi;
// "migrate billing to DynamoDB", "switch feature flags to config toggles"
const TO_AFTER_MOVE = /\b(?:migrat\w*|mov\w*|switch\w*|port\w*|convert\w*|chang\w*)\b[^.;\n]{0,60}?\bto\s+([^.;:!?\n]{1,60})/gi;
const ADD =/\b(?:add|adding|use|using|adopt|adopting|introduce|introducing|implement|implementing|migrate to|migrating to|move to|moving to|switch to|switching to|port to|convert to|rewrite in|rewriting in|support|supporting|enable|enabling|bring back|re-?add|re-?enable|integrate|integrating|start using|split into|break into|go with|going with)\s+([^.;:!?\n]{1,80})/gi;

function objectTokens(phrase) {
  // stop the object at a clause boundary
  const cut = phrase.split(/\b(?:from|to|onto|into|with|instead of|rather than|because|so that|since|which|and then|but)\b/i)[0];
  return new Set(tokens(cut).filter((t) => !SUBJECT_NOISE.has(t)));
}

function subjectTokens(text, minus = []) {
  const drop = new Set(minus.flatMap((m) => tokens(m)));
  return new Set(tokens(text).filter((t) => !SUBJECT_NOISE.has(t) && !drop.has(t)));
}

function overlap(objSet, target) {
  if (!objSet.size || !target.size) return { ratio: 0, shared: [] };
  const shared = [...objSet].filter((t) => target.has(t));
  return { ratio: shared.length / Math.min(objSet.size, target.size), shared };
}

function verbObjects(text, re) {
  const res = [];
  for (const m of String(text).matchAll(re)) res.push({ phrase: m[0].trim(), obj: objectTokens(m[1]) });
  return res;
}

function hit(objs, target, min = 0.5) {
  let best = null;
  for (const o of objs) {
    const ov = overlap(o.obj, target);
    if (ov.shared.length && ov.ratio >= min && (!best || ov.ratio > best.ratio)) best = { ...ov, phrase: o.phrase };
  }
  return best;
}

// "replace X with Y" -> removes X, adds Y
function replaceWith(text) {
  const removes = [];
  const adds = [];
  for (const m of String(text).matchAll(/\breplac\w*\s+([^.;\n]{1,60}?)\s+with\s+([^.;:!?\n]{1,60})/gi)) {
    removes.push({ phrase: m[0], obj: objectTokens(m[1]) });
    adds.push({ phrase: m[0], obj: objectTokens(m[2]) });
  }
  return { removes, adds };
}

/**
 * @returns {{verdict:'reverses'|'revives'|'aligned'|'related', confidence:'high'|'medium'|'low', reason:string, evidence?:string}}
 */
// The words that carry a decision: names (Postgres, Okta), versions (IE11), known tech.
// "Use Kafka over SQS for order events" -> kafka, sqs. Falls back to all subject words.
export function anchorTokens(text, within) {
  const out = new Set();
  String(text).split(/\s+/).forEach((raw, i) => {
    const w = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.+#]+$/g, '');
    if (!w) return;
    const named = (i > 0 && /^[A-Z]/.test(w)) || /\d/.test(w) || /^[A-Z]{2,}$/.test(w);
    const t = tokens(w)[0];
    if (t && (named || isTech(t))) out.add(t);
  });
  const inside = [...out].filter((t) => within.has(t));
  return new Set(inside.length ? inside : within);
}

export function compare(proposal, decision) {
  const rw = replaceWith(proposal);
  const removes = [...verbObjects(proposal, REMOVE), ...verbObjects(proposal, FROM_AFTER_MOVE), ...rw.removes];
  const adds = [...verbObjects(proposal, ADD), ...verbObjects(proposal, TO_AFTER_MOVE), ...rw.adds];
  const alts = decision.alternatives || [];
  const said = new Set(tokens(proposal));
  const removed = new Set(removes.flatMap((r) => [...r.obj]));
  const mentioned = (set) => [...set].filter((t) => said.has(t) && !removed.has(t));
  const statement = decision.statement || decision.title;

  if (decision.polarity === 'reject') {
    const subj = subjectTokens(decision.title || statement);
    const anchors = anchorTokens(statement, subj);
    const h = hit(adds, subj);
    if (h && h.shared.some((t) => anchors.has(t))) return { verdict: 'revives', confidence: 'high', reason: `Brings back something the team decided against (${h.shared.join(', ')}).`, evidence: h.phrase };
    if (hit(removes, subj)) return { verdict: 'aligned', confidence: 'medium', reason: 'Removes something the team decided against, in line with this decision.' };
    const cov = mentioned(subj);
    if (cov.some((t) => anchors.has(t)) && cov.length / subj.size >= 0.6) {
      return { verdict: 'revives', confidence: cov.length === subj.size ? 'high' : 'medium', reason: `Covers what the team decided against (${cov.join(', ')}).` };
    }
    return { verdict: 'related', confidence: 'low', reason: 'Related decision.' };
  }

  // adopt
  const subj = subjectTokens(decision.title || statement, alts);
  for (const alt of alts) {
    const altSet = subjectTokens(alt);
    const altAnchors = anchorTokens(alt, altSet);
    const m = mentioned(altSet);
    if (m.some((t) => altAnchors.has(t)) && m.length / altSet.size >= 0.5) {
      const h = hit(adds, altSet, 0.5);
      return { verdict: 'revives', confidence: 'high', reason: `Proposes "${alt}", which this decision chose against.`, evidence: h?.phrase };
    }
  }
  const anchors = anchorTokens(statement, subj);
  const r = hit(removes, subj);
  if (r) return { verdict: 'reverses', confidence: 'high', reason: `Would undo this decision (${r.shared.join(', ')}).`, evidence: r.phrase };
  const ra = removes.find((x) => [...x.obj].some((t) => anchors.has(t)));
  if (ra) return { verdict: 'reverses', confidence: 'high', reason: `Moves away from ${[...ra.obj].filter((t) => anchors.has(t)).join(', ')}, which this decision chose.`, evidence: ra.phrase };
  const a = mentioned(anchors);
  if (a.length) return { verdict: 'aligned', confidence: 'medium', reason: `Builds on this decision (${a.join(', ')}).` };
  return { verdict: 'related', confidence: 'low', reason: 'Related decision.' };
}

/**
 * Rank precedent for a proposal and judge each hit.
 */
export function checkProposal(proposal, decisions, opts = {}) {
  const ranked = rankDecisions(proposal, decisions, { limit: opts.limit || 6, boostIssueKeys: opts.issueKeys || [] });
  const results = ranked.map((r) => ({ ...r, ...compare(proposal, r.decision) }));
  const order = { reverses: 0, revives: 0, aligned: 1, related: 2 };
  results.sort((a, b) => order[a.verdict] - order[b.verdict] || b.score - a.score);
  return {
    conflicts: results.filter((r) => r.verdict === 'reverses' || r.verdict === 'revives'),
    aligned: results.filter((r) => r.verdict === 'aligned'),
    related: results.filter((r) => r.verdict === 'related'),
  };
}
