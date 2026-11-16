import { z } from "zod";
import { logError, type GitHubCallback } from "@amax/core/server";
import { completeConnect, resultCodeOf } from "./connect";

const Query = z.object({ state: z.string().min(16).max(200), code: z.string().min(1).max(200) });

/**
 * 108 AC-2, AC-3, AC-11: GitHub's return, owned by the module; the app's route only reads the core-declared slot, so
 * removing the module leaves the app building. The query it gives back only asks the screen to show its note; the note
 * itself comes from the person's connect record (112 AC-2).
 */
export const githubCallback: GitHubCallback = async (ctx, params) => {
  if (params.error) return { github: params.error === "access_denied" ? "denied" : "incomplete" };
  const q = Query.safeParse(params);
  if (!q.success) return { github: "incomplete" };
  try {
    await completeConnect(ctx, q.data);
    return { github: "connected" };
  } catch (e) {
    const code = resultCodeOf(e);
    if (code === "error") logError("git-accounts.callback", e);
    return { github: code };
  }
};
