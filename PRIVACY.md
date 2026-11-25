# Precedent: privacy and data handling

**What is stored:** decision records (statement, rationale, rejected alternatives, status, linked Jira issue keys, the Atlassian account ID of the person who decided, timestamps, and a link to the source comment). Settings: whether new-issue warnings are on, and the Teamwork Graph connection ID.

**Where:** Atlassian Forge hosted storage for the installation. Decisions are also published to the customer's own Atlassian Teamwork Graph when an admin connects it. Nothing is sent to any server outside Atlassian. The app declares no external egress.

**What is read:** Jira issue summaries, descriptions, labels, links and comments, only to find decisions and check new issues against them. Comment text is not stored unless it contains a decision.

**Who can see it:** anyone who can use the app on the site. Graph documents are visible to the site workspace. Don't record decisions containing secrets or personal data.

**Retention:** records stay until the app is uninstalled. Uninstalling deletes Forge storage. Disconnecting the Teamwork Graph connection deletes the published documents.

**AI:** Precedent itself makes no LLM calls. The Rovo agent runs on Atlassian Rovo under the customer's Rovo terms.

Contact: open an issue on the project repository.
