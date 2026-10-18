import type { ReactNode } from "react";
import { Shell } from "../../components/shell/Shell";
import { profileOf, viewBanner, visibleNav } from "../../lib/profile";
import { menuItems, navItems, settingsPaths, topBarControls } from "../../lib/registry";
import { getViewer } from "../../lib/viewer";
import { voiceEnabled } from "../../lib/server";
import { myChatUsage } from "../../lib/chat-usage";
import { signOutAction, viewAsAction } from "../actions/session";

// Every app screen depends on who is signed in, so none can be prerendered.
export const dynamic = "force-dynamic";
// 062: only the public marketing page is indexed; app screens never are.
export const metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  const topBar = topBarControls.length ? <>{topBarControls.map(({ id, Control }) => <Control key={id} viewer={viewer} />)}</> : undefined;
  if (!viewer) return <Shell items={navItems} topBar={topBar} settingsPaths={settingsPaths}>{children}</Shell>;
  const [voice, usage] = await Promise.all([voiceEnabled(viewer.tenantId), myChatUsage(viewer)]);
  const menuLinks = visibleNav(menuItems, viewer).map((i) => ({ href: i.href, label: i.label }));
  return (
    <Shell items={visibleNav(navItems, viewer)} profile={profileOf(viewer)} banner={viewBanner(viewer)} onViewAs={viewAsAction} onSignOut={signOutAction} voice={voice} usage={usage} topBar={topBar} menuLinks={menuLinks} settingsPaths={settingsPaths}>
      {children}
    </Shell>
  );
}
