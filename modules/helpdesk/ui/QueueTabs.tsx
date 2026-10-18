import type { HelpdeskView } from "../server/views";

// Read-only navigation between the queues the viewer works in (HR's only for HR and Admin).
export function QueueTabs({ v }: { v: HelpdeskView }) {
  if (v.queues.length < 2) return null;
  return (
    <nav className="seg" aria-label="Queue">
      {v.queues.map((q) => <a key={q.key} href={`/helpdesk?queue=${encodeURIComponent(q.key)}`} aria-current={q.key === v.queue?.key ? "page" : undefined}>{q.name}</a>)}
    </nav>
  );
}
