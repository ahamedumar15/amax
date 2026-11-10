// 092 AC-5: a Released card says "In Prod" only when a live Prod deployment of its release released it. A finished
// change that came in from the repo's archive as history (091 AC-4) never had one, and says so.
export const releasedLabel = (p: { release: string | null; inProd: boolean; source: string | null }) =>
  p.inProd && p.release ? { text: `In Prod · ${p.release}`, prod: true }
    : { text: p.source === "specclaw" ? "Released · from repo" : "Released", prod: false };
