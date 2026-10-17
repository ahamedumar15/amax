import { Fragment } from "react";
import { groupItems, type LinkLike, type NavItem } from "../nav";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

type RailProps = { items: NavItem[]; current: string; link?: LinkLike; onMore?: () => void };

export function Rail({ items, current, link: Link = "a" as unknown as LinkLike, onMore }: RailProps) {
  return (
    <nav className="rail" aria-label="Main">
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
