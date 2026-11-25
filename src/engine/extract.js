// Finds decisions in free text (Jira comments, Confluence pages).
//
//   "DECISION: Use Postgres over DynamoDB for billing"   -> explicit, active
//   "After the review we agreed to drop IE11 support."   -> implicit, suggested
//   "Should we move to GraphQL?"                          -> ignored (question)

import { sentences, truncate } from './text.js';

const EXPLICIT = /^\s*(?:[-*•]\s*)?(?:\*\*)?(decision|decided|adr|we decided)(?:\*\*)?\s*[:\-–—]\s*(.+)$/i;

const REJECT_CUES = [
  /\b(?:we(?:'ve| have)?|team(?: has)?|it was|it's been|has been)\s+(?:decided|agreed|chosen)\s+(?:not to|against)\b/i,
  /\b(?:decided|agreed)\s+(?:not to|against)\b/i,
  /\bwe\s+(?:won't|will not|are not going to|aren't going to|will no longer|no longer)\b/i,
  /\b(?:rejected|ruled out|vetoed)\b/i,
  /\b(?:we're|we are)\s+not\s+(?:doing|going to|supporting)\b/i,
];

const ADOPT_CUES = [
  /\b(?:we(?:'ve| have)?|team(?: has)?|it was|it's been|has been)\s+(?:decided|agreed|chosen|settled on|signed off on|approved)\b/i,
  /\b(?:we(?:'re| are)|we'll|we will)\s+(?:going with|go with|standardi[sz]e on|moving forward with|sticking with)\b/i,
  /\bgoing forward,?\s+we\s+(?:will|'ll)\b/i,
  /\bthe decision is\b/i,
  /\b(?:final call|consensus)\s*(?:is|was|:)/i,
];

const HEDGES = /\b(should we|shall we|could we|can we|what if|if we decide|maybe|perhaps|might|thinking about|let's discuss|proposal:|propose|suggest|do we|are we|wondering)\b/i;

const ALTERNATIVE = /\b(?:over|instead of|rather than|in favou?r of|not)\s+([a-z0-9][^,.;:()]{1,60})/gi;

export function detectAlternatives(statement) {
  const alts = [];
  for (const m of String(statement).matchAll(ALTERNATIVE)) {
    const kw = m[0].split(/\s+/)[0].toLowerCase();
    // "in favour of X" names the winner, not the loser
    if (kw === 'in') continue;
    const alt = m[1].replace(/\b(for|because|since|as|due|so|and then)\b.*$/i, '').trim();
    if (alt && !/^(to|be|a|an|the)$/i.test(alt)) alts.push(alt);
  }
  return [...new Set(alts)];
}

function classify(sentence) {
  if (REJECT_CUES.some((r) => r.test(sentence))) return 'reject';
  if (ADOPT_CUES.some((r) => r.test(sentence))) return 'adopt';
  return null;
}

// Title = the thing decided on. For rejections, the thing rejected (the UI adds "decided against").
//   "After review, we won't support IE11 anymore." -> "Support IE11"
//   "We decided not to build a GraphQL gateway"     -> "Build a GraphQL gateway"
export function makeTitle(statement, polarity) {
  let s = String(statement).trim();
  const lead = s.match(/^[^,]{3,80},\s*(?=(?:we|the team|team)\b)/i);
  if (lead) s = s.slice(lead[0].length);
  s = s
    .replace(/^(?:ok(?:ay)?,?\s*)?(?:final call|consensus|the decision is)\s*[:\-–—]?\s*/i, '')
    .replace(/^(?:we(?:'ve| have)?|the team(?: has)?|team(?: has)?)\s+(?:decided|agreed|chose|chosen)\s+(?:that\s+)?(?:we\s+(?:will|'ll|should)\s+)?(?:not to\s+|against\s+|to\s+)?/i, '')
    .replace(/^(?:we|the team)\s+(?:won't|will not|are not going to|aren't going to|will no longer|no longer|are not)\s+/i, '')
    .replace(/^(?:we(?:'re| are)|we'll|we will|we)\s+(?:going with|go with|standardi[sz]e on|moving forward with|sticking with)\s+/i, (m) => (/standardi/i.test(m) ? 'Standardize on ' : 'Use '))
    .replace(/^(?:not|no)\s+(?:to\s+)?/i, polarity === 'reject' ? '' : '$&')
    .replace(/\s+(?:anymore|any more|for now)[.!]*$/i, '')
    .trim();
  const t = s.charAt(0).toUpperCase() + s.slice(1);
  return truncate(t.replace(/[.!]+$/, ''), 90);
}

/**
 * @param {string} text plain text
 * @returns {Array<{statement:string,title:string,polarity:'adopt'|'reject',alternatives:string[],explicit:boolean,confidence:number}>}
 */
export function extractDecisions(text) {
  const out = [];
  const seen = new Set();
  const lines = String(text || '').split(/\n+/);

  lines.forEach((line, i) => {
    const m = line.match(EXPLICIT);
    if (!m) return;
    const statement = m[2].trim();
    if (statement.length < 4) return;
    const polarity = classify(statement) || (/\b(not|no|never|won't|drop|stop)\b/i.test(statement.split(/\s+/).slice(0, 3).join(' ')) ? 'reject' : 'adopt');
    const why = (lines[i + 1] || '').match(/^\s*(?:why|because|rationale|reason)\s*[:\-–—]\s*(.+)$/i);
    push({ statement, polarity, explicit: true, confidence: 1, rationale: why ? why[1].trim() : '' });
  });

  for (const s of sentences(text)) {
    if (EXPLICIT.test(s)) continue;
    if (s.endsWith('?') || HEDGES.test(s)) continue;
    if (s.length < 15 || s.length > 400) continue;
    const polarity = classify(s);
    if (!polarity) continue;
    push({ statement: s, polarity, explicit: false, confidence: 0.7 });
  }
  return out;

  function push(d) {
    const key = d.statement.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      ...d,
      title: makeTitle(d.statement, d.polarity),
      alternatives: d.polarity === 'adopt' ? detectAlternatives(d.statement) : [],
    });
  }
}
