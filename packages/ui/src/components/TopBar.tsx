import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { Mascot } from "./Mascot";

type TopBarProps = { onSearch?: () => void; onAsk?: () => void; profile: ReactNode };

export function TopBar({ onSearch, onAsk, profile }: TopBarProps) {
  return (
    <div className="top">
      <button className="search" type="button" onClick={onSearch} aria-haspopup="dialog">
        <Icon name="search" />
        Search projects, people, anything<kbd>⌘K</kbd>
      </button>
      <button className="launcher" type="button" onClick={onAsk} aria-label="Ask amax" title="Ask amax (⌘K)">
        <span className="lface"><Mascot /></span>
        <span className="ltxt">Ask amax</span>
      </button>
      <div className="icons">
        <button className="iconbtn" type="button" aria-label="Notifications"><Icon name="bell" /></button>
        <span className="vr" />
        {profile}
      </div>
    </div>
  );
}
