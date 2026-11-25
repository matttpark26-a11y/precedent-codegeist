import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Stack, Inline, Box, Text, Strong, Heading, Button, Textfield, TextArea, Lozenge, DynamicTable, Tabs, TabList, Tab, TabPanel,
  SectionMessage, Spinner, Toggle, Label, Link, Badge, Select, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { DecisionCard, STATUS_LOZENGE } from './components.jsx';

const page = xcss({ padding: 'space.300', maxWidth: '1100px' });

function Ledger() {
  const [status, setStatus] = useState('active');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [hits, setHits] = useState(null);
  const [chain, setChain] = useState(null);

  const load = useCallback(async () => setData(await invoke('log', { status })), [status]);
  useEffect(() => { load(); }, [load]);

  const search = async () => {
    if (!query.trim()) { setHits(null); return; }
    const r = await invoke('search', { query, includeSuperseded: status === 'all' || status === 'superseded' });
    setHits(r.decisions);
  };

  const rows = (hits || data?.decisions || []).map((d) => ({
    key: d.id,
    cells: [
      { key: 'id', content: <Text>{d.id}</Text> },
      { key: 'title', content: (
        <Stack space="space.025">
          <Text><Strong>{d.title}</Strong></Text>
          {d.rationale ? <Text size="small" color="color.text.subtle">{d.rationale}</Text> : null}
        </Stack>
      ) },
      { key: 'kind', content: <Lozenge appearance={d.kind === 'decided against' ? 'moved' : 'default'}>{d.kind}</Lozenge> },
      { key: 'status', content: <Lozenge appearance={STATUS_LOZENGE[d.status]}>{d.status}</Lozenge> },
      { key: 'issues', content: <Text>{(d.issues || []).join(', ')}</Text> },
      { key: 'who', content: <Text size="small">{d.decidedBy || ''} {d.decidedOn}</Text> },
      { key: 'h', content: (d.supersedes || d.supersededBy) ? <Button appearance="subtle" onClick={async () => setChain(await invoke('history', { id: d.id }))}>History</Button> : null },
    ],
  }));

  const filter = (s, label) => (
    <Button appearance={status === s ? 'primary' : 'subtle'} onClick={() => { setHits(null); setStatus(s); }}>
      {label} {data?.counts && s !== 'all' ? `(${data.counts[s] || 0})` : ''}
    </Button>
  );

  return (
    <Stack space="space.200">
      <Inline space="space.100" shouldWrap>
        {filter('active', 'Active')}
        {filter('suggested', 'Suggested')}
        {filter('superseded', 'Superseded')}
        {filter('all', 'All')}
      </Inline>
      <Inline space="space.100" alignBlock="end">
        <Box xcss={xcss({ width: '420px' })}>
          <Textfield value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search decisions, e.g. billing database" />
        </Box>
        <Button onClick={search}>Search</Button>
        {hits ? <Button appearance="subtle" onClick={() => { setHits(null); setQuery(''); }}>Clear</Button> : null}
      </Inline>
      {chain ? (
        <SectionMessage appearance="information" title="How this decision evolved">
          <Stack space="space.100">
            {chain.chain.map((d) => <DecisionCard key={d.id} d={d} />)}
            <Button appearance="subtle" onClick={() => setChain(null)}>Close</Button>
          </Stack>
        </SectionMessage>
      ) : null}
      {!data ? <Spinner /> : (
        <DynamicTable
          head={{ cells: [
            { key: 'id', content: 'ID' }, { key: 'title', content: 'Decision' }, { key: 'kind', content: 'Kind' },
            { key: 'status', content: 'Status' }, { key: 'issues', content: 'Issues' }, { key: 'who', content: 'Decided' }, { key: 'h', content: '' },
          ] }}
          rows={rows}
          rowsPerPage={20}
          emptyView={hits ? 'No decision matches that search.' : 'No decisions here yet. Record one from any Jira issue, or comment "DECISION: …".'}
        />
      )}
    </Stack>
  );
}

