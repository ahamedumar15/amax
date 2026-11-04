import type { SuggestionView } from "@amax/agents/server";
import { PinButton, Since } from "@amax/ui";
import { proposalHref } from "../contracts";
import { pushPin } from "../pins";
import type { PushRow } from "../server/repo-sync";

// 081 amendment 4 (AC-43): what on this project waits for the viewer, first, before the band and the board (rule 6).
// Each item folds to one row, as Time's change requests do: a native <details> (click, Enter or Space), its pin beside
// the row, never inside the <summary>, so no control nests in another. Deciding happens on the proposal page, in chat.
type Item = { id: string; at: string; chip: [string, string]; title: string; pin: React.ComponentProps<typeof PinButton>["pin"]; body: React.ReactNode };

export function NeedsYou({ projectKey, suggestions, refused }: { projectKey: string; suggestions: (SuggestionView & { proposal: { key: string; title: string } })[]; refused: PushRow[] }) {
  const items: Item[] = [
    ...suggestions.map((s) => ({
      id: s.id, at: s.createdAt, chip: ["agent", s.kindTitle] as [string, string], title: `${s.proposal.key} ${s.proposal.title}`,
      pin: { label: s.title, tool: "get_agent_suggestion", args: { id: s.id } },
      body: <p>{s.detail ?? s.title} {s.agent.name}. <a href={proposalHref(s.proposal.key)}>Open {s.proposal.key} to decide</a></p>,
    })),
    ...refused.map((p) => ({
      id: p.id, at: p.at, chip: ["warn", "Push refused"] as [string, string], title: p.reason ?? "refused",
      pin: pushPin({ ...p, projectKey }),
      body: <p>From {p.by}, commit <code>{p.ref}@{p.sha.slice(0, 7)}</code>. Ask amax to relink the repo, or fix the change and push again.</p>,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (!items.length) return null;
  return (
    <section className="card dv-needs" aria-labelledby="dv-needs-h">
      <div className="card-head"><h2 id="dv-needs-h">Needs you</h2><span className="chip">{items.length}</span></div>
      <ul>
        {items.map((it) => (
          <li key={it.id} className="dv-foldwrap pinnable">
            <details className="dv-fold">
              <summary>
                <span className={`chip ${it.chip[0]}`}>{it.chip[1]}</span>
                <span className="dv-title">{it.title}</span>
                <small className="muted"><Since at={it.at} /></small>
                <span className="dv-chev" aria-hidden="true" />
              </summary>
              <div className="dv-body">{it.body}</div>
            </details>
            <PinButton inline pin={it.pin} />
          </li>
        ))}
      </ul>
    </section>
  );
}
