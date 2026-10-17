"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { announce, Mascot, PinButton, type PinRef } from "@amax/ui";
import type { Highlight, PendingAction } from "@amax/chat";
import { cancelChat, confirmChat, sendChat, type CardOutcome } from "../../app/actions/chat";

type Entry =
  | { kind: "me"; text: string; highlights: Highlight[] }
  | { kind: "amax"; text: string; tools: string[]; error?: boolean }
  | { kind: "confirm"; action: PendingAction; state: CardOutcome["state"] | "working"; note?: string };

const FIELD_CLASSES = ["f-client", "f-value", "f-dates", "f-person", "f-stage", "f-name"];
const fieldClass = (fields: string[], field: string) => FIELD_CLASSES[Math.max(0, fields.indexOf(field)) % FIELD_CLASSES.length];

function Marked({ text, highlights, fields }: { text: string; highlights: Highlight[]; fields: string[] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const h of highlights) {
    if (h.index < at) continue;
    parts.push(text.slice(at, h.index));
    parts.push(<mark key={h.index} className={`x ${fieldClass(fields, h.field)}`} title={h.field}>{h.text}</mark>);
    at = h.index + h.text.length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

// The model writes light markdown; render **bold**, `code`, line breaks and "- " lists as React
// elements (never HTML), so model text can't inject markup.
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <b key={`${key}-${i}`}>{part.slice(2, -2)}</b>
      : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={`${key}-${i}`}>{part.slice(1, -1)}</code> : part);
}
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={`ul${blocks.length}`} style={{ margin: "6px 0", paddingLeft: 18 }}>{list}</ul>); list = []; } };
  text.split("\n").forEach((line, i) => {
    const item = line.match(/^\s*[-*•]\s+(.*)$/);
    if (item) { list.push(<li key={i}>{inline(item[1], `l${i}`)}</li>); return; }
    flush();
    if (line.trim()) blocks.push(<p key={i} style={{ margin: "0 0 6px" }}>{inline(line, `p${i}`)}</p>);
  });
  flush();
  return <>{blocks}</>;
}

type SpeechCtor = new () => { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; start: () => void; stop: () => void };

