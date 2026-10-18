import { contextForViewer, type Viewer } from "@amax/auth";
import type { ServiceContext, Source } from "@amax/core/server";

// A screen or tool acting for the viewer: the person, or a service credential acting for them (058).
export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);

/** Who did it, as it is written on the record: the person, or the agent or job and who it acts for. */
export const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);
