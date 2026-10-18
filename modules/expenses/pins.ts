import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

type ClaimLike = { id: string; number: string; personName: string };
type CategoryLike = { id: string; name: string; entity: string };

export const claimLabel = (c: ClaimLike) => `${c.number}, ${c.personName}`;
export const claimPin = (c: ClaimLike): PinRef => ({ label: `Expense claim ${claimLabel(c)}`, tool: "get_expense_claim", args: { claimId: c.id } });
export const categoryPin = (k: CategoryLike): PinRef => ({ label: `${k.name} limits, ${k.entity}`, tool: "get_expense_category", args: { categoryId: k.id } });
export const viewPin = (label: string): PinRef => ({ label, tool: "get_expenses", args: {} });

export const claimOf = (c: ClaimLike | null): PinnedRecord | null => (c ? { id: c.id, label: `Expense claim ${claimLabel(c)}` } : null);
export const categoryOf = (k: CategoryLike | null): PinnedRecord | null => (k ? { id: k.id, label: `${k.name} limits, ${k.entity}` } : null);
