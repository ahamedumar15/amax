import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Delivery's pins (059), one place for the pages and the read tools: a page pins a record by its id,
// and the tool's `of` gives the label from the record as it is now, in the same words the page used,
// so a chip reads the same before and after chat refreshes it. A renamable name (a version tag, an
// environment, a proposal key) is only ever part of a label.

export const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "–");

type Release = { id: string; projectKey: string; projectName: string; version: string };
type Environment = { id: string; projectKey: string; name: string };
type Proposal = { id: string; key: string; title: string };
type Deployment = { id: string; projectKey: string; version: string; environment: string; at: string };

export const projectPin = (p: { id: string; name: string }): PinRef => ({ label: p.name, tool: "get_project", args: { projectId: p.id } });
export const proposalPin = (p: Proposal): PinRef => ({ label: `${p.key} ${p.title}`, tool: "get_proposal", args: { proposalId: p.id } });
export const releasePin = (r: Release): PinRef => ({ label: `${r.projectName} ${r.version}`, tool: "get_release", args: { releaseId: r.id } });
export const historyPin = (r: Omit<Release, "projectName">): PinRef => ({ label: `${r.projectKey} ${r.version}`, tool: "get_release_history", args: { releaseId: r.id } });
export const environmentPin = (e: Environment): PinRef => ({ label: `${e.projectKey} ${e.name}`, tool: "get_environment", args: { environmentId: e.id } });
export const deploymentPin = (d: Deployment): PinRef =>
  ({ label: `${d.projectKey} ${d.version} on ${d.environment}, ${day(d.at)}`, tool: "get_deployment", args: { deploymentId: d.id } });

type Push = { id: string; projectKey: string; sha: string; outcome: string; at: string };
export const repoSyncPin = (p: { id: string; key: string }): PinRef => ({ label: `${p.key} repo sync`, tool: "get_repo_sync", args: { projectId: p.id } });
export const pushPin = (p: Push): PinRef => ({ label: `${p.projectKey} push ${p.sha.slice(0, 7)} ${p.outcome}, ${day(p.at)}`, tool: "get_sync_push", args: { pushId: p.id } });

// The record a read tool's result is, for its pin: its id, label now and, where the name it was once
// pinned by can be reused, when it was made. Null when the read found nothing.
const pinned = <R extends { id: string; createdAt?: string | null }>(pin: (r: R) => PinRef) => (r: R | null | undefined): PinnedRecord | null =>
  r ? { id: r.id, label: pin(r).label, createdAt: r.createdAt ?? null } : null;

export const pinOf = {
  project: (r: { project: { id: string; name: string } } | null) => pinned(projectPin)(r?.project),
  proposal: pinned(proposalPin),
  release: pinned(releasePin),
  history: pinned(historyPin),
  environment: pinned(environmentPin),
  deployment: pinned(deploymentPin),
  push: pinned(pushPin),
  repoSync: (r: { project: { id: string; key: string } } | null) => pinned(repoSyncPin)(r?.project),
};
