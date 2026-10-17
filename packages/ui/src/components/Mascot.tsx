export function Mascot() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="amax-mascot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--mascot-light)" }} />
          <stop offset="1" style={{ stopColor: "var(--mascot-dark)" }} />
        </linearGradient>
      </defs>
      <rect x="29" y="4" width="6" height="9" rx="3" style={{ fill: "var(--mascot-dark)" }} />
      <circle cx="32" cy="5" r="4" style={{ fill: "var(--brand-violet)" }} />
      <rect x="6" y="12" width="52" height="44" rx="22" fill="url(#amax-mascot)" />
      <rect x="13" y="22" width="38" height="22" rx="11" style={{ fill: "var(--mascot-face)" }} opacity=".9" />
      <ellipse cx="24" cy="33" rx="4" ry="5" style={{ fill: "var(--mascot-light)" }} />
      <ellipse cx="40" cy="33" rx="4" ry="5" style={{ fill: "var(--mascot-light)" }} />
      <path d="M27 50q5 3 10 0" style={{ stroke: "var(--mascot-face)" }} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}
