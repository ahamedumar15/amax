import type { ScreenProps } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import { getExpenses } from "../server/view";
import { Categories } from "./Categories";
import { Claims } from "./Claims";
import { Decide } from "./Decide";
import { Tiles } from "./Tiles";
import "./expenses.css";

export async function ExpensesPage({ viewer }: ScreenProps) {
  const v = (viewer as Viewer | null) ?? null;
  if (!v) return <><h1>Expenses</h1><Card><EmptyState icon="cash" title="Sign in to see expenses" hint="Claims come from the database once you're signed in." /></Card></>;
  const e = await getExpenses(v);
  return (
    <div className="expenses">
      <h1>Expenses</h1>
      <p className="lede">{e.lede}</p>
      <Tiles e={e} />
      <div className="stack">
        <Decide rows={e.decide} />
        <Claims rows={e.claims} />
        <Categories rows={e.categories} />
      </div>
    </div>
  );
}
