"use client";

import { usePathname, useRouter } from "next/navigation";

type Option = { value: string; label: string };

export function UsageFilters({ month, source, months }: { month: string; source: string; months: Option[] }) {
  const router = useRouter();
  const path = usePathname();
  const go = (next: { month?: string; source?: string }) => {
    const q = new URLSearchParams({ month, ...(source ? { source } : {}), ...next });
    if (!q.get("source")) q.delete("source");
    router.push(`${path}?${q}`);
  };
  return (
    <div className="actions">
      <select className="select" aria-label="Month" value={month} onChange={(e) => go({ month: e.target.value })}>
        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <select className="select" aria-label="Source" value={source} onChange={(e) => go({ source: e.target.value })}>
        <option value="">All sources</option>
        <option value="chat">Chat</option>
        <option value="agents">Agents</option>
        <option value="jobs">Jobs</option>
      </select>
    </div>
  );
}
