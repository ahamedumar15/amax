"use client";

import { forwardRef } from "react";
import { groupItems, type LinkLike, type NavItem } from "../nav";
import { Icon } from "./Icon";

type SheetProps = { items: NavItem[]; current: string; link?: LinkLike; onClose: () => void };

export const MoreSheet = forwardRef<HTMLDialogElement, SheetProps>(function MoreSheet({ items, current, link: Link = "a" as unknown as LinkLike, onClose }, ref) {
  return (
    <dialog ref={ref} className="sheet" aria-label="All screens" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-head">
        <h2>All screens</h2>
        <button className="iconbtn" type="button" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
      </div>
      <ul className="sheet-list">
        {groupItems(items).flatMap(([group, list]) => [
          group ? <li key={`g-${group}`} className="sh">{group}</li> : null,
          ...list.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={item.href === current ? "page" : undefined}><Icon name={item.icon} />{item.label}</Link>
            </li>
          )),
        ])}
      </ul>
    </dialog>
  );
});
