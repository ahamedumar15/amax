import type { ScreenProps } from "@amax/core";
import { PHASES, projectHref, type Phase } from "../contracts";
import { listProposals, listReleases, today } from "../server/queries";
import { ProjectSectionPage } from "./ProjectSections";
import { ProposalsTable } from "./ProposalsPage";
import { ReleasesCards } from "./ReleasesPage";
import { needViewer } from "./parts";

/** A project's Proposals section (051): the global proposals table, scoped to the project in the query. */
export function ProjectProposals(props: ScreenProps) {
  const viewer = needViewer(props.viewer);
  const phase = (PHASES as readonly string[]).includes(props.params.phase ?? "") ? (props.params.phase as Phase) : undefined;
  const asked = Math.max(1, Number(props.searchParams?.page ?? 1) || 1);
  return (
    <ProjectSectionPage {...props} section="proposals" title="Proposals">
      {async (p) => <ProposalsTable rows={await listProposals(viewer!, { phase, projectKey: p.key })} phase={phase} root={projectHref(p.key, "proposals")} page={asked} title="Proposals" />}
    </ProjectSectionPage>
  );
}

/** A project's Releases section (051): the global release map and table, scoped to the project in the query. */
export function ProjectReleases(props: ScreenProps) {
  const viewer = needViewer(props.viewer);
  return (
    <ProjectSectionPage {...props} section="releases" title="Releases">
      {async (p) => {
        const [releases, now] = await Promise.all([listReleases(viewer!, { projectKey: p.key }), today(viewer!)]);
        return <ReleasesCards viewer={viewer!} releases={releases} now={now} root={projectHref(p.key, "releases")} map={props.searchParams?.map} projectKey={p.key} />;
      }}
    </ProjectSectionPage>
  );
}
