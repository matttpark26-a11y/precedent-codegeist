# Precedent — Codegeist 2026 plan

**Deadline:** Dec 22, 2026 @ 12:00pm PST (28 days from Nov 24).
**Category:** Apps for Software Teams.
**Bonus prizes targeted:** Best Agents (rovo:agent + rovo:action) · Best app with Atlassian MCP (rovo:mcp) · Best Teamwork Graph integration (graph:connector ingest + curated-query read) · Best Marketplace published app.

## The problem
Teams re-argue questions they already settled. The answer to "why did we do it this way?" is buried in a Jira comment from eight months ago, or a Confluence page nobody links to. New tickets quietly reverse old decisions. New hires and AI coding agents have no way to know what was ruled out. The challenge text says it directly: teams need to know *"what's already been decided."*

## The product
**Precedent: your team's memory of what's already been decided.**

1. **Capture.** Decisions are recorded from:
   - Jira comments starting with `DECISION:` (captured automatically as *active*)
   - Jira comments or Confluence pages that *sound* like a decision ("we agreed to…", "we won't…") (captured as *suggested*, one click to confirm)
   - the issue panel, the Rovo agent, or any MCP client (Claude, Cursor)
2. **Surface.** A Jira issue panel shows the past decisions that matter for that issue, ranked by relevance. It flags **conflicts**: the issue reverses an active decision, or revives an option the team rejected.
3. **Reason.** The Rovo agent "Precedent" answers "has this been decided?", checks a proposal against precedent, records new decisions, and supersedes old ones, always citing the source.
4. **Everywhere.** The same tools are exposed through `rovo:mcp`, so a developer's coding agent can check precedent before writing code.
5. **Graph.** Every decision is pushed into the Teamwork Graph as a document linked to its Jira issues, so it shows up in Rovo Search and Chat. Linked pull requests are read back from the graph into the decision brief.
6. **Decision Log.** A Jira global page holds the whole ledger: search, filter by status, follow supersede chains.

## Architecture
```
Jira comment / Confluence page ──trigger──▶ extract.js (cue + polarity + alternatives)
                                              │
Issue panel (UI Kit) ─resolver─┐              ▼
Decision Log page   ─resolver─┤        store.js (Forge KVS)  ──▶ graph.js ──▶ Teamwork Graph (setObjects)
Rovo agent  ─rovo:action──────┤              ▲
MCP clients ─rovo:mcp tools───┘──▶ actions.js ┤
                                              ├── search.js  (BM25 ranking, no LLM, deterministic)
                                              └── conflict.js (reversal / revived-alternative detection)
```
- Deterministic core (extraction, ranking, conflict checks) is pure JS with unit tests. No Forge LLM is needed, so there's no cost and the results are repeatable for judges.
- Rovo supplies the language reasoning on top of the retrieved evidence.
- Least-privilege scopes, no external egress, data stays in Forge storage plus the customer's own graph.

## Milestones
| Dates | Milestone |
|---|---|
| Nov 24–25 | Engine + all modules written, unit tests pass, `forge lint` clean (done in this session) |
| Nov 25–27 | **You:** dev site + `forge login`. Then `forge register`, deploy, install, fix whatever the real platform rejects |
| Nov 28–Dec 5 | Seed demo data (`npm run seed`), test every surface on the real site, connect the TWG connector, enable MCP, try it from Claude Code |
| Dec 6–10 | Polish UI, edge cases, second test user, app icon |
| Dec 11–14 | Marketplace listing submitted (privacy policy, support link, listing copy, screenshots) |
| Dec 15–18 | Record the < 5 min demo video, write the Devpost text, make the installation link |
| Dec 19 | Submit (3 days of buffer before the Dec 22 deadline) |

## Risks
- `rovo:mcp`, `rovo:agent` and the TWG API are **Preview**. If one fails to deploy, it gets removed and the rest still ships.
- Rovo must be active on the dev site (free developer sites include it; check after creation).
- The TWG connector needs an org admin to connect it on the site (you are admin on your own dev site).
- Event payload shapes (comment body format) are verified from real `forge logs` after the first deploy. The extractor already accepts ADF or plain text.
