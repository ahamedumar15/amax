import { PinButton } from "@amax/ui";
import { findPin } from "../pins";
import { addPrompt } from "../routes";
import { safeLink } from "../server/excerpt";
import type { FindRow } from "../server/rows";
import { AskButton } from "./AskButton";
import { shortDate } from "./parts";

const LOGO: Record<string, [string, string]> = { mailbox: ["#0078D4", "O"], channel: ["#5059C9", "T"] };
const from = (f: FindRow) => `${f.sourceKind === "mailbox" ? "Email to" : "Teams,"} ${f.sourceLabel}, ${shortDate(f.receivedAt)}`;
export const titleOf = (f: FindRow) => {
  const who = typeof f.fields.client === "string" ? f.fields.client : typeof f.fields.type === "string" ? `${f.fields.type}` : "";
  return `${f.route?.label ?? "Message"}${who ? `: ${who}` : ""}`;
};

// 025 AC-2: each find shows where it came from and links to the message; Add opens the owning
// module's chat intent with the find pinned. The excerpt is outside text, rendered as text only.
function Find({ f }: { f: FindRow }) {
  const [bg, letter] = LOGO[f.sourceKind];
  const pin = findPin(f);
  const link = safeLink(f.link);
  const title = titleOf(f);
  return (
    <div className="found-item pinnable">
      <PinButton pin={pin} />
      <span className="src"><span className="logo-sq" style={{ background: bg }} aria-hidden="true">{letter}</span>{from(f)}</span>
      <p><b>{title}</b> <span className="excerpt">“{f.excerpt}”</span></p>
      <small className="muted">Belongs in {f.route!.title}.{link && <> <a href={link} target="_blank" rel="noopener noreferrer nofollow">Open the message<span className="sr"> ({title}, opens in a new tab)</span></a></>}</small>
      <div className="actions">
        <AskButton className="btn sm primary" label="Add" name={`Add ${title} with amax`} intent={f.route!.intent} prompt={addPrompt(f.route!, f.id)} pin={pin} />
        <AskButton label="Open in chat" name={`Open ${title} in chat`} prompt={`What did the inbox agent find in this message (find ${f.id})?`} pin={pin} />
        {f.suggestionId && <AskButton className="btn sm ghost" label="Dismiss" name={`Dismiss ${title}`} prompt={`Dismiss the inbox agent's suggestion ${f.suggestionId}`} pin={pin} />}
      </div>
    </div>
  );
}

export function FoundList({ finds }: { finds: FindRow[] }) {
  if (!finds.length) return null;
  return (
    <section className="found" aria-label="Found by agents in Teams and email">
      <div className="found-head"><span className="stk" aria-hidden="true">✦</span><div><b>Found by agents in Teams and email</b><small>The inbox agent reads the allowed channels and mailboxes every hour. Nothing is added until someone accepts it in chat.</small></div></div>
      {finds.map((f) => <Find key={f.id} f={f} />)}
    </section>
  );
}
