export const chatIntents = [
  { id: "leave.request", label: "Request leave", tool: "request_leave", required: ["type", "startsOn"],
    fields: [{ name: "type", ask: "What kind of leave?", options: ["annual", "casual", "medical", "lieu", "personal", "unpaid"] },
      { name: "startsOn", ask: "From which day (YYYY-MM-DD)?" }, { name: "endsOn", ask: "Until which day? Leave it out for one day." },
      { name: "halfDay", ask: "A half day? Say am or pm, or no.", options: ["am", "pm"] }] },
];
