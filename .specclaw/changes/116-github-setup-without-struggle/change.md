# GitHub setup without the struggle: one card for the GitHub app, chat that suggests it, a nudge to connect, and no emails in the audit record

**Change:** 116-github-setup-without-struggle · **Created:** 2026-11-16 · **Review:** change

## Problem

Setting up a real GitHub connect on 2026-11-16 took six tries.

- Chat filed the credential under `github` instead of `github-oauth`.
- The value was saved without its client id, then saved as the literal placeholder `<Client ID>:<Client secret>`.
- GitHub refused the return address because the app's Redirect URI was the homepage.
- With no key service set, every save failed.

Each of these showed only "I can't tell whether this was done". People who haven't connected aren't told to, so their commits aren't credited to them. And the connect's audit record stores the full list of linked emails, which an Admin's raw audit export would show after the person disconnects. Asked by the product owner (2026-11-16): make it effortless, and keep emails private.

## Mock Delta

What changes on screen, and where to see it: [`116-github-setup-without-struggle`](../../mock/index.html#116-github-setup-without-struggle)

- Overview, for a person who isn't connected: a "Connect GitHub" attention item.
- Settings › Integrations: the GitHub app row with its status, and chat suggestions to add, rotate or remove the app.
- The new **Set up the GitHub app** card: a Client ID field, a masked Client secret, and the callback URL to copy into GitHub.
- The clear refusals that replace "I can't tell whether this was done".

## Acceptance Criteria

1. **AC-1** A new MCP write tool `set_github_app` (in `modules/git-accounts/mcp.ts`, permission
   `secrets:credential:manage`) takes `clientId` as input and the client secret from the card's masked field. It stores
   or rotates the `github-oauth` credential as `<clientId>:<secret>`. Its confirm card shows:
   - the Client ID
   - the masked **Client secret** field
   - "Callback URL to paste into GitHub: `<callback URL>`", using the same URL `redirectUri()` builds, with a Copy button
   - "Adds" or "Replaces" the GitHub app, depending on whether one is set

   The card refuses a client id with a space, `<`, `>` or `:` in it, and a secret shorter than 20 characters or holding
   whitespace or `:`.
2. **AC-2** `put_secret` and `rotate_secret` for `github-oauth` refuse a value without one colon separating a non-empty
   id and secret, with "Use set_github_app: the GitHub app needs its Client ID and Client secret". Chat's "add or rotate
   the GitHub app" prompts pick `set_github_app`.
3. **AC-3** On `/settings/integrations`, chat suggests to an Admin:
   - **Set up the GitHub app** (`set_github_app`) when `github-oauth` is not set
   - **Rotate the GitHub app secret** (`set_github_app`) and **Remove the GitHub app** (`revoke_secret`, connector
     `github-oauth`) when it is

   Nobody else gets these suggestions.
4. **AC-4** The Integrations "GitHub accounts" row shows "Configured · rotated <date>" or "Not configured". It is pinnable
   through `get_github_app_status`, which also returns `rotatedAt` and the callback URL.
5. **AC-5** Overview leads with a "Connect GitHub so your commits and proposals are credited to you" attention item for
   a person who:
   - holds `git-accounts:connect`
   - has no GitHub login linked
   - is in a workspace with the GitHub app set up

   The item has **Ask amax · Connect GitHub** (opens chat with "Connect my GitHub"), is pinnable (`get_my_git_identities`)
   and can be dismissed for 30 days. It doesn't show once the person is connected or while the app isn't set up.
6. **AC-6** Clear refusals, never "I can't tell whether this was done", each with the tool's `invalid_input` code:
   - Connect with a malformed credential: "The GitHub app's credential is incomplete; an Admin sets it up again with Set up the GitHub app".
   - Any credential write with no key service configured: "amax can't store credentials yet: no key service is set (`AMAX_KMS`); an operator sets it".
   - Connect with a GitHub-reported redirect mismatch on return: "GitHub refused amax's callback URL; an Admin pastes `<callback URL>` into the GitHub app's Redirect URIs".
7. **AC-7** The connect's and disconnect's audit records keep counts, not addresses: `after` is
   `{ summary, login, linked: <n>, removed: <n>, skipped: <n> }`. No email address is written to `core.audit_event` by
   git-accounts. The event payload stays `{ userId, login, emails: <n> }`.
8. **AC-8** Unchanged and tested:
   - Every Git accounts read stays the viewer's own.
   - The Admin unlink still works by id.
   - `pnpm lint` (graph check included), `pnpm test` for git-accounts, core and web admin, and the `git-accounts` e2e pass.
   - The new UI is keyboard-complete, its fields are labelled, errors are announced, and it works in light and dark themes.
9. **AC-9** The clickable mock's markup is balanced, so sections 050 to 116 render (approved by the product owner
   2026-11-16). Sections 047, 049 and 048 are missing four closing tags (047's confirm `div.card` and three `</section>`),
   so the browser nests every later section inside 047's hidden section. Only those closing tags are added: no content
   in 047, 048 or 049 changes. An HTML parse of the mock finds no unclosed element, and
   `apps/mock/public/mock/index.html` matches.

## Tasks

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
