type Call = [name: string, input: Record<string, unknown>];
type Rule = [RegExp, (m: RegExpMatchArray) => Call[]];

const KEY = "([A-Z][A-Z0-9]{1,9})";
const WEEK = "(\\d{4}-W\\d{2})";
const UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
// "Nimal Silva (week id <uuid>), Kasun Dias (week id <uuid>)": every id, or none when any item lacks one.
const weekIds = (list: string) => {
  const item = new RegExp(`\\s*[^,(]+? \\(week id ${UUID}\\)\\s*(?:,|$)`, "iy");
  const ids: string[] = [];
  for (let m = item.exec(list); m; m = item.lastIndex < list.length ? item.exec(list) : null) ids.push(m[1]);
  return ids.length && item.lastIndex === list.length ? ids : [];
};
const names = (list: string) => list.split(/\s*,\s*|\s+and\s+/).filter(Boolean);
const env = (projectKey: string, name: string, more: Record<string, unknown> = {}): Call[] => [["upsert_environment", { projectKey, name, ...more }]];
const DETAIL: Record<string, string> = { title: "title", "next step": "nextStep", competing: "competing", "lead source": "leadSource", service: "service", "cost centre": "costCentre" };

const RULES: Rule[] = [
  [new RegExp(`^submit my timesheet for ${WEEK}`, "i"), (m) => [["submit_week", { week: m[1] }]]],
  [new RegExp(`^(approve|remind) .+?'s timesheet for ${WEEK} \\(week id ${UUID}\\)\\s*$`, "i"), (m) => [[`${m[1].toLowerCase()}_week`, { weekId: m[3] }]]],
  [new RegExp(`^approve the submitted timesheets for ${WEEK}: (.+)$`, "i"), (m) => weekIds(m[2]).map((weekId) => ["approve_week", { weekId }])],
  [new RegExp(`^remind these people to submit their timesheets for ${WEEK}: (.+)$`, "i"), (m) => weekIds(m[2]).map((weekId) => ["remind_week", { weekId }])],
  [new RegExp(`^log time on ${WEEK}: ([\\d.]+) h(?:ours)? on ${KEY} on (\\d{4}-\\d{2}-\\d{2})`, "i"), (m) => [["log_time", { hours: Number(m[2]), projectKey: m[3], day: m[4] }]]],
  [/^copy (.+?) allocations from .*?\((\d{4}-\d{2})\) to the next month/i, (m) => [["copy_allocations_to_next_month", { team: m[1], from: m[2] }]]],
  [new RegExp(`^record a deployment of ${KEY} (\\S+) to (\\S+)\\s*$`, "i"), (m) => [["record_deployment", { projectKey: m[1], version: m[2], environment: m[3] }]]],
  [new RegExp(`^move (${KEY.slice(1, -1)}-\\d+) to (proposed|planned|building|verified)\\s*$`, "i"), (m) => [["move_proposal", { key: m[1], to: m[2].toLowerCase() }]]],
  [new RegExp(`^tag ${KEY} (\\S+) as (\\S+)\\s*$`, "i"), (m) => [["tag_release", { projectKey: m[1], version: m[2], newVersion: m[3] }]]],
  [new RegExp(`^set the proposals in ${KEY} (\\S+) to: (.*)$`, "i"), (m) => [["set_release_proposals", { projectKey: m[1], version: m[2], proposalKeys: names(m[3]) }]]],
  [new RegExp(`^void the (.+?) deployment of ${KEY} (\\S+) \\(id ([0-9a-f-]{36})\\)\\. reason: (.+)$`, "i"),
    (m) => [["void_deployment", { environment: m[1], projectKey: m[2], version: m[3], deploymentId: m[4], reason: m[5].trim() }]]],
  [new RegExp(`^add an environment to ${KEY}: (.+)$`, "i"), (m) => env(m[1], m[2].trim())],
  [new RegExp(`^rename the (.+?) environment of ${KEY} to (.+)$`, "i"), (m) => env(m[2], m[1], { rename: m[3].trim() })],
  [new RegExp(`^move the (.+?) environment of ${KEY} to position (\\d+)`, "i"), (m) => env(m[2], m[1], { position: Number(m[3]) })],
  [new RegExp(`^make (.+?) the prod environment of ${KEY}`, "i"), (m) => env(m[2], m[1], { isProd: true })],
  [new RegExp(`^unmark (.+?) as the prod environment of ${KEY}`, "i"), (m) => env(m[2], m[1], { isProd: false })],
  [new RegExp(`^remove the (.+?) environment of ${KEY}`, "i"), (m) => [["remove_environment", { projectKey: m[2], name: m[1] }]]],
  [/^change details on (PS-\d{4}): ([a-z ]+?): (.+)$/i, (m) => (DETAIL[m[2].toLowerCase()] ? [["update_opportunity", { number: m[1], [DETAIL[m[2].toLowerCase()]]: m[3].trim() }]] : [])],
];

export function scriptedWrite(ask: string) {
  for (const [re, calls] of RULES) {
    const m = ask.trim().match(re);
    if (m) return calls(m).map(([name, input], i) => ({ type: "tool_use" as const, id: `t${Date.now()}${i}`, name, input }));
  }
  return null;
}
