import type { ReactNode } from "react";
import { Shell } from "../../components/shell/Shell";
import { profileOf, viewBanner, visibleNav } from "../../lib/profile";
import { navItems } from "../../lib/registry";
import { getViewer } from "../../lib/viewer";
import { signOutAction, viewAsAction } from "../actions/session";

// Every app screen depends on who is signed in, so none can be prerendered.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) return <Shell items={navItems}>{children}</Shell>;
  return (
    <Shell items={visibleNav(navItems, viewer)} profile={profileOf(viewer)} banner={viewBanner(viewer)} onViewAs={viewAsAction} onSignOut={signOutAction}>
      {children}
    </Shell>
  );
}
