// Pure pin helpers, no server imports: the chat panel uses them in the browser.

/**
 * A pinned record or view (005 AC-4). A record's pin names it by its id (059) and chat refreshes
 * `label` from the record each time it reads it; `facet` is the part of the record it shows, kept on
 * the refreshed label. `unavailable`: an old pin whose record couldn't be found when it was moved
 * onto an id. It is never read again, so it can't come to mean a different record.
 */
export type Pin = { label: string; tool: string; args: Record<string, unknown>; facet?: string; unavailable?: true };

export const UNAVAILABLE = "No longer available";

/** Which pin this is, whatever its label says now. */
export const pinKey = (p: Pick<Pin, "tool" | "args" | "facet">) => JSON.stringify([p.tool, p.args, p.facet ?? ""]);

/**
 * The panel's pins after a turn or a refresh: each pin that was `sent` takes its `fresh` copy (same
 * position), and a pin added or removed meanwhile stays as the panel has it.
 */
export function withFresh<P extends Pin>(current: P[], sent: Pin[], fresh: Pin[]): Pin[] {
  const at = new Map(sent.map((p, i) => [pinKey(p), fresh[i]]));
  return current.map((p) => at.get(pinKey(p)) ?? p);
}
