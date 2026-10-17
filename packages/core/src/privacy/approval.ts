import type { ServiceContext } from "../authorize";
import type { RequestRow } from "./requests";
import { PrivacyError } from "./subjects";

export type SecondApproval = (ctx: ServiceContext, request: RequestRow) => void | Promise<void>;

const APPROVERS = ["Admin", "HR"];

export const twoPersonRule: SecondApproval = (ctx, request) => {
  if (ctx.actor.kind !== "user") throw new PrivacyError("a person must complete a privacy request, not an agent or service");
  if (ctx.actor.id === request.openedBy) throw new PrivacyError("a different person must complete this request: whoever opens a privacy request can't also approve it");
  if (!ctx.actor.roles?.some((r) => APPROVERS.includes(r))) throw new PrivacyError("only an Admin or HR person can approve a privacy request");
};

let policy: SecondApproval = twoPersonRule;

export function setSecondApproval(fn: SecondApproval) {
  policy = fn;
}

export const secondApproval: SecondApproval = (ctx, request) => policy(ctx, request);
