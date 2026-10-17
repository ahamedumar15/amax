// Chat intents (005): "Allocate" opens the chat in this mode; the allocate tool runs only after the user confirms.
export const chatIntents = [
  { id: "allocations.allocate", label: "Allocate", tool: "allocate", required: ["person", "projectKey", "month", "percent"],
    fields: [{ name: "person", ask: "Who? Name or employee number" }, { name: "projectKey", ask: "Which project? Key, e.g. CON" },
      { name: "month", ask: "From which month? (YYYY-MM)" }, { name: "through", ask: "Until which month? (YYYY-MM, optional)" }, { name: "percent", ask: "What percent of their time?" }] },
];
