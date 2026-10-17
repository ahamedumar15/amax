"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chat } from "../chat/Chat";
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
  /** Voice input allowed by the tenant's AI policy (033). */
  voice?: boolean;
};

export function Shell({ items, children, profile = null, banner, onViewAs, onSignOut, voice = false }: ShellProps) {
  const current = useRouteFocus();
  const sheet = useRef<HTMLDialogElement>(null);
  const link = Link as unknown as LinkLike;
  const [chatOpen, setChatOpen] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  // Ask amax, ⌘K and Ctrl+K open the chat (005 AC-1); pins and intents open it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setChatOpen((o) => !o); }
    };
    const onChat = () => setChatOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("amax:chat", onChat);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("amax:chat", onChat); };
  }, []);
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="app">
        <Rail items={items} current={current} link={link} onMore={() => sheet.current?.showModal()} />
        <div className="content">
          <TopBar askRef={askRef} askOpen={chatOpen} onAsk={() => setChatOpen((o) => !o)} profile={<ProfileMenu profile={profile} onViewAs={onViewAs} onSignOut={onSignOut} />} />
          <main id="main" tabIndex={-1}>
            {banner && <div className="viewbanner" role="note">{banner}</div>}
            {children}
          </main>
        </div>
      </div>
      <MoreSheet ref={sheet} items={items} current={current} link={link} onClose={() => sheet.current?.close()} />
      <Chat open={chatOpen} onClose={() => setChatOpen(false)} returnFocus={askRef} signedIn={Boolean(profile)} voice={voice} />
      <LiveRegion />
    </>
  );
}
