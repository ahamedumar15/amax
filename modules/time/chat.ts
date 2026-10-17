export const chatIntents = [
  { id: "time.log", label: "Log time", tool: "log_time", required: ["projectKey", "hours"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "hours", ask: "How many hours?" }, { name: "day", ask: "Which day? Today if you don't say." },
      { name: "billable", ask: "Is it billable to the client?", options: ["yes", "no"] }] },
];
