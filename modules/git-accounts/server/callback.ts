import { z } from "zod";
import { logError, type ServiceContext } from "@amax/core/server";
import { RESULTS, type ResultCode } from "../words";
import { completeConnect } from "./connect";
import { isGitHubReplyError } from "./github";

/** The app slot this module fills (final pass 2): GitHub's return, as the Git accounts screen's query. */
export const GITHUB_CALLBACK_SLOT = "app.github-callback";
export type GitHubCallback = (ctx: ServiceContext, params: Record<string, string>) => Promise<Record<string, string>>;

const Query = z.object({ state: z.string().min(16).max(200), code: z.string().min(1).max(200) });
const isCode = (r: unknown): r is ResultCode => typeof r === "string" && Object.hasOwn(RESULTS, r);

/**
 * 108 AC-2, AC-3, AC-11: GitHub's return, owned by the module; the app's route only reads this slot, so removing the
 * module leaves the app building. The query it gives back carries a result code and a count, never text or an email.
 */
export const githubCallback: GitHubCallback = async (ctx, params) => {
  if (params.error) return { github: params.error === "access_denied" ? "denied" : "incomplete" };
  const q = Query.safeParse(params);
  if (!q.success) return { github: "incomplete" };
  try {
    const r = await completeConnect(ctx, q.data);
    return { github: "connected", ...(r.skipped.length ? { skipped: String(r.skipped.length) } : {}) };
  } catch (e) {
    const reason = (e as { reason?: unknown } | null)?.reason;
    if (isCode(reason)) return { github: reason };
    if (isGitHubReplyError(e)) return { github: "github" };
    logError("git-accounts.callback", e);
    return { github: "error" };
  }
};
