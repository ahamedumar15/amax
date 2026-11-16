import { z } from "zod";
import { logError, type GitHubCallback } from "@amax/core/server";
import { completeConnect, recordReturn, resultCodeOf } from "./connect";

const Query = z.object({ state: z.string().min(16).max(200), code: z.string().min(1).max(200) });

/**
 * 108 AC-2, AC-3, AC-11: GitHub's return, owned by the module; the app's route only reads the core-declared slot, so
 * removing the module leaves the app building. Every return is recorded on the state it carries, and the screen is sent
 * that record's id, so its note is about this return and comes from the record, never the URL (112 AC-2).
 */
export const githubCallback: GitHubCallback = async (ctx, params) => {
  const code = await outcome(ctx, params);
  const state = typeof params.state === "string" ? params.state : "";
  const { id } = state ? await recordReturn(ctx, { state, result: code }).catch((e: unknown) => { logError("git-accounts.result", e); return { id: null }; }) : { id: null };
  const query: Record<string, string> = { github: "1" };
  if (id) query.ref = id;
  return query;
};

/** What this return came to, as a result code. */
async function outcome(ctx: Parameters<GitHubCallback>[0], params: Record<string, string>) {
  if (params.error) return params.error === "access_denied" ? "denied" : "incomplete";
  const q = Query.safeParse(params);
  if (!q.success) return "incomplete";
  try {
    await completeConnect(ctx, q.data);
    return "connected";
  } catch (e) {
    const code = resultCodeOf(e);
    if (code === "error") logError("git-accounts.callback", e);
    return code;
  }
}
