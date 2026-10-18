// What a pin names (005 AC-4). A record's pin carries its id (059), so a rename never strands it, and
// chat refreshes `label` from the record whenever it reads it. `facet`: the part of the record a pin
// shows (" proposals", ", leave"); chat keeps it on the refreshed label, so the chip still says which.
export type PinRef = { label: string; tool: string; args: Record<string, unknown>; facet?: string };

/** The same record's pin, for one part of it: "CON v2.4.0" with " proposals" reads "CON v2.4.0 proposals". */
export const facet = (pin: PinRef, part: string): PinRef => ({ ...pin, label: `${pin.label}${part}`, facet: part });
