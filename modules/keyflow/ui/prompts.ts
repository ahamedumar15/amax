import type { ErrorRow } from "../server/views";

// The Ask amax prompts on the Keyflow screens. Each names the exact record by its id, so chat acts
// on that record and never has to turn a name back into one.
type Err = Pick<ErrorRow, "id" | "personName" | "externalRef">;
export const subjectOf = (e: Pick<ErrorRow, "personName" | "externalRef">) => e.personName ?? `Keyflow person ${e.externalRef ?? "unknown"}`;
export const dismissPrompt = (e: Err) => `Dismiss the Keyflow sync error for ${subjectOf(e)} (error id ${e.id})`;
export const CONNECT_PROMPT = "Connect Keyflow at its https address";
