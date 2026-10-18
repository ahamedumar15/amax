// Pure pin helpers (057), no server imports: the chat panel uses them in the browser.

export type Pin = { label: string; tool: string; args: Record<string, unknown> };

/**
 * A rename's instruction to saved pins (057): every pin of one of `tools` whose args hold all of
 * `match` takes `set`, and its label's word `label[0]` becomes `label[1]`. A write tool returns it
 * (tag_release, an environment rename) so pins made before the rename still read their record.
 */
export type Repin = { tools: string[]; match: Record<string, string>; set: Record<string, string>; label?: [string, string] };

const strings = (x: unknown): x is Record<string, string> =>
  !!x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length > 0 && Object.values(x).every((v) => typeof v === "string");

/** The `repin` of a tool result, only when it is well formed. */
export function repinOf(result: unknown): Repin | undefined {
  const r = (result as { repin?: Partial<Repin> } | null)?.repin;
  if (!r || !Array.isArray(r.tools) || !r.tools.every((t) => typeof t === "string") || !strings(r.match) || !strings(r.set)) return undefined;
  const label = Array.isArray(r.label) && r.label.length === 2 && r.label.every((l) => typeof l === "string" && l) ? (r.label as [string, string]) : undefined;
  return { tools: r.tools, match: r.match, set: r.set, ...(label ? { label } : {}) };
}

const edge = (s: string, i: number) => i < 0 || i >= s.length || /[\s,:;()]/.test(s[i]);

/** Swaps the last whole-word `from` in a label, so a short old name can't rewrite the project key or name. */
export function relabel(label: string, [from, to]: [string, string]) {
  for (let i = label.lastIndexOf(from); i >= 0; i = i ? label.lastIndexOf(from, i - 1) : -1) {
    if (edge(label, i - 1) && edge(label, i + from.length)) return label.slice(0, i) + to + label.slice(i + from.length);
  }
  return label;
}

/** The pins after a rename; untouched pins are returned as they were. */
export function repinAll<P extends Pin>(pins: P[], repin: Repin | undefined): P[] {
  if (!repin) return pins;
  return pins.map((p) => {
    if (!repin.tools.includes(p.tool) || !Object.entries(repin.match).every(([k, v]) => p.args[k] === v)) return p;
    return { ...p, args: { ...p.args, ...repin.set }, label: repin.label ? relabel(p.label, repin.label) : p.label };
  });
}
