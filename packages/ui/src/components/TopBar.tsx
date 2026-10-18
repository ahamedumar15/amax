import type { ReactNode, Ref } from "react";
import { Icon } from "./Icon";
import { Mascot } from "./Mascot";

/** `bell`: a module's notification control (030); the plain icon when none is installed. */
type TopBarProps = { onSearch?: () => void; onAsk?: () => void; askOpen?: boolean; askRef?: Ref<HTMLButtonElement>; profile: ReactNode; bell?: ReactNode };

export function TopBar({ onSearch, onAsk, askOpen, askRef, profile, bell }: TopBarProps) {
  return (
    <div className="top">
      <button className="search" type="button" onClick={onSearch} aria-haspopup="dialog">
        <Icon name="search" />
        Search projects, people, anything<kbd>⌘K</kbd>
      </button>
      <button ref={askRef} className="launcher" type="button" onClick={onAsk} aria-label="Ask amax" title="Ask amax (⌘K)" aria-expanded={askOpen ?? false} aria-controls="chat">
        <span className="lface"><Mascot /></span>
        <span className="ltxt">Ask amax</span>
      </button>
      <div className="icons">
        {bell ?? <button className="iconbtn" type="button" aria-label="Notifications"><Icon name="bell" /></button>}
        <span className="vr" />
        {profile}
      </div>
    </div>
  );
}
