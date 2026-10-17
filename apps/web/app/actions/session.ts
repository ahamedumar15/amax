"use server";

import { revalidatePath } from "next/cache";
import { isRole, setViewAs } from "@amax/auth";
import { signOut } from "../../auth";
import { getDb } from "../../lib/server";
import { getViewer } from "../../lib/viewer";

export async function viewAsAction(role: string | null) {
  const viewer = await getViewer();
  if (!viewer) throw new Error("not signed in");
  if (role !== null && !isRole(role)) throw new Error(`unknown role ${role}`);
  await setViewAs(getDb()!, viewer, role);
  revalidatePath("/", "layout");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}
