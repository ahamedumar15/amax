import type { LimitedView } from "@amax/api";
import type { Limits } from "@amax/core/server";
import { PinButton } from "@amax/ui";

const CHANNEL = { mcp: "MCP", rest: "REST API", page: "Pages", chat: "Chat tools" } as const;
type Channel = keyof typeof CHANNEL;
const ALL = Object.keys(CHANNEL) as Channel[];

const per = (l: Limits) => (l.windowSeconds === 60 ? "a minute" : `per ${l.windowSeconds} seconds`);

/** What the limiter enforces, from the configured limits (AMAX_RATE_*), never a copy (review 058 B4). */
export function limitText(c: Channel, limits: { page: Limits; call: Limits }) {
  if (c === "page") return `${limits.page.user.toLocaleString("en")} ${per(limits.page)} per person`;
  if (c === "chat") return `${limits.call.user.toLocaleString("en")} ${per(limits.call)} per person`;
  return `${limits.call.token.toLocaleString("en")} ${per(limits.call)} per token, ${limits.call.user.toLocaleString("en")} per person`;
}

export function LimitTable({ limited, limits }: { limited: LimitedView; limits: { page: Limits; call: Limits } }) {
  return (
    <div className="scroll-x"><table className="tbl">
      <caption className="sr">Requests rate-limited this week, by channel</caption>
      <thead><tr><th>Channel</th><th>Limit</th><th>Clients limited</th><th>Requests limited</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
      <tbody>
        {ALL.map((c) => {
          const row = limited.byChannel.find((x) => x.channel === c);
          return (
            <tr key={c} className="pinnable">
              <td data-label="Channel"><b>{CHANNEL[c]}</b></td>
              <td data-label="Limit">{limitText(c, limits)}</td>
              <td data-label="Clients limited">{row?.subjects ?? 0}</td>
              <td data-label="Requests limited">{row?.count ? <span className="chip warn">{row.count}</span> : "0"}</td>
              <td className="num"><PinButton pin={{ label: `${CHANNEL[c]} rate limits`, tool: "get_api_overview", args: { channel: c } }} /></td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}
