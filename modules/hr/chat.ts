// Chat intents (005): "Add person" opens the chat in this mode; add_person runs only after the user confirms.
export const chatIntents = [
  { id: "hr.add-person", label: "Add person", tool: "add_person", required: ["name", "title", "department", "entity", "joinedOn"],
    fields: [{ name: "name", ask: "What's their full name?" }, { name: "title", ask: "What's their job title?" },
      { name: "department", ask: "Which department?", options: ["Engineering", "Quality", "Delivery", "Sales", "People and Culture", "Finance", "IT", "Leadership"] },
      { name: "entity", ask: "Which entity employs them?", options: ["Sri Lanka", "Australia"] }, { name: "joinedOn", ask: "When do they start? (YYYY-MM-DD)" },
      { name: "managerEmployeeNo", ask: "Who's their manager? Employee number, e.g. LL-0233" }] },
];
