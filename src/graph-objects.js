// Decision -> Teamwork Graph `atlassian:document` object (shape from @forge/teamwork-graph types).
// Pure so it can be unit-tested.

export function decisionToDocument(d, { baseUrl = '', seq = Date.now() } = {}) {
  const url = d.source?.url || (d.issueKeys?.[0] && baseUrl ? `${baseUrl}/browse/${d.issueKeys[0]}` : `${baseUrl || 'https://precedent.invalid'}/decision/${d.id}`);
  const text = [
    `${d.polarity === 'reject' ? 'Decided against' : 'Decision'}: ${d.title}`,
    d.statement,
    d.rationale ? `Why: ${d.rationale}` : '',
    d.alternatives?.length ? `Rejected alternatives: ${d.alternatives.join(', ')}` : '',
    `Status: ${d.status}${d.supersededBy ? ` (superseded by ${d.supersededBy})` : ''}`,
    d.issueKeys?.length ? `Jira: ${d.issueKeys.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const obj = {
    schemaVersion: '2.0',
    id: d.id,
    updateSequenceNumber: seq,
    displayName: `${d.status === 'superseded' ? '[Superseded] ' : ''}Decision ${d.id}: ${d.title}`.slice(0, 255),
    description: d.statement.slice(0, 1000),
    url,
    createdAt: d.createdAt,
    lastUpdatedAt: d.updatedAt || d.createdAt,
    permissions: [{ accessControls: [{ principals: [{ type: 'ATLASSIAN_WORKSPACE' }] }] }],
    'atlassian:document': {
      type: { category: 'DOCUMENT', mimeType: 'text/plain' },
      content: { mimeType: 'text/plain', text },
      labels: ['decision', 'precedent', d.status, d.polarity === 'reject' ? 'decided-against' : 'decided', ...(d.tags || [])],
    },
  };
  if (d.decidedBy) obj.createdBy = { accountId: d.decidedBy, externalId: d.decidedBy };
  if (d.issueKeys?.length) {
    obj.associations = { lastUpdatedAt: obj.lastUpdatedAt, updateSequenceNumber: seq, set: [{ associationType: 'issueIdOrKeys', values: d.issueKeys }] };
  }
  return obj;
}
