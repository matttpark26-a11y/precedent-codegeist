# Your steps to finish Codegeist (deadline Dec 22, 2026, 12:00pm PST)

Everything below needs you personally: your voice, your accounts, or your agreement to terms. Each step says how long it takes.

Already done for you: the app is deployed to production, the install link is live (in `INSTALL_LINK.txt` and `SUBMISSION.md`), the code is public at https://github.com/matttpark26-a11y/precedent-codegeist, MCP is enabled, and the Teamwork Graph connector is connected.

---

## 1. Set up a clean demo project (5 min, do this right before recording)

1. In Jira, click **Spaces → Create space → Kanban → Select a team-managed space**.
2. Name: `Billing Platform`, key: `BILL`. Click **Next** until it's created.
3. Go to **Apps → Decision Log → Settings**, pick **Billing Platform (BILL)**, click **Load demo data**.
4. Wait for "Demo data loaded". You now have BILL-1…BILL-6 (history) and BILL-7…BILL-9 (new work that goes against it). BILL-7 and BILL-9 already have warning comments.

## 2. Record the demo video (about 1 hour including retakes)

Follow the shot list at the bottom of `SUBMISSION.md`. Practical tips:
- Use **QuickTime → File → New Screen Recording**, browser at full screen, zoom the page to 110–125% so text is readable.
- Record each shot separately and join them in iMovie or CapCut. Keep it under **5 minutes** (aim for 4).
- For the "confirm a suggestion" shot use **BILL-2** (IE11). For the conflict shot open **BILL-7**. For supersede use **BILL-9**.
- For the MCP shot, in Terminal: `cd "~/ai compresed/precedent"` then `claude`, and ask: *"Before I write this migration, use the precedent tools: has the team decided anything about the billing datastore?"*
- If Rovo Chat works by then, add a 20-second shot of the Precedent agent (it's in Rovo Chat → Browse agents).
- Upload to YouTube as **Public**. Copy the link.

## 3. Regenerate the install link after the last deploy (1 min)

The link installs a specific production version. After any later `forge deploy -e production`, open the [developer console → Distribution](https://developer.atlassian.com/console/myapps/fd902470-28c1-4525-b50e-6206031739cc/manage/distribution), click **Generate new link**, and paste the new one into Devpost. (Ask Claude to do the redeploy and update `SUBMISSION.md`.)

## 4. Marketplace bonus (optional, about 1–2 hours, aim for Dec 11–14)

Important: an app submitted to the Marketplace **can no longer be shared by install link**, and judges need the link. So the Marketplace version must be a **separate copy** of the app.

1. Ask Claude: *"make a Marketplace copy of Precedent"*. It will copy the project, run `forge register` (you accept the terms in your terminal), and deploy it to production.
2. Create a free **Marketplace vendor account**: https://marketplace.atlassian.com/manage/vendors/create (your agreement, your details).
3. In the copy's developer console → Distribution → **List on Marketplace**, fill in the listing. Ready-made copy is below.
4. Submit. Paste the **review ticket link** into Devpost. That's enough for the bonus; it doesn't need to be approved.

**Listing copy (paste as is):**
- **Name:** Precedent: Decision Memory for Jira
- **Tagline:** Know what your team already decided, and catch new work that goes against it.
- **Summary:** Precedent captures team decisions from Jira comments, shows them on every issue, and warns when a new issue reverses a decision or brings back an option the team rejected. A Rovo agent and an MCP server give the same answers inside Rovo Chat and in coding agents like Claude Code and Cursor. Decisions are published to the Teamwork Graph so Rovo Search can find them.
- **Highlights:**
  1. *Capture decisions where they happen*: comment `DECISION:` and it's on the record, with its reason and who decided.
  2. *Catch conflicts early*: new issues that undo a decision get one clear warning, with the original reasoning.
  3. *Change your mind safely*: supersede a decision and the history is kept.
- **Pricing:** Free
- **Privacy policy:** https://github.com/matttpark26-a11y/precedent-codegeist/blob/main/PRIVACY.md
- **Support:** https://github.com/matttpark26-a11y/precedent-codegeist/issues
- **Screenshots:** take 3–5 at 1840×900 from the demo project (issue panel with a conflict, Decision Log, Check an idea, MCP answer in Terminal).

## 5. Submit on Devpost (20 min, aim for Dec 19)

1. Go to https://codegeist2026.devpost.com → **Start project** (or "My projects" if you already started one).
2. Paste everything from `SUBMISSION.md`: name, tagline, "About the project", built with, category (**Apps for Software Teams**), bonus prizes, testing instructions.
3. Add the YouTube link, the GitHub link, and the **install link**.
4. Upload a cover image (1200×628). A screenshot of the issue panel with the conflict warning works well.
5. Fill in "What we learned" in `SUBMISSION.md` yourself (it's the one honest, personal part).
6. Click **Submit**. You can still edit until the deadline.

## Checklist
- [x] BILL demo project + demo data loaded
- [x] Video made: media/Precedent_Codegeist_2026_demo.mp4 (2:53). Upload to YouTube as Public
- [ ] Install link regenerated after the final deploy
- [ ] (Optional) Marketplace copy submitted, review ticket link saved
- [ ] (Optional) Rovo agent shot, if Rovo Chat is working
- [ ] Devpost form complete and submitted before **Dec 22, 12:00pm PST**
