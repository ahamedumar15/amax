import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Source } from "./authorize";

export type Trace = { traceId: string; tenantId: string; actor: string; onBehalfOf?: string | null; source: Source };

const store = new AsyncLocalStorage<Trace>();

/** Runs `fn` under one trace: every model call, tool call, step and audited write inside carries its id. */
export const withTrace = <T>(trace: Omit<Trace, "traceId"> & { traceId?: string }, fn: () => Promise<T>) =>
  store.run({ ...trace, traceId: trace.traceId ?? randomUUID() }, fn);

export const currentTrace = () => store.getStore();
