import type { ReactNode } from "react";
import { Shell } from "../../components/shell/Shell";
import { navItems } from "../../lib/registry";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <Shell items={navItems}>{children}</Shell>;
}
