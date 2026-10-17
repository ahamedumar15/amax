import type { ScreenProps } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import { PROJECT_SECTIONS, projectHref } from "@amax/delivery/contracts";
import { Card, EmptyState, PinButton } from "@amax/ui";
import { monthLabel } from "../server/months";
import { teamFor, type ProjectTeam } from "../server/team";

function Header({ projectKey, name }: { projectKey: string; name: string }) {
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery">Projects</a><span>/</span><a href={projectHref(projectKey)}>{name}</a><span>/</span>Team</nav>
      <h1>{name}</h1>
      <nav className="tabs" aria-label="Sections">
        {PROJECT_SECTIONS.map((s) => <a key={s.path} className="btn sm" href={projectHref(projectKey, s.path)} aria-current={s.path === "team" ? "page" : undefined}>{s.label}</a>)}
      </nav>
    </>
  );
}

function TeamTable({ team }: { team: ProjectTeam }) {
  const { project, months, people, hidden } = team;
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Team</h2><PinButton inline pin={{ label: `${project.name} team`, tool: "get_project_team", args: { projectKey: project.key } }} /><span className="muted" style={{ fontSize: 13 }}>From allocations</span></div>
      {people.length ? (
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">Team allocated to {project.name}</caption>
            <thead><tr><th>Person</th><th>Role</th>{months.map((m) => <th key={m} className="num">{monthLabel(m)}</th>)}</tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.personId} className="pinnable">
                  <td data-label="Person">{p.name}</td>
                  <td data-label="Role">{p.role}</td>
                  {p.percents.map((n, i) => <td key={months[i]} data-label={monthLabel(months[i])} className="num">{n === null ? <span className="muted">–</span> : `${n}%`}{i === months.length - 1 && <PinButton pin={{ label: `${p.name} on ${project.name}`, tool: "get_project_team", args: { projectKey: project.key, person: p.employeeNo } }} />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon="people" title="Nobody is allocated here" hint={`No one has time on ${project.name} from ${monthLabel(months[0], "long")} to ${monthLabel(months[2], "long")}.`} />}
      {hidden > 0 && <p className="muted note" style={{ padding: "0 28px 20px" }}>{hidden} more {hidden === 1 ? "person is" : "people are"} allocated here outside your HR access.</p>}
    </div>
  );
}

/** The project page's Team section (051), mounted at /delivery/p/:key/team. */
export async function ProjectTeamPage({ viewer: raw, params }: ScreenProps) {
  const viewer = raw as Viewer | null;
  if (!viewer) return <><h1>Team</h1><Card><EmptyState icon="people" title="Sign in to see the team" hint="Allocations come from the database once you're signed in." /></Card></>;
  if (!can(viewer, "allocations:read")) return <><h1>Team</h1><Card><EmptyState icon="people" title="Allocations aren't open to your role" hint="Ask a PM or HR for who is on this project." /></Card></>;
  const team = await teamFor(viewer, params.key);
  if (!team) return <><h1>Project not found</h1><p className="lede">No project with the key {params.key}.</p></>;
  return <><Header projectKey={team.project.key} name={team.project.name} /><TeamTable team={team} /></>;
}
