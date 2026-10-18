import { notFound } from "next/navigation";
import { can } from "@amax/auth";
import { EmptyState } from "@amax/ui";
import { operationOf } from "../../../../lib/operations";
import { getViewer } from "../../../../lib/viewer";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ screen: string }> }) {
  return { title: operationOf((await params).screen)?.title ?? "Operations" };
}

// 055: an Operations screen that isn't built yet names the change that ships it. Admin and IT Admin only.
export default async function ComingSoon({ params }: { params: Promise<{ screen: string }> }) {
  const viewer = await getViewer();
  const op = operationOf((await params).screen);
  if (!viewer || !op || !can(viewer, "operations:read")) notFound();
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><span>Operations</span><span>/</span>{op.title}</nav>
      <h1>{op.title}</h1>
      <p className="lede">Coming soon. {op.title} arrives with change {op.change}, {op.changeTitle}.</p>
      <div className="card" style={{ marginTop: 20, maxWidth: 520 }}>
        <EmptyState icon={op.icon} title="Coming soon" hint={`Change ${op.change}: ${op.changeTitle}.`} />
      </div>
    </>
  );
}
