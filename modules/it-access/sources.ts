import { graphSource } from "./server/graph";
import { devopsSource, githubSource } from "./server/devops";
import type { ConnectorId } from "@amax/core/secrets";

/**
 * AC-1: what one read-only source reports. Products match `it_access.product.external_id`, accounts
 * match `it_access.account.external_id` (the Entra object id), devices are Intune's.
 */
export type Snapshot = {
  products: { externalId: string; seats: number }[];
  accounts: { externalId: string; lastActiveOn: string | null; adminRoles: string[] }[];
  devices: { externalId: string; name: string; os: string; compliant: boolean; ownerExternalId: string | null }[];
};
export const emptySnapshot = (): Snapshot => ({ products: [], accounts: [], devices: [] });

/** A source opens only its read connector (031); the value never leaves `fetch`. */
export type SyncSource = { id: string; label: string; connector: ConnectorId; fetch: (secret: string, signal: AbortSignal) => Promise<Snapshot> };

let sources: SyncSource[] = [graphSource, devopsSource, githubSource];
export const syncSources = () => sources;
/** Tests stand in for Microsoft, Azure DevOps and GitHub here; the real services are never reached from a test. */
export const setSyncSources = (list: SyncSource[] | null) => void (sources = list ?? [graphSource, devopsSource, githubSource]);
