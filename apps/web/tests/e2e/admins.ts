/** 055: each Admin-only spec runs as an Admin and as IT Admin (Ravi), who sees everything but prices. */
export const ADMINS = [
  { email: "maya@lumenlabs.test", role: "Admin", pricing: true },
  { email: "ravi@lumenlabs.test", role: "IT Admin", pricing: false },
] as const;

/** A dollar figure in the screen's HTML (main): a money figure IT Admin must never get. The chat footer is their own cost. */
export const DOLLARS = /\$\d/;