export function Chat({ open, onClose, returnFocus, signedIn, voice, usage = null }: { open: boolean; onClose: () => void; returnFocus: RefObject<HTMLButtonElement | null>; signedIn: boolean; voice: boolean; usage?: string | null }) {
  const [log, setLog] = useState<Entry[]>([]);
  const [pins, setPins] = useState<PinRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<string | undefined>();
  const [picking, setPicking] = useState(false);
  const [talking, setTalking] = useState(false);
  const [turnUsage, setTurnUsage] = useState<string | null>(null);
  const convo = useRef<string | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fields = useRef<string[]>([]);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [log, busy]);

  // Pins and intents arrive from anywhere on the page.
  useEffect(() => {
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<{ pin?: PinRef; intent?: string; prompt?: string }>).detail;
      if (d.pin) { setPins((p) => (p.some((x) => x.label === d.pin!.label) ? p : [...p, d.pin!])); announce(`${d.pin.label} added to chat`); }
      if (d.intent) { setIntent(d.intent); setText(""); setLog((l) => [...l, { kind: "amax", text: `${d.prompt ?? "New record"}: tell me the details and I'll fill it in.`, tools: [] }]); }
    };
    window.addEventListener("amax:chat", onEvent);
    return () => window.removeEventListener("amax:chat", onEvent);
  }, []);

  // Pick mode: click anything with an "Add to chat" button to pin it.
  useEffect(() => {
    document.body.classList.toggle("picking", picking);
    if (!picking) return;
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(".pinnable");
      const btn = target?.querySelector<HTMLButtonElement>(".pin[data-pin]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      btn.click();
      setPicking(false);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [picking]);

  const close = useCallback(() => { setPicking(false); onClose(); returnFocus.current?.focus(); }, [onClose, returnFocus]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setText("");
    setBusy(true);
    setLog((l) => [...l, { kind: "me", text: message, highlights: [] }]);
    const r = await sendChat({ conversationId: convo.current, text: message, pins, intentId: intent });
    setBusy(false);
    if (!r.ok) { setLog((l) => [...l, { kind: "amax", text: r.error, tools: [], error: true }]); return; }
    convo.current = r.conversationId;
    if (r.usage) setTurnUsage(r.usage);
    setIntent(undefined);
    fields.current = r.pending.flatMap((p) => p.fields);
    setLog((l) => {
      const copy = [...l];
      const last = copy.findLastIndex((x) => x.kind === "me");
      if (last >= 0) copy[last] = { kind: "me", text: message, highlights: r.highlights };
      return [...copy, ...(r.reply ? [{ kind: "amax" as const, text: r.reply, tools: r.toolsRun }] : []), ...r.pending.map((action) => ({ kind: "confirm" as const, action, state: "open" as const }))];
    });
    announce(r.pending.length ? "amax prepared a change for you to confirm" : "amax replied");
  }

  async function decide(action: PendingAction, ok: boolean) {
    if (!convo.current) return;
    // One decision per card: the buttons go away while the request is in flight.
    setLog((l) => l.map((x) => (x.kind === "confirm" && x.action.id === action.id ? { ...x, state: "working", note: undefined } : x)));
    const apply = (o: CardOutcome) => setLog((l) => l.map((x) => (x.kind === "confirm" && x.action.id === action.id ? { ...x, ...o } : x)));
    try {
      // The server says what the card is now: done, cancelled, back open to retry, or an error.
      const o = ok ? await confirmChat(convo.current, action.id) : await cancelChat(convo.current, action.id);
      apply(o);
      announce(o.note);
    } catch {
      // The request itself failed (network, server): bring the buttons back so the user can retry.
      apply({ state: "open", note: "That didn't go through. Try again." });
      announce("That didn't go through. Try again.");
    }
  }

  function talk() {
    const Ctor = (window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition;
    if (!voice || !Ctor) { input.current?.focus(); return; }
    const rec = new Ctor();
    rec.lang = navigator.language.startsWith("si") || navigator.language.endsWith("LK") ? "en-LK" : "en-AU";
    rec.interimResults = false;
    rec.onresult = (e) => send(e.results[0][0].transcript);
    rec.onend = () => setTalking(false);
    setTalking(true);
    rec.start();
  }

  return (
    <aside className={open ? "chat open" : "chat"} id="chat" aria-label="amax chat" inert={!open}>
      <header className="c-head">
        <span className="c-face"><Mascot /></span>
        <div><b>amax</b><small>{intent ? "Filling in a new record" : "Ask, add or drop anything here"}</small></div>
        <button className="iconbtn" type="button" aria-label="Close chat" onClick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </header>
      <div className="c-log" role="log" aria-live="polite" aria-label="Conversation" ref={logRef}>
        {!signedIn && <div className="m"><div className="b">Sign in to use amax chat.</div></div>}
        {log.map((e, i) => {
          if (e.kind === "me") return <div key={i} className="m me"><div className="b"><Marked text={e.text} highlights={e.highlights} fields={fields.current} /></div></div>;
          if (e.kind === "amax") return (
            <div key={i} className="m"><div className="b">
              {e.tools.length > 0 && <div className="tools" aria-label="Tools used">{e.tools.map((t, j) => <span key={j}>{t}</span>)}</div>}
              {e.error ? <p className="err">{e.text}</p> : <Markdown text={e.text} />}
            </div></div>
          );
          return (
            <div key={i} className="m"><div className="b" role="group" aria-label={`Confirm: ${e.action.title}`}>
              <p><b>{e.action.title}</b></p>
              <dl className="rec">{Object.entries(e.action.input).map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt className={fieldClass(e.action.fields, k)}><span className="fd" />{k}</dt><dd>{String(v)}</dd></div>)}</dl>
              {e.state === "open" ? (<>
                {e.note && <p className="err">{e.note}</p>}
                <div className="acts">
                  <button className="btn sm primary" type="button" onClick={() => decide(e.action, true)}>Add it</button>
                  <button className="btn sm" type="button" onClick={() => { setText("Change "); input.current?.focus(); }}>Change something</button>
                  <button className="btn sm" type="button" onClick={() => decide(e.action, false)}>Cancel</button>
                </div>
              </>) : <p className={e.state === "error" ? "err" : "muted"} style={{ marginTop: 10 }}>{e.state === "working" ? "Working on it…" : e.note}</p>}
            </div></div>
          );
        })}
        {busy && <div className="m"><div className="b"><div className="dots" aria-label="amax is thinking"><i /><i /><i /></div></div></div>}
      </div>
      <div className="c-ctx" aria-label="Pinned context">
        {pins.map((p) => (
          <span key={p.label} className="pinchip"><span>{p.label}</span><button type="button" aria-label={`Remove ${p.label} from chat`} onClick={() => setPins((x) => x.filter((y) => y.label !== p.label))}>×</button></span>
        ))}
      </div>
      <form className="c-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" aria-label="Message amax" placeholder={signedIn ? "Type, or tap amax and talk" : "Sign in first"} disabled={!signedIn} />
        <button className="c-send" type="submit" aria-label="Send" disabled={!signedIn || busy}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7z" /></svg></button>
      </form>
      <div className="c-dock">
        <button className="c-round" type="button" aria-pressed={picking} title="Pick something on the screen" aria-label="Pick from the screen" onClick={() => setPicking(!picking)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="4" /></svg></button>
        <button className="c-talk" type="button" aria-pressed={talking} aria-label={voice ? "Talk to amax" : "Voice input is off; type instead"} onClick={talk}><Mascot /></button>
        <button className="c-round" type="button" title="New conversation" aria-label="New conversation" onClick={() => { convo.current = undefined; setLog([]); setPins([]); setIntent(undefined); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" /></svg></button>
      </div>
      {signedIn && (turnUsage ?? usage) && <p className="c-usage pinnable" data-testid="chat-usage"><span>{turnUsage ?? usage}</span><PinButton inline pin={{ label: "My AI usage this month", tool: "get_ai_usage", args: { scope: "self" } }} /></p>}
    </aside>
  );
}
