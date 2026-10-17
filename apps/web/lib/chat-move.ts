// Client-safe: no server imports, so the chat panel can use it.

/** A write that renames the record a page is named by (a re-tag) returns where that page went (057). */
export type Moved = { from: string; to: string };

const local = (x: unknown): x is string => typeof x === "string" && /^\/(?![/\\])/.test(x);

/** The `moved` of a tool result, only when both ends are same-site paths. */
export function movedOf(result: unknown): Moved | undefined {
  const m = (result as { moved?: { from?: unknown; to?: unknown } } | null)?.moved;
  return m && local(m.from) && local(m.to) ? { from: m.from, to: m.to } : undefined;
}

/** Where the page should go after a confirmed write: the record's new page, if this page was its old one. */
export function followMove(pathname: string, moved: Moved | undefined): string | null {
  if (!moved) return null;
  const same = (a: string, b: string) => { try { return decodeURIComponent(a) === decodeURIComponent(b); } catch { return a === b; } };
  return same(pathname, moved.from) ? moved.to : null;
}

/**
 * A rename's instruction to the open conversation's pins (057): every pin of one of `tools` whose args
 * hold all of `match` takes `set`, and its label swaps `label[0]` for `label[1]`. So a pin made before a
 * re-tag or an environment rename still reads its record on the next turn.
 */
export type Repin = { tools: string[]; match: Record<string, string>; set: Record<string, string>; label?: [string, string] };
type Pin = { label: string; tool: string; args: Record<string, unknown> };

const strings = (x: unknown): x is Record<string, string> =>
  !!x && typeof x === "object" && !Array.isArray(x) && Object.values(x).every((v) => typeof v === "string") && Object.keys(x).length > 0;

/** The `repin` of a tool result, only when it is well formed. */
export function repinOf(result: unknown): Repin | undefined {
  const r = (result as { repin?: Partial<Repin> } | null)?.repin;
  if (!r || !Array.isArray(r.tools) || !r.tools.every((t) => typeof t === "string") || !strings(r.match) || !strings(r.set)) return undefined;
  const label = Array.isArray(r.label) && r.label.length === 2 && r.label.every((l) => typeof l === "string" && l) ? (r.label as [string, string]) : undefined;
  return { tools: r.tools, match: r.match, set: r.set, ...(label ? { label } : {}) };
}

/** The pins after a rename; untouched pins are returned as they were. */
export function repinAll<P extends Pin>(pins: P[], repin: Repin | undefined): P[] {
  if (!repin) return pins;
  return pins.map((p) => {
    if (!repin.tools.includes(p.tool) || !Object.entries(repin.match).every(([k, v]) => p.args[k] === v)) return p;
    return { ...p, args: { ...p.args, ...repin.set }, label: repin.label ? p.label.split(repin.label[0]).join(repin.label[1]) : p.label };
  });
}
