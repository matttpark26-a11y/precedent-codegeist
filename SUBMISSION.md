# Devpost submission: Precedent

Fill in the `[brackets]` after deploying. Everything else is ready to paste.

## Project name
Precedent

## Tagline (short description)
Your team's memory of what's already been decided. Precedent captures decisions from Jira, shows them on every issue, and warns when new work quietly reverses one, in Jira, in Rovo and in your coding agent over MCP.

## Category
Apps for Software Teams

## Bonus prizes entered
- **Best Agents:** `rovo:agent` "Precedent" with six `rovo:action` tools.
- **Best app with Atlassian MCP:** `rovo:mcp` module exposing the same six tools at `https://mcp.atlassian.com/forge/fd902470-28c1-4525-b50e-6206031739cc`, demoed from Claude Code.
- **Best Teamwork Graph integration:** `graph:connector` publishes every decision as an `atlassian:document` linked to its Jira issues (`issueIdOrKeys` associations), and reads linked pull requests back with the `jiraWorkItemLinkedExternalPullRequests` curated query.
- **Best Marketplace published app:** [listing link or Marketplace review ticket link]

## About the project

### Inspiration
The challenge says AI needs context: *who's doing what, what's already been decided, and what needs to happen next.* The middle one is the most expensive to lose. Every team has had the meeting where someone re-proposes the option that was rejected last spring, or the ticket that undoes an architecture decision because nobody who made it was in the room. The decision existed. It was buried in a Jira comment.

### What it does
- **Captures decisions where they're made.** Comment `DECISION: Use Postgres over DynamoDB for billing` (with an optional `Why:` line) and it is on record. Comments that sound like decisions ("we agreed to…", "we won't…") become one-click suggestions, so nothing is recorded without a human saying so.
- **Shows precedent where work happens.** The Precedent issue panel lists decisions made on the issue and on linked issues, related precedent ranked by relevance, and flags **conflicts**: the issue *reverses* an active decision, or *revives* an option the team explicitly rejected. It shows the decision, who made it, when, why, and a link to the original comment.
- **Warns at the right moment.** When a new issue clearly contradicts an active decision, Precedent leaves one comment citing it. The team either changes the plan or **supersedes** the decision with a new reason, and the old one stays in the record so history is never lost.
- **Rovo agent.** Ask "Has the team decided anything about our event bus?" or "Check BILL-7 against past decisions." It answers with decision IDs, dates, people and links, and can record or supersede decisions when you confirm.
- **MCP server.** The same tools are available in Claude Code, Cursor or any MCP client. A developer's coding agent can ask "has this been decided?" before it writes the migration.
- **Teamwork Graph.** Decisions are published into the graph linked to their Jira issues, so Rovo Search finds them alongside everything else. The decision brief pulls linked pull requests from the graph.
- **Decision Log.** One page for the whole ledger: filter, search, follow how a decision evolved, and paste any idea to check it against precedent.

### How we built it
- Atlassian Forge, Node.js 24 runtime, UI Kit (`@forge/react`) for the issue panel and Decision Log page.
- One manifest that combines `rovo:agent`, six `action` modules, `rovo:mcp` (the same actions as MCP tools), `jira:issuePanel`, `jira:globalPage`, `trigger` (`avi:jira:commented:issue`, `avi:jira:created:issue`), and `graph:connector`.
- A deterministic engine in plain JavaScript:
  - **Extraction:** cue phrases, hedge and question filtering, polarity (decided / decided against), rejected alternatives ("over", "instead of", "rather than", "not"), and rationale.
  - **Ranking:** BM25 plus a technology glossary, so "which database does billing use" finds "Use Postgres for billing".
  - **Conflict detection:** anchors on named things (Postgres, IE11, Okta) and tells *reverses* apart from *revives* and *aligned*, returning the evidence phrase.
- No LLM calls in the app: no cost, no variance, results judges can reproduce. Rovo provides the language understanding on top of evidence Precedent retrieves.
- Forge storage for the ledger, `@forge/teamwork-graph` `setObjects` for publishing, `requestTeamworkGraph` for reading.
- 29 unit tests plus a held-out evaluation (`npm run eval`).

### Challenges
- Telling "we decided" from "should we decide?": hedges and questions are filtered, and implicit decisions always need a human to confirm.
- Conflict detection without false alarms: an early version keyed on verbs and caught 4/10 fresh examples. Anchoring on named entities raised it to 6/7 caught with 0/7 false alarms on a second unseen set. A warning that cries wolf gets ignored, so we tuned for zero false alarms.
- One set of tools serving three audiences: the UI, a Rovo agent and external MCP clients all call the same service layer.

### Accomplishments
- One app, four surfaces (Jira, Rovo, MCP, Teamwork Graph), one source of truth.
- Supersede chains: changing your mind is a first-class action, and history is never deleted.

### What we learned
[fill in honestly after testing on the real site]

### What's next
Confluence decision pages and ADRs as sources, Bitbucket PR checks ("this PR reverses D-123"), per-project ledgers, and decision review dates ("revisit in 6 months").

