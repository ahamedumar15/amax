import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Pins name a record by its id (059); the label comes from the record as the viewer reads it.
type ProductLike = { id: string; name: string };
type AccountLike = { accountId: string; name: string };
export const productPin = (p: ProductLike): PinRef => ({ label: `${p.name} licences`, tool: "get_product", args: { productId: p.id } });
export const accountPin = (a: AccountLike): PinRef => ({ label: `${a.name}'s access`, tool: "get_account", args: { accountId: a.accountId } });
/** A tile, a total, a card or the list for one filter: resolves to the screen it counts. */
export const viewPin = (label: string, people?: string): PinRef => ({ label, tool: "list_access", args: people && people !== "everyone" ? { people } : {} });

export const productOf = (p: ProductLike | null): PinnedRecord | null => (p ? { id: p.id, label: `${p.name} licences` } : null);
export const accountOf = (a: AccountLike | null): PinnedRecord | null => (a ? { id: a.accountId, label: `${a.name}'s access` } : null);
