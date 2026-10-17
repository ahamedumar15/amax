import { PinButton } from "@amax/ui";
import type { SuggestionRow } from "../server/detail";
import { AskButton } from "./AskButton";
import { FillButton } from "./FillButton";
import { approxUsd, money, Stk, usd } from "./parts";

const LOGO: Record<string, [string, string]> = { email: ["#0078D4", "O"], teams: ["#5059C9", "T"] };

function value(s: SuggestionRow) {
  if (s.valueCurrency === "USD") return `Roughly ${usd(s.valueAmount)}.`;
  return `About ${money(s.valueAmount, s.valueCurrency)}${s.valueUsd === null ? "" : ` (${approxUsd(s.valueUsd)})`}.`;
}

export function FoundStrip({ items, canAccept }: { items: SuggestionRow[]; canAccept: boolean }) {
  if (!items.length) return null;
  return (
    <section className="found" aria-label="Found by agents">
      <div className="found-head"><Stk icon="spark" color="#7B61FF" /><div><b>Found by agents in Teams and email</b><small>The inbox agent reads the sales channels and account managers&apos; mail every hour. Nothing is added until someone accepts it.</small></div></div>
      {items.map((s) => {
        const [bg, letter] = LOGO[s.source] ?? ["#7B61FF", "A"];
        const pin = { label: `Inbox find: ${s.client}`, tool: "get_suggestion", args: { id: s.id } };
        return (
          <div className="found-item pinnable" key={s.id}>
            <PinButton pin={pin} />
            <span className="src"><span className="logo-sq" style={{ background: bg }} aria-hidden="true">{letter}</span>{s.sourceLabel}</span>
            <p><b>{s.client}</b> {s.summary} {value(s)}</p>
            {canAccept && (
              <div className="actions">
                <AskButton className="btn sm primary" label="Add" name={`Ask amax to add ${s.client}`} prompt={`Accept the inbox find for ${s.client}`} pin={pin} />
                <FillButton label="Open in chat" className="btn sm" spark={false} pin={pin} />
                <AskButton className="btn sm ghost" label="Dismiss" name={`Ask amax to dismiss ${s.client}`} prompt={`Dismiss the inbox find for ${s.client}`} pin={pin} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
