// 089 AC-9: change numbers that two folders share. Neither folder can own the proposal key, so every sync skips them
// with this line and leaves the stored proposal as it is. Found from the records themselves, whatever a client flags.
export function duplicateNumbers(records: { number: string; dir: string; duplicate?: boolean }[]) {
  const dirs = new Map<string, Set<string>>();
  for (const r of records) dirs.set(r.number, (dirs.get(r.number) ?? new Set()).add(r.dir));
  const flagged = new Set(records.filter((r) => r.duplicate).map((r) => r.number));
  return new Map([...dirs].filter(([n, d]) => d.size > 1 || flagged.has(n)).map(([n, d]) => [n, `two changes numbered ${n}: ${[...d].sort().join(", ")}`]));
}
