"use client";

// The mock's client select: filters the portfolio by client (kept in the URL).
export function ClientFilter({ clients, current }: { clients: string[]; current?: string }) {
  return (
    <select className="select" aria-label="Client" defaultValue={current ?? ""} onChange={(e) => {
      const u = new URL(window.location.href);
      if (e.target.value) u.searchParams.set("client", e.target.value); else u.searchParams.delete("client");
      window.location.assign(u.toString());
    }}>
      <option value="">All clients</option>
      {clients.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}
