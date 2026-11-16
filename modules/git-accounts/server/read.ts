import { gitIdentitiesOf } from "@amax/auth/git-identity";
import type { Viewer } from "@amax/auth";
import { hasSecret } from "@amax/core/secrets";
import type { GitAccounts } from "../contracts";
import { read } from "./context";

/** 108 AC-6: the viewer's Git accounts: whether GitHub is set up here, and their login with its verified emails. */
export const myGitAccounts = (v: Viewer) => read(v, async (tx): Promise<GitAccounts> => {
  const mine = (await gitIdentitiesOf(tx, v.userId)).filter((g) => g.provider === "github");
  return {
    configured: await hasSecret(tx, "github-oauth"),
    github: mine.length ? { login: mine[0].login, emails: mine.filter((g) => g.email).map((g) => ({ id: g.id, email: g.email!, verified: g.emailVerified })) } : null,
  };
});

/** One of the viewer's own identities, for its pin. */
export const myIdentity = async (v: Viewer, id: string) => {
  const g = (await myGitAccounts(v)).github;
  const e = g?.emails.find((x) => x.id === id);
  return e && g ? { id: e.id, login: g.login, email: e.email, verified: e.verified } : null;
};
