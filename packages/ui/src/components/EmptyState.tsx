import type { ReactNode } from "react";
import type { IconName } from "../icons";
import { Icon } from "./Icon";

type EmptyProps = { icon: IconName; title: string; hint: string; action?: ReactNode };

export function EmptyState({ icon, title, hint, action }: EmptyProps) {
  return (
    <div className="empty">
      <span className="ico"><Icon name={icon} /></span>
      <b>{title}</b>
      <p>{hint}</p>
      {action}
    </div>
  );
}
