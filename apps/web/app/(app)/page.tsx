import { Card, EmptyState } from "@amax/ui";

export const metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <h1>Delivery overview</h1>
      <p className="lede">Stat cards, the hours chart and Waiting on you arrive with the delivery module.</p>
      <Card>
        <EmptyState icon="home" title="Nothing to show yet" hint="This screen fills in with change 007, delivery projects. Until then, open any installed module from the rail." />
      </Card>
    </>
  );
}
