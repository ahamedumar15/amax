"use client";

// The entity select opens /hr/e/<country> (or /hr for all entities).
export function EntityFilter({ entities, current }: { entities: { code: string; label: string }[]; current?: string }) {
  return (
    <select className="select" aria-label="Entity" defaultValue={current ?? ""}
      onChange={(e) => window.location.assign(e.target.value ? `/hr/e/${e.target.value}` : "/hr")}>
      <option value="">All entities</option>
      {entities.map((e) => <option key={e.code} value={e.code}>{e.label}</option>)}
    </select>
  );
}
