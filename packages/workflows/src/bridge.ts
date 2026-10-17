import type { EventHandlerDef } from "@amax/core";
import type { WorkflowEngine } from "./engine";
import type { WorkflowRegistry } from "./registry";
import type { Json } from "./types";

// Every outbox event a workflow lists in `waitsFor` is forwarded to the engine as a signal, inside
// the delivery transaction, keyed by the event id, so a redelivered event never wakes a run twice.
export function signalHandlers(registry: WorkflowRegistry, engine: () => WorkflowEngine | Promise<WorkflowEngine>): EventHandlerDef[] {
  const events = new Set([...registry.workflows.values()].flatMap((w) => w.waitsFor ?? []));
  return [...events].map((event) => ({
    id: `workflows.signal:${event}`,
    event,
    handle: async ({ tx, tenantId, event: e }) => void (await (await engine()).signal(tenantId, e.name, e.payload as Json, { tx, id: e.id })),
  }));
}
