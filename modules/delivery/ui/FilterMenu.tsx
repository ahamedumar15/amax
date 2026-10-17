// The mock's Filter button: opens a short list of links that narrow the table (kept in the URL).
export function FilterMenu({ label, options }: { label: string; options: { text: string; href: string; current: boolean }[] }) {
  return (
    <details className="filtermenu">
      <summary className="btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>Filter</summary>
      <nav aria-label={label}>
        {options.map((o) => <a key={o.href} href={o.href} aria-current={o.current ? "true" : undefined}>{o.text}</a>)}
      </nav>
    </details>
  );
}
