export const chatIntents = [
  { id: "time.log", label: "Log time", tool: "log_time", required: ["projectKey", "hours", "day"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "hours", ask: "How many hours?" }, { name: "day", ask: "Which weekday (YYYY-MM-DD)?" },
      { name: "billable", ask: "Is it billable to the client?", options: ["yes", "no"] }] },
];
