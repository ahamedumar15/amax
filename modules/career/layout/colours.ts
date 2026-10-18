// One colour per technology everywhere (AC-3): the mock's nine, then a stable pick from the palette.
const KNOWN: Record<string, string> = {
  react: "var(--sky)", typescript: "var(--violet)", ".net": "var(--pink)", python: "var(--amber)", "azure functions": "#3B82F6",
  postgresql: "var(--mint)", go: "var(--sw-on)", aws: "var(--coral)", storybook: "var(--yellow)",
};
const PALETTE = ["var(--sky)", "var(--violet)", "var(--pink)", "var(--amber)", "var(--mint)", "var(--coral)", "var(--yellow)", "#3B82F6"];

export const techColour = (name: string) => {
  const key = name.trim().toLowerCase();
  return KNOWN[key] ?? PALETTE[[...key].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
};
