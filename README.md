# Precedent

**Your team's memory of what's already been decided.** A Forge app for Jira with a Rovo agent, an MCP server and Teamwork Graph integration. Built for Codegeist 2026 (Apps for Software Teams).

Teams keep re-arguing settled questions. The reason something is the way it is lives in a Jira comment from eight months ago, and new tickets quietly reverse old decisions. Precedent captures decisions where they're made, shows them where work happens, and warns when new work goes against them.

## Install Precedent on your Jira site

**[Click here to install Precedent](https://developer.atlassian.com/console/install/fd902470-28c1-4525-b50e-6206031739cc?signature=AYABeCSZZUmeUYb6Ug4M5IylHiQAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBmjurZiFADPMMuYpjBdIfXwAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDIUjb8Ak11zjOZK62QIBEIA71VE2TpHwa2ge5C9KI%2Bn%2BBHtvu%2BSVw9fUZAGp2iqn9BFUvwDrLYZ6KiuAk1EEA1H1I6EDZiK7qMMZlm8AB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgH7BMqIjsFJ2W%2BSrPhMTf1uAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMPfO0J9C5umJen9suAgEQgDscwuMtGibdQ5PlQSwYWBvysHO3FzASa6lkQu3CInb8fqNxCNs6X0iUAPSdpY6HbPJUuBgqQ1Eo9lmSyQAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAf8D40AnPKIYKyRou%2FiYH1YAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAxKjEiBx7v3Tdop3I4CARCAO%2F51s28yZxgW7PB%2B8KYVIHVQxONcrjK07Zkxu6sBo%2FFVkQfR1Bl2d6UnXfwPkzP8Q1P%2BRzymmnNUUfxXAgAAAAAMAAAQAAAAAAAAAAAAAAAAAPTCEI%2BxR1MTbdFcX68QzEr%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADJJFiJ93I51rRfY60mTH1MVoYFYGqVHyUrTVB%2Brsz0VNBAmLjMdQQO%2Fb3Tt2ZwL2fVWJQE1nZ7%2FWL2o56tCsmOA%2BgA%3D&product=jira)**, choose your Jira site, and approve. Then open **Apps → Decision Log → Settings → Load demo data** to see it work in about a minute.

Demo video: https://youtu.be/U6trTce-bEs

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
