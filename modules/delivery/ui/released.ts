// 092 AC-5: a Released card says "In Prod" only when a Prod deployment released it (it then has its release); a
// finished change that came in from the repo's archive as history (091 AC-4) never had one, and says so.
export const releasedLabel = (p: { release: string | null }) =>
  p.release ? { text: `In Prod · ${p.release}`, prod: true } : { text: "Released · from repo", prod: false };
