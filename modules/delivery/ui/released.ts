// 092 AC-5: a Released card says "In Prod" only when a live Prod deployment of its release released it. A finished
// change that came in from the repo's archive as history (091 AC-4) never had one, and says so.
export const releasedLabel = (p: { release: string | null; inProd: boolean; source: string | null }) =>
  p.inProd && p.release ? { text: `In Prod · ${p.release}`, prod: true }
    : { text: p.source === "specclaw" ? "Released · from repo" : "Released", prod: false };

/** 093 final pass: the Proposals list's "Shipped to" and its CSV, by the same rule as the card: "Prod" only for a live
 * Prod deployment; a Released proposal without one says what releasedLabel says; anything else, where it was deployed. */
export const shippedToLabel = (p: { phase: string; release: string | null; inProd: boolean; source: string | null; shippedTo: string | null }) =>
  p.phase === "released" ? (releasedLabel(p).prod ? "Prod" : releasedLabel(p).text) : p.shippedTo;
