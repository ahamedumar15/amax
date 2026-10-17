import type { ReactNode } from "react";

type CardProps = { title?: string; actions?: ReactNode; flush?: boolean; children: ReactNode };

export function Card({ title, actions, flush, children }: CardProps) {
  return (
    <section className={flush ? "card flush" : "card"}>
      {title && (
        <div className="card-head">
          <h2>{title}</h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
