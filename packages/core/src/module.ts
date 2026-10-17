import type { ComponentType } from "react";
import type { Tx } from "@amax/db";
import type { IconName } from "@amax/ui";

export type ModuleRoute = { path: string; title: string; component: ComponentType };

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

export type ModuleManifest = {
  id: string;
  title: string;
  icon: IconName;
  group: "Work" | "People" | "Business" | "Operations";
  order?: number;
  primary?: boolean;
  dependsOn?: string[];
  integratesWith?: string[];
  permissions?: string[];
  routes: ModuleRoute[];
  mcpTools?: unknown[];
  chatIntents?: unknown[];
  jobs?: JobDef[];
  events?: { emits?: string[]; handles?: EventHandlerDef[] };
  fixtures?: FixtureSeed[];
};

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  if (!/^[a-z][a-z0-9-]*$/.test(manifest.id)) throw new Error(`module id "${manifest.id}" must be kebab-case`);
  if (!manifest.routes.some((r) => r.path === "")) throw new Error(`module "${manifest.id}" needs a root route ("")`);
  return manifest;
}
