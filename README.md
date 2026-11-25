# Precedent

**Your team's memory of what's already been decided.** A Forge app for Jira with a Rovo agent, an MCP server and Teamwork Graph integration. Built for Codegeist 2026 (Apps for Software Teams).

Teams keep re-arguing settled questions. The reason something is the way it is lives in a Jira comment from eight months ago, and new tickets quietly reverse old decisions. Precedent captures decisions where they're made, shows them where work happens, and warns when new work goes against them.

## What it does

| Surface | What you get |
|---|---|
| **Jira comments** | A line starting `DECISION:` is recorded instantly (a `Why:` line under it becomes the rationale). Comments that *sound* like decisions ("we agreed to…", "we won't…") become suggestions you confirm in one click. |
| **Issue panel** | Decisions on this issue and on linked issues, related precedent ranked by relevance, and a **conflict warning** when the issue reverses a decision or revives an option the team rejected. Record, confirm, link or supersede decisions without leaving the issue. |
| **New-issue watch** | When someone creates an issue that clearly contradicts an active decision, Precedent adds one warning comment that cites the decision. Can be turned off. |
| **Decision Log** (Jira app page) | The whole ledger: filter by status, search, see how a decision evolved, and check any idea against precedent. |
| **Rovo agent "Precedent"** | "Has the team decided anything about X?", "Check this issue against past decisions", "Record that we're going with Kafka." Always cites decision IDs, dates, people and sources. |
| **MCP server** | The same six tools for Claude Code, Cursor or any MCP client, so a coding agent checks precedent before it writes code. |
| **Teamwork Graph** | Every decision is published as a graph document linked to its Jira issues, so Rovo Search and Chat can find it. Linked pull requests are read back from the graph into the decision brief. |

## Tools (shared by the Rovo agent and MCP)
`search-decisions`, `check-proposal`, `record-decision`, `supersede-decision`, `decision-history`, `decision-brief`

## How it works
```
src/engine/   extract.js   finds decisions in text: cue phrases, polarity, rejected alternatives, rationale
              search.js    BM25 ranking with a tech glossary ("database" finds "Postgres")
              conflict.js  reverses / revives / aligned / related, with the evidence phrase
src/store.js   ledger on Forge storage: create, dedupe, confirm, dismiss, supersede chains
src/service.js everything the app can do, independent of the caller
src/index.js   Forge handlers: Rovo actions, UI resolvers, triggers, graph connector
src/frontend/  UI Kit issue panel + Decision Log page
```
The core is deterministic: no LLM calls, no cost, repeatable results. Rovo adds the language reasoning on top of evidence the engine retrieves. Data stays in Forge storage and the customer's own Teamwork Graph. There is no external egress.

## Develop
Requires Node 22.23+, 24.22+ or 26.12+, and the Forge CLI (`npm i -g @forge/cli`).
```bash
npm install
npm test          # 30 unit tests: engine, service, demo loader, graph object shape
npm run eval      # held-out examples: extraction + conflict accuracy
forge login
forge register    # first time only: gives the app its own ID
forge deploy
forge install     # choose Jira and your site
```
**Try it in one click:** Apps → Decision Log → Settings → **Load demo data**. It creates a small billing team's decision history (6 issues) and 3 new issues that go against it, so the warnings appear immediately.

### Admin steps on the site
- **Rovo** must be active on the site for the agent.
- **Teamwork Graph:** Atlassian Administration → Apps → Sites → your site → Connected apps → Precedent → Connections → Connect.
- **MCP:** same app page → Tools → enable. Then:
  `claude mcp add --transport http precedent https://mcp.atlassian.com/forge/<app-id>` (the app ID is the UUID at the end of `app.id` in `manifest.yml`).

## Accuracy (honest numbers)
On held-out examples in `scripts/eval.mjs`: decision extraction 8/8. Conflict detection caught 6/7 real conflicts with 0/7 false alarms on harmless tickets. It misses conflicts that need real language understanding (e.g. "extend v1 support" vs "sunset v1"). That is what the Rovo agent is for.

## License
MIT
