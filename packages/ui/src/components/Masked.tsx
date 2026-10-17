import type { ReactNode } from "react";

// A classified value. When the viewer may not see it, it renders as •••• (the value never reaches
// the page: @amax/auth masks it on the server and passes masked={true}).
export function Masked({ masked, children }: { masked: boolean; children?: ReactNode }) {
  return masked ? <span className="pay masked" title="Hidden for your role">••••</span> : <span className="pay">{children}</span>;
}
