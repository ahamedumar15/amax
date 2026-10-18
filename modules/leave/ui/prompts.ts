import type { PendingRow } from "../server/pending";

// The Ask amax prompts on the Leave screen. Each names the exact request by its id, so chat acts on
// that record and never has to turn a name and dates back into a request.
type Row = Pick<PendingRow, "id" | "personName" | "label" | "dates" | "clashes">;
const one = (r: Row) => `${r.personName}'s ${r.label.toLowerCase()} leave, ${r.dates} (request id ${r.id})`;

export const approvePrompt = (r: Row) => `Approve ${one(r)}`;
export const decidePrompt = (r: Row) => `Decide on ${one(r)}. ${r.clashes.join("; ")}.`;
export const approveAllPrompt = (rows: Row[]) => `Approve these leave requests with no clash: ${rows.map(one).join(", ")}`;
