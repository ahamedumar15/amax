import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

type ContractLike = { id: string; projectName: string };
type InvoiceLike = { id: string; number: string };

export const contractLabel = (c: ContractLike) => `${c.projectName} contract`;
export const contractPin = (c: ContractLike, what?: string): PinRef => ({ label: what ? `${what}, ${contractLabel(c)}` : contractLabel(c), tool: "get_contract", args: { contractId: c.id } });
export const invoicePin = (i: InvoiceLike): PinRef => ({ label: `Invoice ${i.number}`, tool: "get_invoice", args: { invoiceId: i.id } });
export const viewPin = (label: string): PinRef => ({ label, tool: "get_financials", args: {} });

export const contractOf = (c: ContractLike | null): PinnedRecord | null => (c ? { id: c.id, label: contractLabel(c) } : null);
export const invoiceOf = (i: InvoiceLike | null): PinnedRecord | null => (i ? { id: i.id, label: `Invoice ${i.number}` } : null);
