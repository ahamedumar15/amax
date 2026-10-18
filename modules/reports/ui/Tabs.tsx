import { VIEWS, type ViewKey } from "./views";

export function Tabs({ current }: { current: ViewKey }) {
  return (
    <nav className="seg" aria-label="Report">
      {VIEWS.map((v) => <a key={v.key} href={v.href} aria-current={v.key === current ? "page" : undefined}>{v.label}</a>)}
    </nav>
  );
}
