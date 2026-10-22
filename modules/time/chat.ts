export const chatIntents = [
  { id: "time.log", label: "Log time", tool: "log_time", required: ["projectKey", "hours", "day"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "hours", ask: "How many hours?" }, { name: "day", ask: "Which weekday (YYYY-MM-DD)?" },
      { name: "billable", ask: "Is it billable to the client?", options: ["yes", "no"] }] },
  { id: "time.correct", label: "Fix hours", tool: "correct_time_entry", required: ["entryId"],
    fields: [{ name: "entryId", ask: "Which entry? Pick it from your timesheet." }, { name: "hours", ask: "How many hours should it be?" }] },
  { id: "time.delete", label: "Remove hours", tool: "delete_time_entry", required: ["entryId"],
    fields: [{ name: "entryId", ask: "Which entry should go? Pick it from your timesheet." }] },
];
