// Chat intents (005): "New ticket" opens chat in this mode, and an inbox find (025) is added through
// it with the find pinned. The chat fills in create_ticket, which runs only after the person confirms.
export const chatIntents = [
  { id: "helpdesk.new-ticket", label: "New ticket", tool: "create_ticket", required: ["title"],
    fields: [
      { name: "title", ask: "What do you need help with?" }, { name: "description", ask: "Anything else IT or HR should know?" },
      { name: "queue", ask: "Which team should take it?", options: ["it", "hr", "facilities"] },
      { name: "priority", ask: "How urgent is it?", options: ["low", "normal", "high", "urgent"] },
    ] },
];
