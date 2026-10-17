import type { LimitedView } from "@amax/api";
import { PinButton } from "@amax/ui";

const CHANNEL = { mcp: "MCP", rest: "REST API", page: "Pages", chat: "Chat tools" } as const;
const LIMITS = { mcp: "120 a minute per token, 240 per person", rest: "120 a minute per token, 240 per person", page: "600 a minute per person", chat: "240 a minute per person" } as const;
type Channel = keyof typeof CHANNEL;
const ALL = Object.keys(CHANNEL) as Channel[];

export function LimitTable({ limited }: { limited: LimitedView }) {
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
              <td data-label="Limit">{LIMITS[c]}</td>
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
