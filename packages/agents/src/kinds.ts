import type { z } from "zod";
import type { Tx } from "@amax/db";
import type { Emitted, Sensitivity, ServiceContext } from "@amax/core/server";

/** Where a suggestion sits, for the data-scope check (002): the same attributes `can()` reads. */
export type SuggestionScope = { projectId?: string | null; ownerUserId?: string | null; legalEntityId?: string | null; department?: string | null };

/**
 * The module's own write, made inside the decision's transaction: the suggestion's status and the
 * change commit together, as one service write that chat's confirm can retry safely. The decision
 * service audits it under the module's action, as the person, with the suggestion and agent beside it.
 */
export type KindWrite<A> = { applied: A; action: string; resource: string; resourceId?: string | null; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; events?: Emitted[] };

/**
 * One kind of agent output, declared by the module that owns the change (006). Acceptance runs
 * `apply`, the module's own write, as the accepting person; `undo` is its inverse.
 */
export type SuggestionKind<P = unknown, A = unknown> = {
  /** "<module>.<kind>", e.g. "allocations.rebalance". */
  kind: string;
  title: string;
  /** What deciding needs, checked against the suggestion's scope (a qualified grant like "@managed" works). */
  permission: string;
  proposed: z.ZodType<P>;
  /** Classified fields of the proposed change (002 classes), masked for viewers who may not see them. */
  fields?: Partial<Record<string, Sensitivity>>;
  /** Pay, bank files, access grants and revocations, credentials: the approver can't be the person the agent acted for. */
  sensitive?: boolean;
  /** External effects that can't be undone (bank files, provider-side revocations): two approvers, no undo. */
  irreversible?: boolean;
  apply: (tx: Tx, ctx: ServiceContext, proposed: P) => Promise<KindWrite<A>>;
  undo?: (tx: Tx, ctx: ServiceContext, proposed: P, applied: A) => Promise<KindWrite<unknown>>;
  /** Recurring agent jobs (029 schedule names) that make this kind, listed on the Suggestions screen to switch on and off. */
  jobs?: string[];
  /** A module-declared end of the undo window, such as a payroll run lock; the 7-day default caps it. */
  cutoff?: (proposed: P, applied: A) => Date | null;
};

const NAME = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

export function defineSuggestionKind<P, A>(k: SuggestionKind<P, A>): SuggestionKind<P, A> {
  if (!NAME.test(k.kind)) throw new Error(`suggestion kind "${k.kind}" must look like "<module>.<kind>"`);
  if (k.irreversible && k.undo) throw new Error(`suggestion kind ${k.kind} is irreversible, so it can't declare undo`);
  if (!k.irreversible && !k.undo) throw new Error(`suggestion kind ${k.kind} needs undo, or irreversible: true and a second approver`);
  return k;
}

type AnyKind = SuggestionKind<never, never>;
let kinds = new Map<string, AnyKind>();

/** The installed kinds, from every manifest's `suggestions` slot (set once at boot, and by tests). */
export function setSuggestionKinds(list: readonly unknown[]) {
  const next = new Map<string, AnyKind>();
  for (const k of list as AnyKind[]) {
    if (next.has(k.kind)) throw new Error(`suggestion kind ${k.kind} is declared twice`);
    next.set(k.kind, k);
  }
  kinds = next;
}

export const suggestionKinds = () => [...kinds.values()];
export const findKind = (name: string) => kinds.get(name) ?? null;

export class SuggestionError extends Error {
  readonly retryable = false;
  readonly code = "invalid_input";
  constructor(message: string) {
    super(message);
    this.name = "SuggestionError";
  }
}

export function kindOf(name: string): SuggestionKind<unknown, unknown> {
  const k = kinds.get(name);
  if (!k) throw new SuggestionError(`no suggestion kind ${name} is installed`);
  return k as unknown as SuggestionKind<unknown, unknown>;
}

/** Undo is allowed for 7 days after acceptance, or until the kind's own cutoff when that comes first. */
export const UNDO_DAYS = 7;
export function undoUntil(k: SuggestionKind<unknown, unknown>, proposed: unknown, applied: unknown, now = new Date()): Date | null {
  if (k.irreversible) return null;
  const week = new Date(now.getTime() + UNDO_DAYS * 86_400_000);
  const cut = k.cutoff?.(proposed, applied) ?? null;
  return cut && cut < week ? cut : week;
}
