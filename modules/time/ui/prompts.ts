import type { TeamRow } from "../server/team";

// The Ask amax prompts for Team time (057). Each names the exact person-week by its id, so chat
// acts on that record and never has to turn a display name back into a week.
type Who = Pick<TeamRow, "weekId" | "personName">;
const one = (r: Who) => `${r.personName} (week id ${r.weekId})`;

export const decidePrompt = (verb: "Approve" | "Remind", r: Who, week: string) => `${verb} ${r.personName}'s timesheet for ${week} (week id ${r.weekId})`;
export const approveAllPrompt = (rows: Who[], week: string) => `Approve the submitted timesheets for ${week}: ${rows.map(one).join(", ")}`;
export const remindAllPrompt = (rows: Who[], week: string) => `Remind these people to submit their timesheets for ${week}: ${rows.map(one).join(", ")}`;
