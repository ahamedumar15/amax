"use client";

import type { OverviewFilter } from "@amax/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Read-only selects (rule 1 allows filters). A value is used only if it is one of the panel's own
// options, then set through URLSearchParams, so nothing typed into the URL reaches navigation as is.
export function PanelFilters({ filters }: { filters: OverviewFilter[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const pick = (f: OverviewFilter, value: string) => {
    const option = f.options.find((o) => o.value === value);
    if (!option) return;
    const next = new URLSearchParams(params.toString());
    next.set(f.param, option.value);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  return (
    <>
      {filters.map((f) => (
        <select key={f.param} className="select" aria-label={f.label} value={f.value} onChange={(e) => pick(f, e.target.value)}>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
    </>
  );
}
