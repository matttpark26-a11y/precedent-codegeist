// Plain-text utilities shared by the extractor, the ranker and the conflict checker.
// No dependencies, so it runs the same in Forge and in `node --test`.

const STOPWORDS = new Set(`a an the and or but if then else of to in on at by for with from into onto over
under about as is are was were be been being am do does did done have has had having this that these those
it its it's we our ours us you your i me my he she they them their there here what which who whom whose
when where why how all any both each few more most other some such no nor not only own same so than too
very can could should would will shall may might must just also now again further once up down out off
let lets let's ok okay yes yeah per via etc team teams going go goes went use using used decided decide
decision decisions agreed agree chose choose chosen settled approved need needs want wants make made
instead rather issue ticket story task please thanks thank`.split(/\s+/));

// Very light suffix stemmer: enough to match "migrating"/"migration"/"migrate".
export function stem(word) {
  let w = word;
  if (w.length <= 3) return w;
  const RULES = [['ational', 'at'], ['ization', 'iz'], ['ations', 'at'], ['ation', 'at'], ['ments', ''],
    ['ment', ''], ['ingly', ''], ['ings', ''], ['ing', ''], ['ies', 'y'], ['ied', 'y'], ['edly', ''],
    ['ed', ''], ['es', ''], ['ly', ''], ['s', '']];
  for (const [suf, rep] of RULES) {
    if (w.endsWith(suf) && w.length - suf.length >= 3 && !w.endsWith('ss')) {
      w = w.slice(0, -suf.length) + rep;
      break;
    }
  }
  // migrat(e) -> migrat, so "migrate" and "migration" meet
  if (w.endsWith('e') && w.length > 4) w = w.slice(0, -1);
  return w;
}

export function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9.#+-]+/)
    .map((w) => w.replace(/^[.\-+]+|[.\-]+$/g, ''))
    .filter(Boolean);
}

export function tokens(text) {
  return words(text).filter((w) => !STOPWORDS.has(w) && w.length > 1).map(stem);
}

// Category words for common tech, so "which database does billing use" finds "Use Postgres for billing".
const CONCEPTS = {
  database: 'postgres postgresql mysql mariadb dynamodb mongodb mongo cassandra redis sqlite aurora spanner cockroachdb firestore supabase snowflake bigquery elasticsearch opensearch neo4j',
  queue: 'kafka sqs sns rabbitmq kinesis pubsub nats activemq eventbridge celery sidekiq',
  frontend: 'react vue angular svelte nextjs next.js nuxt remix solid ember',
  backend: 'node nodejs express django flask rails spring fastapi laravel nestjs',
  language: 'typescript javascript python golang go rust java kotlin swift ruby php scala elixir',
  cloud: 'aws gcp azure vercel heroku netlify cloudflare',
  infra: 'kubernetes k8s docker terraform helm ecs lambda serverless',
  browser: 'ie11 ie safari chrome firefox edge',
  api: 'graphql rest grpc openapi webhook webhooks',
  payment: 'stripe adyen braintree paypal',
  auth: 'oauth saml sso okta auth0 cognito jwt',
  flag: 'launchdarkly unleash flagsmith split.io',
  ci: 'jenkins circleci bitbucket-pipelines github-actions buildkite',
  mobile: 'ios android react-native flutter',
};
const CONCEPT_OF = new Map();
for (const [concept, list] of Object.entries(CONCEPTS)) for (const w of list.split(/\s+/)) CONCEPT_OF.set(stem(w), stem(concept));

export function isTech(token) {
  return CONCEPT_OF.has(token) || [...CONCEPT_OF.values()].includes(token);
}

// tokens + the category of every known technology mentioned
export function expandedTokens(text) {
  const t = tokens(text);
  const extra = t.map((w) => CONCEPT_OF.get(w)).filter(Boolean);
  return extra.length ? [...t, ...new Set(extra)] : t;
}

export function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Atlassian Document Format -> plain text. Comments and some events arrive as ADF.
export function adfToText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).join('');
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return node.attrs?.text || '';
  const inner = adfToText(node.content);
  const block = ['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'panel', 'tableRow'];
  return block.includes(node.type) ? inner + '\n' : inner;
}

// Confluence storage format (XHTML) -> plain text.
export function storageToText(html) {
  return String(html || '')
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/tr|\/div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function truncate(text, n) {
  const s = String(text || '');
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}
