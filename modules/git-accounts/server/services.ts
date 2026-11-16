import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { EVENTS } from "../contracts";
import { CONNECT, selfOf, UNLINK } from "./context";

const refuse = (message: string, code = "invalid_input") => Object.assign(new Error(message), { retryable: false, code });

/** 108 AC-7: the viewer's GitHub login and every email under it, gone. Proposals they already own keep their owner. */
export const disconnectGitHub = defineService({
  name: "git-accounts.github.disconnect", action: CONNECT, resource: "auth.git_identity", input: z.object({}),
  async run(tx, _input, ctx) {
    const userId = selfOf(ctx);
    const gone = await tx.execute(sql`delete from auth.git_identity where user_id = ${userId} and provider = 'github' returning login, email`);
    if (!gone.length) throw refuse("GitHub isn't connected");
    const removed = gone.map((r) => ({ login: r.login as string, email: (r.email as string | null) ?? null }));
    return { result: { login: removed[0].login, removed: removed.length }, resourceId: userId, before: { removed }, after: { removed: removed.length },
      events: [{ name: EVENTS.disconnected, payload: { userId, login: removed[0].login, emails: removed.length } }] };
  },
});

/** 108 AC-8: an Admin unlinks one identity of anyone, audited with what it was. */
export const unlinkIdentity = defineService({
  name: "git-accounts.identity.unlink", action: UNLINK, resource: "auth.git_identity", input: z.object({ identityId: z.uuid() }),
  async run(tx, input) {
    const [r] = await tx.execute(sql`delete from auth.git_identity where id = ${input.identityId} returning user_id, provider, login, email`);
    if (!r) throw refuse("no such Git identity", "not_found");
    const before = { userId: r.user_id as string, provider: r.provider as string, login: r.login as string, email: (r.email as string | null) ?? null };
    return { result: { unlinked: `${before.login}${before.email ? ` (${before.email})` : ""}` }, resourceId: input.identityId, before,
      events: [{ name: EVENTS.disconnected, payload: { userId: before.userId, login: before.login, emails: 1 } }] };
  },
});
