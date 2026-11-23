import type { ProjectHeaderProps } from "../contracts";
import { projectHeader } from "../server/header";
import { ProjectHeader } from "./ProjectHeader";

export async function ProjectHeaderFor({ viewer, projectKey, section, title, actions }: ProjectHeaderProps) {
  const head = await projectHeader(viewer, projectKey);
  if (!head) return null;
  return <ProjectHeader project={head.project} lede={head.lede} section={section} title={title} actions={actions} />;
}
