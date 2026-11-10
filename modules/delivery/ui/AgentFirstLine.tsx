/** 093 AC-1: where an agent-first project's proposals come from, in place of "New proposal". */
export function AgentFirstLine({ repoUrl }: { repoUrl: string }) {
  return (
    <span className="chip dv-agent-first">
      Proposals come from {repoUrl} · write one with <code>/specclaw:propose</code>; it appears here when merged
    </span>
  );
}
