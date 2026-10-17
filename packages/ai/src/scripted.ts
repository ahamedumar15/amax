import { fakeProvider } from "./fake";

// A deterministic stand-in model for e2e tests and local demos without an API key
// (AMAX_AI_PROVIDER=scripted, refused in production). It recognises "add <title> to <KEY>", "add a task to PS-0000: <title>",
// "rotate the <connector> token" and "pause|resume the <title> schedule" and "revoke <client> for <person>" with the grant pinned (047), and
// otherwise lists projects, so the full chat path runs end to end.
export function scriptedProvider() {
  return fakeProvider((req) => {
    const last = req.messages.at(-1)!;
    if (last.role === "user" && last.content[0]?.type === "tool_result") {
      const r = last.content[0];
      if (r.isError) return { text: `I couldn't do that: ${r.content}` };
      if (r.content.includes("awaiting_confirmation")) return { text: "Here's what I'll add. Check it and confirm." };
      const body = r.content.replace(/^<data[^>]*>\n|\n<\/data>$/g, "");
      const n = (() => { try { const v = JSON.parse(body); return Array.isArray(v) ? v.length : 1; } catch { return 0; } })();
      return { text: `I found ${n} result${n === 1 ? "" : "s"}.` };
    }
    const text = last.content.map((b) => (b.type === "text" ? b.text : "")).join(" ");
    const task = text.match(/add a task to (PS-\d{4}):\s*(.+?)\s*$/i);
    if (task) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "add_opportunity_task", input: { number: task[1], title: task[2] } }] };
    const rotate = text.match(/rotate the (.+?) (?:token|secret|key)\b/i);
    if (rotate) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "rotate_secret", input: { connector: rotate[1].toLowerCase().replace(/[^a-z0-9]+/g, "-") } }] };
    const toggle = text.match(/\b(pause|resume) the (.+) schedule\b/i);
    if (toggle) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "set_schedule_enabled", input: { schedule: toggle[2], enabled: toggle[1].toLowerCase() === "resume" } }] };
    const [clientId, userId] = [/"clientId":\s*"([^"]+)"/, /"userId":\s*"([^"]+)"/].map((re) => text.match(re)?.[1]);
    if (/\brevoke .+ for .+$/i.test(text) && clientId && userId) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "revoke_mcp_client", input: { clientId, userId } }] };
    const add = text.match(/add (.+) to ([A-Z][A-Z0-9]{1,9})\s*$/);
    if (add) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "create_proposal", input: { projectKey: add[2], title: add[1] } }] };
    return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "list_projects", input: {} }] };
  });
}
