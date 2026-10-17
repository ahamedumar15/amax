"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { LiveRegion, MoreSheet, Rail, TopBar, type LinkLike, type NavItem } from "@amax/ui";
import { ProfileMenu, type Profile } from "./ProfileMenu";
import { useRouteFocus } from "./useRouteFocus";

type ShellProps = {
  items: NavItem[];
  children: ReactNode;
  profile?: Profile | null;
  banner?: string | null;
  onViewAs?: (role: string | null) => Promise<void>;
  onSignOut?: () => Promise<void>;
};

export function Shell({ items, children, profile = null, banner, onViewAs, onSignOut }: ShellProps) {
  const current = useRouteFocus();
  const sheet = useRef<HTMLDialogElement>(null);
  const link = Link as unknown as LinkLike;
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="app">
        <Rail items={items} current={current} link={link} onMore={() => sheet.current?.showModal()} />
        <div className="content">
          <TopBar profile={<ProfileMenu profile={profile} onViewAs={onViewAs} onSignOut={onSignOut} />} />
          <main id="main" tabIndex={-1}>
            {banner && <div className="viewbanner" role="note">{banner}</div>}
            {children}
          </main>
        </div>
      </div>
      <MoreSheet ref={sheet} items={items} current={current} link={link} onClose={() => sheet.current?.close()} />
      <LiveRegion />
    </>
  );
}
