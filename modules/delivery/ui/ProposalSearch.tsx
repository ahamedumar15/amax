"use client";

/** 081 AC-16: search proposals by key or title. Read-only: Enter opens the list with `q`, keeping the other filters. */
export function ProposalSearch({ base, project, q }: { base: string; project?: string; q?: string }) {
  const go = (value: string) => {
    const s = new URLSearchParams(Object.entries({ project, q: value.trim() }).filter(([, x]) => x) as [string, string][]).toString();
    window.location.assign(`${base}${s ? `?${s}` : ""}`);
  };
  return (
    <span role="search" className="proposal-search">
      <input type="search" defaultValue={q ?? ""} placeholder="Search proposals" aria-label="Search proposals by key or title, then press Enter"
        onKeyDown={(e) => { if (e.key === "Enter") go(e.currentTarget.value); }} />
    </span>
  );
}
