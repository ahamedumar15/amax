"use client";

// A read-only filter (R3): picking a role reloads the screen for it.
export function RoleSelect({ roles, at, total }: { roles: { id: string; title: string; openings: number }[]; at?: string; total: number }) {
  return (
    <select className="select" aria-label="Role" value={at ?? ""} onChange={(e) => { const id = roles.find((r) => r.id === e.target.value)?.id; window.location.assign(id ? `/recruitment?role=${encodeURIComponent(id)}` : "/recruitment"); }}>
      <option value="">All roles ({total})</option>
      {roles.map((r) => <option key={r.id} value={r.id}>{r.title} ({r.openings})</option>)}
    </select>
  );
}
