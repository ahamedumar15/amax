export const chatIntents = [
  { id: "inbox-agent.allow-source", label: "Allow a mailbox or channel", tool: "allow_inbox_source", required: ["kind", "address"],
    fields: [{ name: "kind", ask: "A mailbox or a Teams channel?", options: ["mailbox", "channel"] },
      { name: "address", ask: "Which one? An email address, or <team id>/<channel id> for a channel." }, { name: "label", ask: "What should it be called, like #sales-anz?" }] },
  { id: "inbox-agent.consent", label: "Record admin consent", tool: "record_inbox_consent", required: ["entraTenantId", "granted"],
    fields: [{ name: "entraTenantId", ask: "What is your Entra directory (tenant) id?" }, { name: "granted", ask: "Was admin consent granted?", options: ["true", "false"] }] },
];
