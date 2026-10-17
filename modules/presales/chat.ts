// Chat intents (005): "Fill with amax" on the board opens the chat in this mode. The chat fills in
// the named MCP write tool, and it runs only after the user confirms.
export const chatIntents = [
  { id: "presales.new-opportunity", label: "New opportunity", tool: "create_opportunity", required: ["client", "title", "value"],
    fields: [
      { name: "client", ask: "Which client?" }, { name: "title", ask: "What's the opportunity?" },
      { name: "value", ask: "Roughly how much is it worth?" }, { name: "currency", ask: "In which currency? USD unless you say otherwise" },
      { name: "stage", ask: "Which stage is it at?", options: ["new-idea", "lead", "qualified", "proposal", "negotiation"] },
      { name: "ownerName", ask: "Who's the account manager?" }, { name: "expectedClose", ask: "When do you expect it to close?" },
    ] },
];
