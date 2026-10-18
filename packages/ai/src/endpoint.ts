// 044 AC-3: where AI calls actually go comes from the server's configuration, not from what an Admin
// declares. The gate compares this region with the data region, so the declaration can't pass alone.

/** The provider endpoint calls go to, and the region the operator configured for it (null: not said). */
export type AiEndpoint = { url: string | null; region: string | null };

export const PROVIDER_DEFAULT = "https://api.anthropic.com";
let endpoint: AiEndpoint = { url: null, region: null };

export const configureEndpoint = (e: Partial<AiEndpoint>) => {
  endpoint = { url: e.url ?? null, region: e.region ?? null };
};
export const aiEndpoint = (): AiEndpoint => endpoint;
