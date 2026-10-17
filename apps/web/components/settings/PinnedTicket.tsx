import type { ComponentProps, ReactNode } from "react";
import "./admin.css";
import { PinButton, Ticket, type PinRef } from "@amax/ui";

// A ticket with its own pin (047 AC-5), resolved through a read tool.
export function PinnedTicket({ pin, art, ...t }: ComponentProps<typeof Ticket> & { pin: PinRef; art?: ReactNode }) {
  return <Ticket {...t} art={<><PinButton pin={pin} />{art}</>} />;
}
