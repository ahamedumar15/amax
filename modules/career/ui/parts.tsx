import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import "./career.css";

export const needViewer = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const SignInFirst = () => (
  <Card><EmptyState icon="user" title="Sign in to see a career" hint="A person's history comes from HR, allocations, learning and delivery once you're signed in." /></Card>
);
