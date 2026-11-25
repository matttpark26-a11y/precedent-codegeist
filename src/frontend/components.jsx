import React, { useState } from 'react';
import {
  Box, Stack, Inline, Text, Strong, Lozenge, Button, Link, TextArea, Textfield, Select, Label, xcss,
} from '@forge/react';

export const STATUS_LOZENGE = {
  active: 'success',
  suggested: 'new',
  superseded: 'removed',
  dismissed: 'default',
};

export const VERDICT = {
  reverses: { text: 'Reverses this', appearance: 'removed' },
  revives: { text: 'Revives a rejected option', appearance: 'removed' },
  aligned: { text: 'Builds on this', appearance: 'success' },
  related: { text: 'Related', appearance: 'default' },
};

const card = xcss({
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius',
  padding: 'space.150',
});

export function Meta({ d }) {
  const bits = [d.decidedOn, d.decidedBy, d.issues?.length ? d.issues.join(', ') : null].filter(Boolean);
  return (
    <Inline space="space.100" alignBlock="center" shouldWrap>
      <Text size="small" color="color.text.subtlest">{d.id} · {bits.join(' · ')}</Text>
      {d.source && String(d.source).startsWith('http') ? <Link href={d.source} openNewTab>source</Link> : null}
    </Inline>
  );
}

export function DecisionCard({ d, children, verdict }) {
  return (
    <Box xcss={card}>
      <Stack space="space.075">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Lozenge appearance={STATUS_LOZENGE[d.status] || 'default'}>{d.status}</Lozenge>
          {d.kind === 'decided against' ? <Lozenge appearance="moved">decided against</Lozenge> : null}
          {verdict ? <Lozenge appearance={VERDICT[verdict].appearance} isBold>{VERDICT[verdict].text}</Lozenge> : null}
        </Inline>
        <Text><Strong>{d.title}</Strong></Text>
        {d.statement && d.statement !== d.title ? <Text>{d.statement}</Text> : null}
        {d.rationale ? <Text color="color.text.subtle">Why: {d.rationale}</Text> : null}
        {d.rejectedAlternatives?.length ? <Text color="color.text.subtle">Rejected: {d.rejectedAlternatives.join(', ')}</Text> : null}
        {d.supersededBy ? <Text color="color.text.subtle">Superseded by {d.supersededBy}</Text> : null}
        <Meta d={d} />
        {children}
      </Stack>
    </Box>
  );
}

export function DecisionForm({ onSave, onCancel, initial = {}, saveLabel = 'Record decision', showKind = true }) {
  const [statement, setStatement] = useState(initial.statement || '');
  const [rationale, setRationale] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [kind, setKind] = useState({ label: 'We decided to…', value: 'decided' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    if (statement.trim().length < 4) { setError('Write the decision in a sentence.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave({ statement: statement.trim(), rationale: rationale.trim(), alternatives, kind: kind.value });
    } catch (e) {
      setError(e?.message || 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Box xcss={card}>
      <Stack space="space.100">
        {showKind ? (
          <Stack space="space.050">
            <Label labelFor="kind">Kind</Label>
            <Select id="kind" value={kind} onChange={setKind} options={[
              { label: 'We decided to…', value: 'decided' },
              { label: 'We decided against…', value: 'decided against' },
            ]} />
          </Stack>
        ) : null}
        <Stack space="space.050">
          <Label labelFor="statement">Decision</Label>
          <TextArea id="statement" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Use Postgres over DynamoDB for the billing service" />
        </Stack>
        <Stack space="space.050">
          <Label labelFor="why">Why</Label>
          <Textfield id="why" value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Transactions across invoices; team knows SQL" />
        </Stack>
        {showKind ? (
          <Stack space="space.050">
            <Label labelFor="alts">Options considered and rejected (comma separated)</Label>
            <Textfield id="alts" value={alternatives} onChange={(e) => setAlternatives(e.target.value)} placeholder="DynamoDB, MongoDB" />
          </Stack>
        ) : null}
        {error ? <Text color="color.text.danger">{error}</Text> : null}
        <Inline space="space.100">
          <Button appearance="primary" onClick={save} isDisabled={busy}>{busy ? 'Saving…' : saveLabel}</Button>
          <Button appearance="subtle" onClick={onCancel} isDisabled={busy}>Cancel</Button>
        </Inline>
      </Stack>
    </Box>
  );
}
