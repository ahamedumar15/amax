import type { Person, SuggestionView } from "@amax/agents/server";

// 006: the Suggestions screen's wording, so each Ask prompt names the exact suggestion by its id.
export const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
export const named = (p: Person) => p?.name ?? "";
export const forWhom = (s: SuggestionView) => (s.actsFor ? `for ${named(s.actsFor)}` : "on a schedule");
const ref = (s: SuggestionView) => `"${s.title}" (suggestion id ${s.id})`;
export const prompts = {
  accept: (s: SuggestionView) => `${s.status === "approved" ? "Approve, as the second approver," : "Accept"} the suggestion ${ref(s)}`,
  query: (s: SuggestionView) => `Query the suggestion ${ref(s)}: `,
  dismiss: (s: SuggestionView) => `Dismiss the suggestion ${ref(s)}`,
  undo: (s: SuggestionView) => `Undo the accepted suggestion ${ref(s)}`,
};
export const pinOf = (s: SuggestionView) => ({ label: s.title, tool: "get_agent_suggestion", args: { id: s.id } });
export const runPinOf = (s: SuggestionView) => ({ label: `Agent run for ${s.title}`, tool: "get_agent_suggestion_run", args: { id: s.id } });

/** What a row says about the kind: sensitive and irreversible ones say who still has to approve. */
export function flags(s: SuggestionView) {
  return [s.kindTitle, s.sensitive ? "sensitive" : null, s.irreversible ? "irreversible" : null,
    s.status === "approved" ? `approved once by ${named(s.firstApprovedBy)}` : null, s.status === "queried" ? `queried: ${s.queryNote ?? ""}` : null].filter(Boolean).join(" · ");
}
