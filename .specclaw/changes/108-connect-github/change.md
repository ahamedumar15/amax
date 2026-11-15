# Connect GitHub: each person links their GitHub login and verified emails, so their commits and proposals carry their name

**Change:** 108-connect-github · **Created:** 2026-11-15 · **Review:** change

## Problem

amax gives a spec proposal its owner, and drafts 104's hours, only for a commit email that is a person's account email
or a verified git identity. The only way to verify one today is a push webhook plus an Admin accepting a link
suggestion, and only for an email that already matches the account. GitHub no-reply addresses
(`<id>+<login>@users.noreply.github.com`) and second addresses never match, so on the amax repo every proposal comes in
Unassigned. A commit email alone proves nothing, since anyone can set it in `git config`. Asked 2026-11-15 by the
product owner (Umar Ahamed): let each person connect their GitHub account so their emails are read, stored and used.

**Out of scope:** Azure DevOps (the same shape, later); the amax plugin offering project setup.

## Mock Delta

What changes on screen, and where to see it: [`108-connect-github`](../../mock/index.html#108-connect-github)

The profile menu gains **Git accounts**. The screen shows GitHub "Not connected" with **Ask amax · Connect GitHub**; chat
answers with a card whose button opens GitHub. Once approved it shows "Connected as @kasun-dias" and the verified emails
amax will match commits by, with **Ask amax · Disconnect**. With no GitHub app configured it says an Admin sets it up.

## Acceptance Criteria

1. **AC-1** With `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` set, a person can connect GitHub: chat's **Connect
   GitHub** card opens GitHub's authorize page (scopes `read:user user:email`), and GitHub returns to amax's callback.
   Without them, the Git accounts screen and chat say "GitHub isn't set up for this workspace; an Admin adds the GitHub
   app", and Settings › Integrations shows GitHub accounts as not configured.
2. **AC-2** The callback accepts only a `state` it issued to the same signed-in person, once, within 10 minutes;
   anything else is refused and nothing is linked.
3. **AC-3** On approval amax reads the GitHub user (login and numeric id) and every email GitHub marks verified,
   including the no-reply one, and stores each as a verified `auth.git_identity` (provider github) for that person, in
   one audited write (`<person> connected GitHub as @login: 3 emails`). Unverified GitHub emails are not stored. amax
   keeps no GitHub token after the callback.
4. **AC-4** One GitHub login can hold several emails (the schema allows it). Reconnecting updates the set: emails
   GitHub no longer lists are removed, new ones added.
5. **AC-5** A login or email already linked to someone else is not taken over: it is skipped, the screen names it
   (`kasun@example.test is linked to another person; ask an Admin`), and the rest are linked.
6. **AC-6** The profile menu has **Git accounts**. The screen leads with the connection status, then the login and its
   verified emails, each with a PinButton. Connect and Disconnect are Ask amax intent buttons; there are no write
   controls on the page.
7. **AC-7** "Disconnect GitHub" in chat shows a red confirm card listing what goes ("@kasun-dias and 2 emails");
   confirming removes those identities, audited. Proposals already owned keep their owner.
8. **AC-8** MCP tools: `get_my_git_identities` (read), `connect_github` (returns a single-use connect link for the
   caller), `disconnect_github` (write), and for an Admin `unlink_git_identity` (one identity of any person, audited).
9. **AC-9** After connecting, the next specclaw sync names the person as owner of the changes whose author email is one
   of theirs (091's rule, unless a person set the owner), and 104 drafts hours for their commits where commit time is on.
10. **AC-10** Open `delivery.git-identity` link suggestions for an email the person just connected close as resolved.
11. **AC-11** The screen and cards are keyboard-complete, labelled, and read in light and dark themes; the return from
    GitHub announces the result (aria-live).

## Tasks

<!-- Added by plan, UI first, then backend, then integration, in tasks.md's task-line
     format: checkbox, `Tn`, em dash, title; then indented Files: and optional Depends: lines. -->

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
