import { cache } from "react";
import { loadViewer, setViewerResolver, type Viewer } from "@amax/auth";
import { sessionStamp } from "@amax/auth/authjs";
import { auth } from "../auth";
import { authEnabled, getDb } from "./server";

// The signed-in viewer for this request, rebuilt from the session row (roles, scopes, View as).
// null in the guest preview (no database) or when signed out.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!authEnabled()) return null;
  const stamp = sessionStamp(await auth());
  if (!stamp?.tenantId || !stamp.sessionId) return null;
  return loadViewer(getDb()!, stamp.tenantId, stamp.sessionId);
});

setViewerResolver(getViewer);
