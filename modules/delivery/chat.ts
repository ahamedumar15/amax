// Chat intents (plain data; 005 amax chat reads them from the manifest).
export const chatIntents = [
  { id: "delivery.new-project", say: ["new project", "start a project"], service: "delivery.project.create",
    fields: [{ name: "name", ask: "What's the project called?" }, { name: "client", ask: "Which client?" }, { name: "key", ask: "Short key for proposal ids, e.g. CON" }, { name: "billing", ask: "Fixed price, time and materials, or retainer?", options: ["fixed", "t&m", "retainer"] }] },
  { id: "delivery.new-proposal", say: ["new proposal", "propose a change"], service: "delivery.proposal.create",
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "title", ask: "What's the change?" }] },
  { id: "delivery.new-release", say: ["new release", "cut a release"], service: "delivery.release.create",
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "version", ask: "Version, e.g. v2.5.0" }] },
];
