// Chat intents (005): "Send pulse survey" opens chat in this mode; send_pulse runs only after the person confirms.
export const chatIntents = [
  { id: "experience.send-pulse", label: "Send pulse survey", tool: "send_pulse", required: [],
    fields: [{ name: "question", ask: "What should the one question be? (default: How well do your laptop and apps work for you?)" }] },
];
