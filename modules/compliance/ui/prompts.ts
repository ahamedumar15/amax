import type { Incident } from "../server/registers";
import { shortDate } from "./parts";

// The Ask amax prompts on the Compliance screen. Each names its record by id, so chat acts on exactly that one.
export const decidePrompt = (i: Pick<Incident, "id" | "ref" | "title" | "regulator" | "notifyBy">) =>
  `Decide on ${i.ref}, "${i.title}" (incident id ${i.id}): notify ${i.regulator ?? "the regulator"} and the people affected, or record it as not notifiable. It is due ${i.notifyBy ? shortDate(i.notifyBy) : "now"}.`;
export const EXPORT_PROMPT = "Export the signed ISO 27001 evidence bundle for every control";
export const CHECK_PROMPT = "Verify the audit chain now";
