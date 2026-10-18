import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { contextFor } from "@amax/core/server";
import { getPerson, type PersonRef, type Reader } from "@amax/hr/contracts";

const DEPTH = 12;

/**
 * AC-6: who may see a career, once hr has let the reader see the person at all: the person, their
 * manager chain, HR and leadership. Admin alone isn't enough. A system job sees every career.
 */
export async function maySee(tx: Tx, reader: Reader, tenantId: string, person: PersonRef): Promise<boolean> {
  const viewer = ("actor" in reader ? reader.viewer : reader) as Viewer | undefined;
  if (!viewer) return true;
  if (person.userId === viewer.userId || viewer.assignments.some((a) => a.role === "HR" || a.role === "Leadership")) return true;
  const chain = contextFor.job(tenantId, "career.manager-chain");
  let next = person.managerPersonId;
  for (let i = 0; next && i < DEPTH; i++) {
    const manager = await getPerson(tx, chain, next);
    if (!manager) return false;
    if (manager.userId === viewer.userId) return true;
    next = manager.managerPersonId;
  }
  return false;
}
