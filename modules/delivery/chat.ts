// Chat intents (005): a create button marked with an intent opens the chat in that mode. `tool`
// names the MCP write tool the chat fills in; it runs only after the user confirms.
export const chatIntents = [
  { id: "delivery.new-project", label: "New project", tool: "create_project", required: ["key", "name", "client", "billing"],
    fields: [{ name: "name", ask: "What's the project called?" }, { name: "client", ask: "Which client?" }, { name: "key", ask: "Short key for proposal ids, e.g. CON" }, { name: "billing", ask: "Fixed price, time and materials, or retainer?", options: ["fixed", "t&m", "retainer"] }] },
  { id: "delivery.new-proposal", label: "New proposal", tool: "create_proposal", required: ["projectKey", "title"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "title", ask: "What's the change?" }, { name: "estimateHours", ask: "Roughly how many hours?" }] },
  { id: "delivery.new-release", label: "New release", tool: "create_release", required: ["projectKey", "version"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "version", ask: "Version, e.g. v2.5.0" }] },
  { id: "delivery.link-repo", label: "Link a repo", tool: "link_project_repo", required: ["projectKey", "repoUrl"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "repoUrl", ask: "Which repo should its proposals sync from? e.g. https://github.com/example/portal" }, { name: "defaultBranch", ask: "Its default branch? (main if you're not sure)" }] },
  { id: "delivery.deploy", label: "Record a deployment", tool: "record_deployment", required: ["projectKey", "version", "environment"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "version", ask: "Which release version?" }, { name: "environment", ask: "Which environment, e.g. Dev, QA, UAT or Prod?" }] },
  { id: "delivery.tag-release", label: "Change a release", tool: "set_release_proposals", required: ["projectKey", "version", "proposalKeys"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "version", ask: "Which release?" }, { name: "proposalKeys", ask: "Which proposals should it contain?" }] },
];
