// Recording an insight by hand: chat asks for what it rests on, so it is never recorded without a source (AC-1).
export const chatIntents = [
  { id: "insights.record", label: "Record an insight", tool: "record_insight", required: ["kind", "title", "confidence", "asOf", "sources"],
    fields: [{ name: "kind", ask: "What kind of insight?", options: ["risk", "opportunity", "trend", "market"] }, { name: "title", ask: "In a few words, what is it?" },
      { name: "body", ask: "What makes you think so?" }, { name: "confidence", ask: "How confident are you?", options: ["high", "medium", "low"] },
      { name: "asOf", ask: "As of which day (YYYY-MM-DD)?" }, { name: "sources", ask: "What does it rest on, and where is the evidence (an amax page or an https link)?" }] },
];
