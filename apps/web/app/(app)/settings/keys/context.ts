import { contextForViewer, type Viewer } from "@amax/auth";
import type { ServiceContext } from "@amax/core/server";

export const adminContext = (viewer: Viewer): ServiceContext => contextForViewer(viewer, "ui");
