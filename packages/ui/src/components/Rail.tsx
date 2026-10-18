"use client";

import { Fragment, useEffect, useRef, useState, type FocusEvent } from "react";
import { groupItems, type LinkLike, type NavItem } from "../nav";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

type RailProps = { items: NavItem[]; current: string; link?: LinkLike; onMore?: () => void };

// 038 AC-3: a rail taller than the window scrolls on its own, keeps the current and the focused item
// in view, and fades the edge where items are hidden, so it's clear there is more.
function useOverflow(current: string) {
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const measure = () => {
    const el = ref.current;
    if (el) setEdges({ top: el.scrollTop > 1, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1 });
  };
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
    measure();
  }, [current]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const onFocus = (e: FocusEvent) => (e.target as HTMLElement).scrollIntoView?.({ block: "nearest" });
  return { ref, edges, measure, onFocus };
}

export function Rail({ items, current, link: Link = "a" as unknown as LinkLike, onMore }: RailProps) {
  const { ref, edges, measure, onFocus } = useOverflow(current);
  return (
    <nav ref={ref} className="rail" aria-label="Main" onScroll={measure} onFocus={onFocus} data-fade-top={edges.top || undefined} data-fade-bottom={edges.bottom || undefined}>
      <Logo />
      {groupItems(items).map(([group, groupItemsList]) => (
        <Fragment key={group || "top"}>
          {group && <div className="grp"><span>{group}</span></div>}
          {groupItemsList.map((item) => (
            <Link key={item.href} href={item.href} className={item.primary ? "pri" : undefined} aria-current={item.href === current ? "page" : undefined}>
              <Icon name={item.icon} />
              <span className="lbl">{item.label}</span>
            </Link>
          ))}
        </Fragment>
      ))}
      <button className="more-btn" type="button" onClick={onMore} aria-haspopup="dialog">
        <Icon name="more" />
        <span className="lbl">More</span>
      </button>
    </nav>
  );
}
