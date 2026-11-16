# git-accounts (change 108)

Each person links their GitHub login and the emails GitHub verified, so specclaw sync names them as owner of their
changes (091) and 104 drafts hours from their commits. A commit email alone proves nothing, since anyone can set it.

- **Owner:** `/modules/git-accounts/` in `.github/CODEOWNERS`
- **Screen:** `/git-accounts` (Git accounts, in the profile menu): GitHub's status, then the login and each verified email,
  pinnable. Connect and Disconnect are Ask amax buttons; nothing on the page writes.
- **Setup:** an Admin adds the GitHub OAuth app as one 031 credential, connector `github-oauth`, value
  `<client id>:<client secret>` (Settings › Integrations › GitHub accounts). The app's callback URL is
  `<AMAX_BASE_URL>/api/git/github/callback`. `AMAX_GITHUB_URL` and `AMAX_GITHUB_API_URL` point tests at a fake GitHub.
- **Connecting:** `connect_github` issues a single-use state (10 minutes, the same person; only its hash is kept in
  `git_accounts.connect_state`) and a link to GitHub's authorize page (`read:user user:email`). The app's callback
  route finishes through `completeGitHubConnect` (contracts): it reads the login and verified emails, keeps no token,
  stores them as verified `auth.git_identity` rows in one audited write, and withdraws open `delivery.git-identity`
  suggestions for that login. A login or email linked to someone else is skipped and named.
- **MCP tools** (`mcp.ts`): read `get_my_git_identities`, `get_my_git_identity`; write `connect_github`,
  `disconnect_github` (red card; owners kept), and for an Admin `unlink_git_identity`.
- **Events:** `git-accounts.github.connected`, `git-accounts.github.disconnected` (user id, login, email count).
- **Permissions:** `git-accounts:read` and `git-accounts:connect` (every role, for their own accounts),
  `git-accounts:unlink` (Admin).
- **Data:** `git_accounts.connect_state` (RLS on `tenant_id`; a user id and a state hash, no personal fields).
- **Fixtures:** none: people connect their own GitHub.
- **Tests:** `pnpm --filter @amax/git-accounts test` (DB tests need `DATABASE_MIGRATE_URL`)
