import { createHash, createHmac } from "node:crypto";

export const GENESIS = "0".repeat(64);

// Sorted keys so the hash survives jsonb's key reordering.
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export const sha256 = (prevHash: string, body: unknown) => createHash("sha256").update(prevHash).update(canonical(body)).digest("hex");

let chainKey: string | undefined;
export const setChainKey = (key: string) => {
  chainKey = key;
};

/** The keyed hash both chains are computed over, so erasing the raw value never breaks a chain. */
export function keyed(value: unknown, key = chainKey): string | null {
  if (value === null || value === undefined) return null;
  if (!key) throw new Error("amax: configureRuntime({ db, auditKey }) before writing to the audit or trace chain");
  return createHmac("sha256", key).update(canonical(value)).digest("hex");
}

export type ChainResult = { ok: true; length: number; head: string; erased: number } | { ok: false; brokenAt: number; reason: string };

type Row = Record<string, unknown>;
export type ChainSpec = { body: (r: Row) => unknown; pairs: (r: Row) => [unknown, unknown][]; keyedRow?: (r: Row) => boolean };

// Walks one tenant's chain: every seq present, every prev_hash linked, every hash recomputed, and
// every raw value still present matching its keyed hash. A null raw value with a key is an erasure.
export function walkChain(rows: Row[], spec: ChainSpec, key?: string): ChainResult {
  let prev = GENESIS;
  let erased = 0;
  for (const [i, r] of rows.entries()) {
    const seq = Number(r.seq);
    if (seq !== i + 1) return { ok: false, brokenAt: i + 1, reason: "missing row" };
    if (r.prev_hash !== prev) return { ok: false, brokenAt: seq, reason: "prev_hash mismatch" };
    if (sha256(prev, spec.body(r)) !== r.hash) return { ok: false, brokenAt: seq, reason: "hash mismatch" };
    if (spec.keyedRow?.(r) ?? true) {
      for (const [raw, k] of spec.pairs(r)) {
        if (raw === null || raw === undefined) erased += k ? 1 : 0;
        else if (keyed(raw, key) !== k) return { ok: false, brokenAt: seq, reason: "value mismatch" };
      }
    }
    prev = r.hash as string;
  }
  return { ok: true, length: rows.length, head: prev, erased };
}
