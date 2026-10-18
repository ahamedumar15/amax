// Chat intents (005): "New programme" opens the chat in this mode; create_programme runs only after the user confirms.
export const chatIntents = [
  { id: "learning.new-programme", label: "New programme", tool: "create_programme", required: ["title", "kind", "delivery", "startsOn"],
    fields: [
      { name: "title", ask: "What's the programme called?" },
      { name: "kind", ask: "What kind of programme is it?", options: ["certification", "workshop", "compliance", "leadership", "course"] },
      { name: "delivery", ask: "Is it run internally or by an external provider?", options: ["internal", "external"] },
      { name: "mandatory", ask: "Is it mandatory for everyone?", options: ["yes", "no"] },
      { name: "startsOn", ask: "When does it start? (YYYY-MM-DD)" }, { name: "endsOn", ask: "When does it end? (YYYY-MM-DD, or leave open)" },
      { name: "detail", ask: "Anything to show under the title, e.g. \"Internal, 6 sessions\"?" },
    ] },
];
