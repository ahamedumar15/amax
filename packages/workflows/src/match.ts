import type { Json } from "./types";

// Postgres jsonb containment (`value @> match`) for a match nested inside an object: objects match
// key by key, arrays when every element of `match` is contained in some element of `value`, and
// scalars by equality (numbers by value). The Temporal engine uses this where Postgres uses @>.
export function contains(value: Json, match: Json): boolean {
  if (Array.isArray(match)) return Array.isArray(value) && match.every((m) => value.some((v) => contains(v, m)));
  if (match !== null && typeof match === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    return Object.entries(match).every(([k, m]) => Object.hasOwn(value, k) && contains(value[k], m));
  }
  return value === match;
}
