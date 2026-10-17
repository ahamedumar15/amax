import type { ComponentType } from "react";
import type { z } from "zod";
import type { Tx } from "@amax/db";
import type { IconName } from "@amax/ui";
import type { Sensitivity } from "./audit";

/** What a screen receives: route params (":key" segments), query params (optional, 041) and the signed-in viewer (null in the guest preview). */
export type ScreenProps = { params: Record<string, string>; searchParams?: Record<string, string>; viewer: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * `mount` (051) serves the route under another module's URL space, e.g. allocations' Team section at
 * /delivery/p/:key/team. That module's ":read" still gates the URL, a mounted route wins over the
 * owner's route with the same path (the owner's is the fallback when the contributor is switched
 * off), and the contributor gets no import edge to the owner.
 */
export type ModuleRoute = { path: string; title: string; mount?: string; component: ComponentType<ScreenProps> | ComponentType<any> };

export type JobContext = { tx: Tx; tenantId: string; payload: Record<string, unknown>; jobId: string };
export type JobDef = {
  /** Unique across modules: "<module>.<job>". */
  name: string;
  /** Five-field cron, UTC. Omit for jobs only scheduled on demand with scheduleJob(). */
  cron?: string;
  run: (ctx: JobContext) => Promise<void>;
};

export type EventContext = { tx: Tx; tenantId: string; event: { id: string; name: string; payload: Record<string, unknown> } };
export type EventHandlerDef = {
  /** Stable id; together with the event id it makes delivery idempotent. */
  id: string;
  event: string;
  handle: (ctx: EventContext) => Promise<void>;
};

export type SharedFixtures = {
  tenant: { id: string; name: string };
  today: string;
  entities: { id: string; key: string; name: string; country: string; baseCurrency: string; headcount: number }[];
  departments: Record<string, number>;
  people: {
    key: string; name: string; initials: string; title: string; entity: string; roles: string[];
    manager?: string; status: "active" | "left" | "joining"; joined?: string; left?: string; probationEnds?: string;
  }[];
  projects: { key: string; name: string; client: string; manager: string; billing: "fixed" | "t&m" | "retainer"; contractValue: string; invoiced: string; currency: string }[];
};

/** A module's fixtures: seeds its own tables for the shared tenant, inside a tenant-scoped transaction. */
export type FixtureSeed = (ctx: { tx: Tx; tenantId: string; shared: SharedFixtures }) => Promise<void>;

/** An MCP tool (004). `run` gets the signed-in viewer from @amax/auth (opaque here) and validated input. */
export type McpToolDef = {
  name: string;
  description: string;
  input: z.ZodType;
  /** The permission the viewer needs (checked with canEver up front; the service checks scope again). */
  permission: string;
  scope: "read" | "write" | "sensitive";
  readOnly?: boolean;
  destructive?: boolean;
  /** Classified fields in the result (002 classes), so the AI gateway can redact them per tenant policy. */
  sensitive?: Partial<Record<string, Sensitivity>>;
  /**
   * A value only a person types, into a masked field on chat's confirm card (047 AC-4). It is never
   * part of `input`, so the model can neither see nor fill it; `run` gets it as `secret`.
   */
  secretInput?: { label: string };
  run: (viewer: never, input: never, source: "mcp" | "chat", secret?: string) => Promise<unknown>;
};

/**
 * One retention rule (032 AC-1): the data class (002 classes, or "personal" for identifying data
 * such as names), the period as an ISO 8601 duration ("P7Y"), what starts the clock, and what
 * happens when it runs out. The clock starts at the earliest set timestamp among the row's own
 * `start.at` columns, or once the row has gone `start.idle` without a change to its `updated_at`,
 * whichever comes first. Columns of the retained row, so there's no event-to-row mapping to get
 * wrong; a test checks they exist (review rounds 3 and 4).
 */
export type RetentionEntry = {
  table: string;
  fields: string[];
  class: Sensitivity | "personal";
  period: `P${string}`;
  start: { at: string[]; idle?: `P${string}` };
  action: "delete" | "anonymise";
};

/** A search hit for the built-in `search` tool and the chat. */
export type SearchHit = { type: string; id: string; title: string; url?: string; summary?: string };

export type ModuleManifest = {
  id: string;
  title: string;
  icon: IconName;
  group: "Work" | "People" | "Business" | "Operations";
  order?: number;
  primary?: boolean;
  /** Extra rail entries beyond the module's root (041): e.g. Proposals and Releases under delivery. */
  nav?: { path: string; title: string; icon: IconName }[];
  dependsOn?: string[];
  integratesWith?: string[];
  permissions?: string[];
  /**
   * Which roles get which permissions. A permission may carry a data-scope qualifier:
   * "time:approve@managed" (projects the viewer manages), "@assigned" (managed or assigned),
   * "@own" (the viewer's own records). Admin holds every permission. Nav needs "<id>:read".
   */
  grants?: Partial<Record<"Admin" | "Leadership" | "PM" | "Engineer" | "Finance" | "Sales" | "HR" | "Payroll" | "Employee", string[]>>;
  routes: ModuleRoute[];
  mcpTools?: McpToolDef[];
  /**
   * Contributes to the signed-in viewer's data scopes at load time (002 AC-3): e.g. delivery returns
   * the projects a user manages, so "@managed" grants work for real users, not just in tests.
   */
  viewerScopes?: (tx: Tx, user: { tenantId: string; userId: string }) => Promise<{ managedProjects?: string[]; assignedProjects?: string[]; reports?: string[] }>;
  /** Retention for tables holding personal data, in the 032 AC-1 shape so it can be enforced. */
  retention?: RetentionEntry[];
  /** Contributes results to the built-in `search` tool. */
  search?: (viewer: never, query: string) => Promise<SearchHit[]>;
  chatIntents?: unknown[];
  jobs?: JobDef[];
  /** Durable workflows (029): defineWorkflow() results from @amax/workflows, opaque to core. */
  workflows?: readonly unknown[];
  /** Cron schedules (029): cron() results from @amax/workflows, opaque to core. */
  schedules?: readonly unknown[];
  events?: { emits?: string[]; handles?: EventHandlerDef[] };
  fixtures?: FixtureSeed[];
};

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  if (!/^[a-z][a-z0-9-]*$/.test(manifest.id)) throw new Error(`module id "${manifest.id}" must be kebab-case`);
  if (!manifest.routes.some((r) => r.path === "" && !r.mount)) throw new Error(`module "${manifest.id}" needs a root route ("")`);
  for (const r of manifest.retention ?? []) {
    if (!r.start.at.length && !r.start.idle) throw new Error(`module "${manifest.id}": retention for ${r.table} never starts`);
  }
  return manifest;
}
