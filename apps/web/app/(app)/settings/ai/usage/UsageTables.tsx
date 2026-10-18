import { PinButton } from "@amax/ui";
import { compact, costLabel } from "@amax/ai/usage-format";
import type { AiUsage } from "@amax/ai/usage";

const NO_PERSON = "Jobs (no person)";
const when = (iso: string, now: Date) => {
  const days = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.parse(iso.slice(0, 10))) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};
const started = (iso: string) => `Chat started ${new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

// 055: without the pricing class the Cost columns go, and conversations rank by calls instead of cost.
export function UsageTables({ usage, now = new Date() }: { usage: AiUsage; now?: Date }) {
  const args = (groupBy: string, key: string) => ({ scope: usage.scope, month: usage.month, ...(usage.source ? { source: usage.source } : {}), groupBy, key });
  const priced = usage.pricing;
  return (
    <div className="cols even" style={{ marginTop: 28 }}>
      <div className="card flush">
        <div className="card-head"><h2>By person</h2></div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">AI usage by person</caption>
          <thead><tr><th scope="col">Person</th><th scope="col" className="num">Calls</th><th scope="col" className="num">Tokens</th>{priced && <th scope="col" className="num">Cost</th>}<th scope="col">Last used</th></tr></thead>
          <tbody>
            {usage.byPerson.map((p) => (
              <tr key={p.userId ?? "none"} className="pinnable">
                <td data-label="Person">{p.name ?? NO_PERSON}</td>
                <td data-label="Calls" className="num">{p.calls.toLocaleString("en-US")}</td>
                <td data-label="Tokens" className="num">{compact(p.inputTokens + p.outputTokens)}</td>
                {priced && <td data-label="Cost" className="num">{costLabel(p)}</td>}
                <td data-label="Last used">{when(p.lastUsed, now)}<PinButton pin={{ label: `AI usage of ${p.name ?? NO_PERSON}`, tool: "get_ai_usage", args: args("person", p.userId ?? "none") }} /></td>
              </tr>
            ))}
            {!usage.byPerson.length && <tr><td colSpan={priced ? 5 : 4} className="muted">No AI calls in this month.</td></tr>}
          </tbody>
        </table></div>
      </div>
      <div className="card flush">
        <div className="card-head"><h2>{priced ? "Most expensive conversations" : "Busiest conversations"}</h2></div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">{priced ? "The 10 most expensive chat conversations" : "The 10 chat conversations with the most calls"}</caption>
          <thead><tr><th scope="col">Conversation</th><th scope="col">Person</th><th scope="col" className="num">{priced ? "Cost" : "Calls"}</th></tr></thead>
          <tbody>
            {usage.byConversation.map((c) => (
              <tr key={c.conversationId} className="pinnable">
                <td data-label="Conversation">{started(c.startedAt)}</td>
                <td data-label="Person">{c.name ?? NO_PERSON}</td>
                <td data-label={priced ? "Cost" : "Calls"} className="num">{priced ? costLabel(c) : c.calls.toLocaleString("en-US")}<PinButton pin={{ label: `AI ${priced ? "cost" : "use"} of ${started(c.startedAt).toLowerCase()} (${c.name ?? NO_PERSON})`, tool: "get_ai_usage", args: args("conversation", c.conversationId) }} /></td>
              </tr>
            ))}
            {!usage.byConversation.length && <tr><td colSpan={3} className="muted">No chat conversations in this month.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
