"use client";

// A read-only filter (R3): picking a role reloads the screen for it.
export function RoleSelect({ roles, at, total }: { roles: { id: string; title: string; openings: number }[]; at?: string; total: number }) {
  return (
    <select className="select" aria-label="Role" value={at ?? ""} onChange={(e) => window.location.assign(e.target.value ? `/recruitment?role=${e.target.value}` : "/recruitment")}>
      <option value="">All roles ({total})</option>
      {roles.map((r) => <option key={r.id} value={r.id}>{r.title} ({r.openings})</option>)}
    </select>
  );
}
