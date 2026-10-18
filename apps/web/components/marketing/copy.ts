export const HERO_LEDE = "amax is the agent-native ERP for software and services firms. Commits, deployments and chat become your delivery, people and finance records, and nothing counts until a person accepts it.";

export const DESCRIPTION = "amax is the agent-native ERP for software and professional-services firms. Agents close tasks, draft time for people to accept, move releases and keep people, leave and allocations current through MCP. People review and decide.";

export const STEPS = [
  { title: "First, the work happens.", body: "A commit names AMX-142. A pipeline deploys Fleet Tracker to UAT. Nobody types an update." },
  { title: "Then amax drafts the record.", body: "Git ingestion closes the task and drafts 2.5 h for Liam. Every draft names the agent and the person it acted for." },
  { title: "You decide in one tap.", body: "In chat or on the screen, a person accepts, approves or promotes. Each decision is permission-checked and written to a hash-chained audit trail." },
];

export const TILES = [
  ["Every record says who did it", "A person, or an agent acting for that person."],
  ["Hash-chained audit", "Each entry chains to the last; export the evidence."],
  ["Role-scoped MCP", "The same permissions in chat, UI and API."],
  ["Your region", "Pin data to a region; set retention and legal holds."],
  ["Entra ID and SCIM", "Sign-in and roles from your directory."],
  ["Runs where you do", "Vercel, Cloudflare or your own k3s, unchanged."],
];

export const FAQ = [
  ["Will an agent change our data on its own?", "No. Agents draft: hours from commits, invoices from approved time, payroll changes. A person accepts or approves each one, and in chat amax asks before it changes anything."],
  ["Which agents can connect?", "Any MCP client, such as Claude Code, a CI pipeline or your own agent, using a credential scoped to a person's role."],
  ["Where does our data live?", "In the region you pin for each legal entity, with retention rules and legal holds per record type."],
  ["Do we have to stop using our other tools?", "No. amax reads commits, pipelines and your directory, and planned integrations cover accounting."],
  ["Is it accessible?", "Every screen meets WCAG 2.2 AA, works from the keyboard, and respects light, dark and reduced-motion settings."],
  ["How do we start?", "Book a demo. We'll walk through amax on fictional data like the records on this page."],
];
