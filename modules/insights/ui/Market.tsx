import { facet, PinButton } from "@amax/ui";
import { insightPin, viewPin } from "../pins";
import type { Insights } from "../server/views";
import { num, Src, Stat } from "./parts";

const usd = (amount: string) => `$${Math.round(Number(amount)).toLocaleString("en-US")}`;

export function Market({ m, horizon }: { m: Insights["market"]; horizon: string }) {
  const p = m.position, w = m.win, live = m.pipeline;
  const peers = Array.isArray(p?.data.peers) ? (p!.data.peers as [string, number][]) : [];
  return (
    <section className="card pinnable" aria-labelledby="market-title">
      <div className="card-head"><h2 id="market-title">Market position</h2><PinButton pin={viewPin("Market position", horizon)} /></div>
      <div className="split three">
        <Stat k="Win rate" value={w ? `${num(w.data.winRate)}%` : "–"} note={w ? <span className="up">↑ {num(w.data.delta)} pts</span> : <span className="muted small">No closed deals yet</span>} pin={w ? <PinButton pin={insightPin(w)} /> : <PinButton pin={viewPin("Win rate", horizon)} />} />
        <Stat k="Share of voice" value={p ? `${num(p.data.shareOfVoice)}%` : "–"} note={<span className="muted small">{p ? `rank ${num(p.data.rank)} of ${num(p.data.firms)}` : "Not measured yet"}</span>} pin={<PinButton pin={p ? insightPin(p) : viewPin("Share of voice", horizon)} />} />
        <Stat k="Review rating" value={p ? String(num(p.data.rating)) : "–"} note={<span className="muted small">{p ? `${num(p.data.reviews)} reviews` : "Not measured yet"}</span>} pin={<PinButton pin={p ? insightPin(p) : viewPin("Review rating", horizon)} />} />
      </div>
      {w && <Src sources={w.sources} confidence={w.confidence} asOf={w.asOf} />}
      {p && <>
        <div className="k muted peers">How buyers see you against peers</div>
        <Src sources={p.sources} confidence={p.confidence} asOf={p.asOf} tail={p.body} />
        {peers.map(([label, score]) => (
          <div className="vs pinnable" key={label}><span>{label}</span><div className="meter" aria-hidden="true"><i style={{ width: `${score * 10}%`, background: score >= 5 ? "var(--violet)" : "var(--amber)" }} /></div><b>{score}</b><PinButton pin={facet(insightPin(p), `, ${label.toLowerCase()}`)} /></div>
        ))}
      </>}
      {live && (
        <p className="live pinnable">Open pipeline {usd(live.value.open)} across {live.value.count} deals ({usd(live.value.weighted)} weighted); {live.value.won} of {live.value.won + live.value.lost} closed deals won.
          <Src sources={live.sources} /><PinButton pin={viewPin("Open pipeline", horizon)} /></p>
      )}
    </section>
  );
}
