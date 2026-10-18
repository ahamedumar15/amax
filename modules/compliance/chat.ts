export const chatIntents = [
  { id: "compliance.report-incident", label: "Report incident", tool: "report_incident", required: ["title", "personalData"],
    fields: [{ name: "title", ask: "What happened, in a line?" }, { name: "occurredOn", ask: "When did it happen (YYYY-MM-DD)? Leave it out for today." },
      { name: "personalData", ask: "Was anyone's personal data involved, such as pay, health or contact details? Yes or no.", options: ["yes", "no"] },
      { name: "entity", ask: "Which legal entity or country (Sri Lanka, Australia)? Leave it out for yours." }] },
  { id: "compliance.new-risk", label: "New risk", tool: "add_risk", required: ["title", "likelihood", "impact"],
    fields: [{ name: "title", ask: "What is the risk?" }, { name: "likelihood", ask: "How likely, from 1 (rare) to 5 (almost certain)?", options: ["1", "2", "3", "4", "5"] },
      { name: "impact", ask: "How bad if it happens, from 1 (minor) to 5 (severe)?", options: ["1", "2", "3", "4", "5"] }, { name: "owner", ask: "Who owns it? A name or email, or me." }] },
];
