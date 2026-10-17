import { Card, EmptyState } from "@amax/ui";
import { greeting } from "../contracts";

export function HelloPage() {
  return (
    <>
      <h1>Hello</h1>
      <p className="lede">{greeting()} This sample module shows how a team adds a screen: create a folder with a manifest and it appears here.</p>
      <Card>
        <EmptyState icon="spark" title="Nothing to see yet" hint="Real modules replace this folder. Delete modules/hello and it disappears from the rail." />
      </Card>
    </>
  );
}