## Built with
atlassian-forge, jira, rovo, rovo-agents, mcp, teamwork-graph, ui-kit, react, javascript, node.js

## How it meets the technology requirement
Precedent is a Forge app (Forge-hosted, UI Kit) that integrates with **Jira** (issue panel, global page, comment and issue-created triggers, REST), **Rovo** (`rovo:agent` + `rovo:action`), **Rovo MCP** (`rovo:mcp`) and the **Teamwork Graph** (`graph:connector` ingestion + curated-query reads).

## Testing instructions for judges
1. Install on your Jira site: https://developer.atlassian.com/console/install/fd902470-28c1-4525-b50e-6206031739cc?signature=AYABeCSZZUmeUYb6Ug4M5IylHiQAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBmjurZiFADPMMuYpjBdIfXwAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDIUjb8Ak11zjOZK62QIBEIA71VE2TpHwa2ge5C9KI%2Bn%2BBHtvu%2BSVw9fUZAGp2iqn9BFUvwDrLYZ6KiuAk1EEA1H1I6EDZiK7qMMZlm8AB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgH7BMqIjsFJ2W%2BSrPhMTf1uAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMPfO0J9C5umJen9suAgEQgDscwuMtGibdQ5PlQSwYWBvysHO3FzASa6lkQu3CInb8fqNxCNs6X0iUAPSdpY6HbPJUuBgqQ1Eo9lmSyQAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAf8D40AnPKIYKyRou%2FiYH1YAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAxKjEiBx7v3Tdop3I4CARCAO%2F51s28yZxgW7PB%2B8KYVIHVQxONcrjK07Zkxu6sBo%2FFVkQfR1Bl2d6UnXfwPkzP8Q1P%2BRzymmnNUUfxXAgAAAAAMAAAQAAAAAAAAAAAAAAAAAPTCEI%2BxR1MTbdFcX68QzEr%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADJJFiJ93I51rRfY60mTH1MVoYFYGqVHyUrTVB%2Brsz0VNBAmLjMdQQO%2Fb3Tt2ZwL2fVWJQE1nZ7%2FWL2o56tCsmOA%2BgA%3D&product=jira
   (Precedent runs on Atlassian: no external servers, no egress.)
2. Apps → **Decision Log** → **Settings** → pick any project → **Load demo data**. This creates 6 issues with a decision history and 3 new issues that go against it.
3. Open the issue "Migrate billing service to DynamoDB…" and open Precedent from **View app actions** under the title. The Precedent panel shows a *Revives a rejected option* warning citing the Postgres decision, and the issue has a warning comment.
4. On any issue, comment `DECISION: Use pnpm instead of npm for the monorepo` with a `Why:` line. Within a minute or two it appears in the panel and in the Decision Log.
5. Apps → **Decision Log** → *Check an idea*: paste "Move invoice events from Kafka to SQS".
6. Rovo Chat → agent **Precedent** → "What have we decided about the billing service?"
7. MCP: in Atlassian Administration → Apps → Sites → Connected apps → Precedent → Details → **Enable tools**. Then `claude mcp add --transport http precedent https://mcp.atlassian.com/forge/fd902470-28c1-4525-b50e-6206031739cc` and run `/mcp` to sign in.

## Links
- Demo video: https://youtu.be/U6trTce-bEs
- Code: https://github.com/matttpark26-a11y/precedent-codegeist

---

# Demo video script (target 4:00, hard limit 5:00)

| Time | Show | Say |
|---|---|---|
| 0:00–0:20 | Title card: Precedent, tagline | "Every team has a decision that keeps coming back. Precedent is your team's memory of what's already been decided." |
| 0:20–0:45 | Jira BILL-1 comment thread | "Eight months ago, this team chose Postgres over DynamoDB for billing, for a reason. That reason lives in a comment nobody will ever find." |
| 0:45–1:15 | Type a comment `DECISION: …` + `Why:` → panel refreshes | "With Precedent, a line starting DECISION is on the record, with its reason, linked to the issue, and published to the Teamwork Graph." |
| 1:15–1:35 | BILL-2 panel: suggested decision → "Yes, record it" | "Decisions written as plain prose are suggested, never assumed. A human confirms." |
| 1:35–2:15 | Create BILL-7 "Migrate billing to DynamoDB" → warning comment + panel conflict card | "Now a new engineer files this. Precedent flags it: it revives an option the team rejected, here's who decided, when and why." |
| 2:15–2:40 | Click Supersede, enter new decision + reason → Decision Log history | "If the world changed, supersede it. The old decision stays in the record, so the why is never lost." |
| 2:40–3:15 | Rovo Chat → Precedent agent → "Check BILL-9 against past decisions" | "The Rovo agent uses the same tools: it searches, checks and records, always citing its sources." |
| 3:15–3:45 | Terminal: Claude Code with Precedent MCP → "Before I write this migration, has the team decided anything about the billing datastore?" | "And through MCP, your coding agent checks precedent before it writes code." |
| 3:45–4:00 | Rovo Search finding a decision (Teamwork Graph) + closing card | "Decisions live in the Teamwork Graph, next to the work they shaped. Precedent: ship with confidence, because you know what's already been decided." |
