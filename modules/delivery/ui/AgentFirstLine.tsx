/**
 * 093 AC-1, 094 AC-8: where agent-first proposals come from: one project's repo, or "your repos" across projects.
 * 104 AC-14 (amendment 1): an info icon rather than a line of text. Its tooltip, on hover and on keyboard focus, opens
 * with what the page is (`intro`, the lede it replaces) and then says, step by step, how a change gets here.
 */
export function AgentFirstLine({ repoUrl, intro }: { repoUrl?: string; intro?: string }) {
  // One icon per page (or per project on a list), so the repo names the tooltip; no hook, so it renders anywhere.
  const id = `dv-tip-${(repoUrl ?? "all").replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <span className="dv-info">
      <button type="button" className="dv-info-btn" aria-label="About proposals and how to add one" aria-describedby={id}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" strokeWidth="1.5" /><path d="M8 7v4.5M8 4.5v.5" fill="none" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
      <span role="tooltip" id={id} className="dv-tip">
        {intro && <p>{intro}</p>}
        <p>Proposals come from {repoUrl ?? "your repos"}; nothing is typed in here. To add one:</p>
        <ol>
          <li>In the repo, write it with <code>/specclaw:propose</code>.</li>
          <li>Sync the repo to amax: run <code>/amax:sync-specclaw</code> there, or merge the change and CI syncs it.</li>
        </ol>
      </span>
    </span>
  );
}
