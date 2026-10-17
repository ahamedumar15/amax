"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { LiveRegion, MoreSheet, Rail, TopBar, type LinkLike, type NavItem } from "@amax/ui";
import { ProfileMenu } from "./ProfileMenu";
import { useRouteFocus } from "./useRouteFocus";

export function Shell({ items, children }: { items: NavItem[]; children: ReactNode }) {
  const current = useRouteFocus();
  const sheet = useRef<HTMLDialogElement>(null);
  const link = Link as unknown as LinkLike;
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="app">
        <Rail items={items} current={current} link={link} onMore={() => sheet.current?.showModal()} />
        <div className="content">
          <TopBar profile={<ProfileMenu />} />
          <main id="main" tabIndex={-1}>{children}</main>
        </div>
      </div>
      <MoreSheet ref={sheet} items={items} current={current} link={link} onClose={() => sheet.current?.close()} />
      <LiveRegion />
    </>
  );
}
