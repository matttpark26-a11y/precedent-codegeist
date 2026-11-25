import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Stack, Inline, Text, Strong, Heading, Button, SectionMessage, Spinner, Link, EmptyState, useProductContext,
} from '@forge/react';
import { invoke, rovo, events } from '@forge/bridge';
import { DecisionCard, DecisionForm, VERDICT } from './components.jsx';

function App() {
  const ctx = useProductContext();
  const issueKey = ctx?.extension?.issue?.key;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // null | 'record' | {supersede: decision}
  const [rovoOn, setRovoOn] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!issueKey) return;
    try {
      setError(null);
      setData(await invoke('panel', { issueKey }));
    } catch (e) {
      setError(e?.message || 'Could not load precedent.');
    }
  }, [issueKey]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { rovo.isEnabled().then(setRovoOn).catch(() => setRovoOn(false)); }, []);
  useEffect(() => {
    let sub;
    events.on('JIRA_ISSUE_CHANGED', () => setTimeout(load, 1500)).then((s) => { sub = s; }).catch(() => {});
    return () => sub?.unsubscribe?.();
  }, [load]);

  const act = async (name, payload, msg) => {
    try {
      const r = await invoke(name, payload);
      if (r?.summary) setNotice(r.summary);
      else if (msg) setNotice(msg);
      setMode(null);
      await load();
    } catch (e) {
      setNotice(e?.message || 'Something went wrong.');
    }
  };

  const ask = () => rovo.open({
    type: 'forge',
    agentKey: 'precedent-agent',
    agentName: 'Precedent',
    prompt: `Give me the decision brief for ${issueKey}: what has the team already decided that matters here, and does this issue conflict with any of it?`,
  });

  if (error) return <SectionMessage appearance="error" title="Precedent couldn't load"><Text>{error}</Text><Button onClick={load}>Try again</Button></SectionMessage>;
  if (!data) return <Inline space="space.100" alignBlock="center"><Spinner size="small" /><Text>Checking what's already been decided…</Text></Inline>;

  const onIssue = data.onThisIssue.filter((d) => d.status !== 'suggested');
  const suggested = data.onThisIssue.filter((d) => d.status === 'suggested');
  const seen = new Set([...data.onThisIssue, ...data.conflicts].map((d) => d.id));
  const linked = data.onLinked.filter((d) => !seen.has(d.id));
  linked.forEach((d) => seen.add(d.id));
  const related = [...data.aligned, ...data.related].filter((d) => !seen.has(d.id)).slice(0, 4);
  const nothing = !data.conflicts.length && !onIssue.length && !suggested.length && !linked.length && !related.length;

  return (
    <Stack space="space.200">
      {notice ? <SectionMessage appearance="information"><Text>{notice}</Text></SectionMessage> : null}

      {data.conflicts.map((c) => (
        <SectionMessage key={c.id} appearance="warning" title={`${VERDICT[c.verdict].text}: ${c.id}`}>
          <Stack space="space.100">
            <Text>{c.reason}</Text>
            <DecisionCard d={c} />
            <Inline space="space.100">
              <Button onClick={() => setMode({ supersede: c })}>The team changed its mind: supersede</Button>
              <Button appearance="subtle" onClick={() => act('link', { id: c.id }, `Linked ${c.id} to ${issueKey}.`)}>Link to this issue</Button>
            </Inline>
          </Stack>
        </SectionMessage>
      ))}

      {mode && mode.supersede ? (
        <Stack space="space.100">
          <Text><Strong>Supersede {mode.supersede.id}</Strong>: the old decision stays in the record, marked superseded.</Text>
          <DecisionForm saveLabel="Supersede" showKind={false}
            onCancel={() => setMode(null)}
            onSave={(f) => act('supersede', { decisionId: mode.supersede.id, statement: f.statement, rationale: f.rationale })} />
        </Stack>
      ) : null}

      {suggested.length ? (
        <Stack space="space.100">
          <Heading size="xsmall">Found in comments. Is this a decision?</Heading>
          {suggested.map((d) => (
            <DecisionCard key={d.id} d={d}>
              <Inline space="space.100">
                <Button appearance="primary" onClick={() => act('confirm', { id: d.id }, `${d.id} confirmed.`)}>Yes, record it</Button>
                <Button appearance="subtle" onClick={() => act('dismiss', { id: d.id }, 'Dismissed.')}>Not a decision</Button>
              </Inline>
            </DecisionCard>
          ))}
        </Stack>
      ) : null}

      {onIssue.length ? (
        <Stack space="space.100">
          <Heading size="xsmall">Decided on this issue</Heading>
          {onIssue.map((d) => <DecisionCard key={d.id} d={d} />)}
        </Stack>
      ) : null}

      {linked.length ? (
        <Stack space="space.100">
          <Heading size="xsmall">Decided on linked issues</Heading>
          {linked.map((d) => <DecisionCard key={d.id} d={d} />)}
        </Stack>
      ) : null}

      {related.length ? (
        <Stack space="space.100">
          <Heading size="xsmall">Related precedent</Heading>
          {related.map((d) => <DecisionCard key={d.id} d={d} verdict={d.verdict} />)}
        </Stack>
      ) : null}

      {data.pullRequests?.length ? (
        <Stack space="space.050">
          <Heading size="xsmall">Linked pull requests (Teamwork Graph)</Heading>
          {data.pullRequests.map((p, i) => (
            <Inline key={i} space="space.100"><Link href={p.url} openNewTab>{p.title || p.displayName}</Link><Text size="small">{p.status}</Text></Inline>
          ))}
        </Stack>
      ) : null}

      {nothing && mode !== 'record' ? (
        <EmptyState header="Nothing on record touches this issue"
          description="When the team settles something here, record it, or write a comment starting with DECISION: and Precedent captures it." />
      ) : null}

      {mode === 'record' ? (
        <DecisionForm onCancel={() => setMode(null)}
          onSave={(f) => act('record', { issueKey, statement: f.statement, rationale: f.rationale, alternatives: f.alternatives, kind: f.kind })} />
      ) : (
        <Inline space="space.100" shouldWrap>
          <Button appearance="primary" onClick={() => { setNotice(null); setMode('record'); }}>Record a decision</Button>
          {rovoOn ? <Button onClick={ask}>Ask Precedent agent</Button> : null}
          <Button appearance="subtle" onClick={load}>Refresh</Button>
        </Inline>
      )}
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
