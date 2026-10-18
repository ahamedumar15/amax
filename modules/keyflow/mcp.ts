import { z } from "zod";
import type { McpToolDef, PinnedRecord, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { PROFILE_SENSITIVE } from "./contracts";
import { ctxFor } from "./server/context";
import { getSyncError, getSyncRun, syncOverview } from "./server/overview";
import { getRecord, personProfile } from "./server/profile";
import { connectKeyflow, dismissSyncError } from "./server/services";
import { peopleWithProfiles } from "./server/search";

type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const status = { scope: "read" as const, readOnly: true, permission: "keyflow:read" };
const profile = { scope: "read" as const, readOnly: true, permission: "keyflow:profile", sensitive: PROFILE_SENSITIVE };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const runOf = (r: { id: string; startedAt: string } | null): PinnedRecord | null => (r ? { id: r.id, label: `Keyflow sync, ${when(r.startedAt)}` } : null);
const errorOf = (e: { id: string; personName: string | null; externalRef: string | null } | null): PinnedRecord | null => (e ? { id: e.id, label: `Keyflow sync error, ${e.personName ?? e.externalRef}` } : null);
const profileOf = (p: { personId: string; name: string } | null): PinnedRecord | null => (p ? { id: p.personId, label: `${p.name}, Keyflow performance` } : null);
const NOUN = { goal: "goal", review: "review score", recognition: "recognition" } as const;
const recordOf = (r: { id: string; kind: keyof typeof NOUN; personName: string } | null): PinnedRecord | null => (r ? { id: r.id, label: `${r.personName}, Keyflow ${NOUN[r.kind]}` } : null);

export const mcpTools: McpToolDef[] = [
  tool({ ...status, pin: "view", name: "get_keyflow_sync", description: "The Keyflow sync at a glance: where it points (or the sandbox), open sync errors first, people and teams sent, goals, review scores and recognition received, and the latest runs. The sync runs every 15 minutes as the keyflow.sync job.",
    input: z.object({}), run: (v) => syncOverview(v) }),
  tool({ ...status, pin: { id: "runId", of: runOf }, name: "get_keyflow_sync_run", description: "One Keyflow sync run: when, how it ended, what went out and came in, and the errors it hit.",
    input: z.object({ runId: z.uuid() }), run: (v, a) => getSyncRun(v, a.runId) }),
  tool({ ...status, pin: { id: "errorId", of: errorOf }, name: "get_keyflow_sync_error", description: "One Keyflow sync error: what failed, for which person or Keyflow record, how many runs hit it.",
    input: z.object({ errorId: z.uuid() }), run: (v, a) => getSyncError(v, a.errorId) }),
  tool({ ...profile, pin: { id: "personId", of: profileOf }, name: "get_keyflow_profile", description: "A person's goals, review scores and recognition from Keyflow. Review scores show only to HR, Leadership, the person and their manager.",
    input: z.object({ personId: z.string().describe("The person's id or employee number") }), run: (v, a) => personProfile(v, a.personId) }),
  tool({ ...profile, pin: { id: "recordId", of: recordOf }, name: "get_keyflow_record", description: "One goal, review score or recognition from Keyflow, by its id.",
    input: z.object({ recordId: z.uuid() }), run: (v, a) => getRecord(v, a.recordId) }),
  tool({ name: "connect_keyflow", description: "Point amax at the tenant's Keyflow (a public https address). The key itself is the Keyflow credential under Settings, Connections and keys. A new address sends everyone again.",
    scope: "write", permission: "keyflow:manage", input: z.object({ endpoint: z.url() }), run: (v, a, s = "mcp") => connectKeyflow(ctxFor(v, s), a) }),
  tool({ name: "dismiss_keyflow_sync_error", description: "Dismiss an open Keyflow sync error once it is dealt with. If the record fails again, a new error opens.",
    scope: "write", permission: "keyflow:manage", input: z.object({ errorId: z.uuid() }), run: (v, a, s = "mcp") => dismissSyncError(ctxFor(v, s), a) }),
];

// Contribution to the built-in search tool: a person's Keyflow performance page.
export const search = (viewer: Viewer, query: string): Promise<SearchHit[]> => peopleWithProfiles(viewer, query);
