import { suggestionAction } from "../actions";
import type { SuggestionRow } from "../server/detail";
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
        return (
          <div className="found-item" key={s.id}>
            <span className="src"><span className="logo-sq" style={{ background: bg }} aria-hidden="true">{letter}</span>{s.sourceLabel}</span>
            <p><b>{s.client}</b> {s.summary} {value(s)}</p>
            {canAccept && (
              <form action={suggestionAction} className="actions">
                <input type="hidden" name="id" value={s.id} />
                <button className="btn sm primary" name="op" value="accept" aria-label={`Add ${s.client}`}>Add</button>
                <FillButton label="Open in chat" className="btn sm" spark={false} prompt="Opportunity from the inbox agent" />
                <button className="btn sm ghost" name="op" value="dismiss" aria-label={`Dismiss ${s.client}`}>Dismiss</button>
              </form>
            )}
          </div>
        );
      })}
    </section>
  );
}
