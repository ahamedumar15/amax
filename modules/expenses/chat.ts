export const chatIntents = [
  { id: "expenses.claim", label: "Claim an expense", tool: "claim_expense", required: ["category", "spentOn", "merchant", "description", "amount"],
    fields: [{ name: "category", ask: "Which category?", options: ["travel", "meals", "equipment", "training", "medical"] },
      { name: "spentOn", ask: "On which day (YYYY-MM-DD)?" }, { name: "merchant", ask: "Where did you pay?" }, { name: "description", ask: "What was it for?" },
      { name: "amount", ask: "How much, in the category's currency?" },
      { name: "receiptId", ask: "Add the receipt photo or PDF with add_receipt and give its id, or say none if it's under the receipt threshold." }] },
];
