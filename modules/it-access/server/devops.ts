import { emptySnapshot, type SyncSource } from "../sources";
import { getJson, parseSecret } from "./http";

/** The azure-devops and github secrets are JSON: the organisation and a read-only token. */
type Org = { org: string; token: string };

// AC-1: Azure DevOps access levels and their seats (the user entitlement summary), read-only.
export const devopsSource: SyncSource = {
  id: "azure-devops", label: "Azure DevOps", connector: "azure-devops",
  async fetch(secret, signal) {
    const c = parseSecret<Org>(secret, ["org", "token"], "azure-devops");
    const auth = { authorization: `Basic ${Buffer.from(`:${c.token}`).toString("base64")}` };
    const s = await getJson<{ licenses: { licenseName: string; total: number }[] }>(
      `https://vsaex.dev.azure.com/${encodeURIComponent(c.org)}/_apis/userentitlementsummary?api-version=7.1-preview.1`, auth, signal, "Azure DevOps");
    return { ...emptySnapshot(), products: s.licenses.map((l) => ({ externalId: `azure-devops:${l.licenseName}`, seats: l.total })) };
  },
};

// AC-1: GitHub Copilot Business seats for the organisation, read-only.
export const githubSource: SyncSource = {
  id: "github", label: "GitHub", connector: "github",
  async fetch(secret, signal) {
    const c = parseSecret<Org>(secret, ["org", "token"], "github");
    const b = await getJson<{ seat_breakdown: { total: number } }>(`https://api.github.com/orgs/${encodeURIComponent(c.org)}/copilot/billing`,
      { authorization: `Bearer ${c.token}`, "x-github-api-version": "2022-11-28" }, signal, "GitHub");
    return { ...emptySnapshot(), products: [{ externalId: "github:copilot", seats: b.seat_breakdown.total }] };
  },
};
