export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 44 44" aria-hidden="true">
      <defs>
        <linearGradient id="amax-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--brand-mint)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand-violet)" }} />
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="14" fill="url(#amax-logo)" />
      <path d="M12 31 21 13l4 8 7-6" fill="none" style={{ stroke: "var(--brand-white)" }} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="15" r="3" style={{ fill: "var(--brand-yellow)" }} />
    </svg>
  );
}