function Checker() {
  const [proposal, setProposal] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setRes(await invoke('check', { proposal })); } finally { setBusy(false); }
  };
  const all = res ? [...res.conflicts, ...res.aligned, ...res.related] : [];
  return (
    <Stack space="space.200">
      <Text>Paste a plan, an RFC summary or an idea. Precedent checks it against everything the team has decided.</Text>
      <TextArea value={proposal} onChange={(e) => setProposal(e.target.value)} placeholder="Move the billing service to DynamoDB to cut costs" />
      <Inline><Button appearance="primary" onClick={run} isDisabled={busy || proposal.trim().length < 5}>{busy ? 'Checking…' : 'Check against precedent'}</Button></Inline>
      {res ? (
        <Stack space="space.150">
          <SectionMessage appearance={res.conflicts.length ? 'warning' : 'success'}
            title={res.conflicts.length ? `${res.conflicts.length} possible conflict(s)` : 'No conflict with recorded decisions'} />
          {all.map((d) => (
            <Stack key={d.id} space="space.050">
              {d.verdict !== 'related' ? <Text color="color.text.subtle">{d.reason}</Text> : null}
              <DecisionCard d={d} verdict={d.verdict} />
            </Stack>
          ))}
          {!all.length ? <Text>Nothing on record touches this. It's new ground.</Text> : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

function DemoData() {
  const [projects, setProjects] = useState(null);
  const [project, setProject] = useState(null);
  const [state, setState] = useState({ step: 'idle' });
  useEffect(() => {
    invoke('projects').then((ps) => {
      setProjects(ps);
      if (ps.length) setProject({ label: `${ps[0].name} (${ps[0].key})`, value: ps[0].key });
    }).catch(() => setProjects([]));
  }, []);

  const run = async () => {
    try {
      setState({ step: 'history' });
      const h = await invoke('demoHistory', { projectKey: project.value });
      setState({ step: 'conflicts', history: h });
      const c = await invoke('demoConflicts', { projectKey: project.value, historyKeys: h.keys });
      setState({ step: 'done', history: h, conflicts: c });
    } catch (e) {
      setState({ step: 'error', message: e?.message || 'Could not load demo data.' });
    }
  };

  if (!projects) return <Spinner size="small" />;
  if (!projects.length) return <Text>Create a Jira project first, then come back here.</Text>;
  return (
    <Stack space="space.100">
      <Text>Creates 6 issues with a realistic decision history (4 recorded decisions, 2 suggestions to confirm), then 3 new issues that go against it, so you can see Precedent work in about a minute.</Text>
      <Inline space="space.100" alignBlock="center">
        <Box xcss={xcss({ width: '320px' })}>
          <Select value={project} onChange={setProject} options={projects.map((p) => ({ label: `${p.name} (${p.key})`, value: p.key }))} />
        </Box>
        <Button appearance="primary" onClick={run} isDisabled={!project || state.step === 'history' || state.step === 'conflicts'}>
          {state.step === 'history' ? 'Writing decision history…' : state.step === 'conflicts' ? 'Creating conflicting issues…' : 'Load demo data'}
        </Button>
      </Inline>
      {state.step === 'done' ? (
        <SectionMessage appearance="success" title="Demo data loaded">
          <Text>History: {state.history.keys.join(', ')} ({state.history.decisions} decisions captured). New work: {state.conflicts.keys.join(', ')}. Precedent warned on {state.conflicts.warned?.length ? state.conflicts.warned.join(', ') : 'none yet'}. The IE11 one stays quiet until you confirm that suggestion. Open {state.conflicts.keys[0]} to see the conflict.</Text>
        </SectionMessage>
      ) : null}
      {state.step === 'error' ? <SectionMessage appearance="error"><Text>{state.message}</Text></SectionMessage> : null}
    </Stack>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  useEffect(() => { invoke('settings').then(setS); }, []);
  if (!s) return <Spinner />;
  return (
    <Stack space="space.250">
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <Toggle id="auto" isChecked={s.autoComment !== false} onChange={async () => setS(await invoke('settings', { autoComment: !(s.autoComment !== false) }))} />
          <Label labelFor="auto">Warn on new issues that go against a decision (adds one comment)</Label>
        </Inline>
      </Stack>
      <Stack space="space.100">
        <Heading size="xsmall">Try it with demo data</Heading>
        <DemoData />
      </Stack>
      <Stack space="space.100">
        <Heading size="xsmall">Capturing decisions</Heading>
        <Text>Comment on any issue with a line starting <Strong>DECISION:</Strong> and it is recorded straight away. Comments that sound like a decision ("we agreed to…", "we won't…") show up as suggestions on the issue for one-click confirmation.</Text>
      </Stack>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <Heading size="xsmall">Teamwork Graph</Heading>
          <Badge appearance={s.graphConnected ? 'added' : 'default'}>{s.graphConnected ? 'connected' : 'not connected'}</Badge>
        </Inline>
        <Text>Decisions are published to the Teamwork Graph as documents linked to their Jira issues, so Rovo Search and Chat can find them. An org admin connects it in Atlassian Administration, then Apps, Connected apps, Precedent, Connections.</Text>
      </Stack>
      <Stack space="space.100">
        <Heading size="xsmall">Use Precedent from your coding agent (MCP)</Heading>
        <Text>An admin enables the Precedent tools under Connected apps, then Tools. Then add the server to Claude Code, Cursor or any MCP client:</Text>
        <Text><Strong>https://mcp.atlassian.com/forge/&lt;app id&gt;</Strong></Text>
        <Link href="https://developer.atlassian.com/platform/forge/build-a-hello-world-rovo-mcp/" openNewTab>How MCP access works</Link>
      </Stack>
    </Stack>
  );
}

function App() {
  return (
    <Box xcss={page}>
      <Stack space="space.200">
        <Text color="color.text.subtle">Everything the team has decided, why, and what it replaced.</Text>
        <Tabs id="precedent-tabs">
          <TabList>
            <Tab>Decisions</Tab>
            <Tab>Check an idea</Tab>
            <Tab>Settings</Tab>
          </TabList>
          <TabPanel><Box xcss={xcss({ paddingTop: 'space.200', width: '100%' })}><Ledger /></Box></TabPanel>
          <TabPanel><Box xcss={xcss({ paddingTop: 'space.200', width: '100%' })}><Checker /></Box></TabPanel>
          <TabPanel><Box xcss={xcss({ paddingTop: 'space.200', width: '100%' })}><Settings /></Box></TabPanel>
        </Tabs>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
