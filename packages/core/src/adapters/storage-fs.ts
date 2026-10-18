import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { Storage } from "./storage";

// 034: a directory as storage, for Node hosts that keep backups on a volume (Podman, a k3s PVC, CI).
// It keeps no earlier versions, so the Backups screen says so.
export function fileStorage(root: string): Storage {
  const base = resolve(root);
  const path = (key: string) => {
    const p = resolve(join(base, key));
    if (!p.startsWith(base + sep)) throw new Error(`storage: ${key} is outside the backup directory`);
    return p;
  };
  return {
    async put(key, body) {
      await mkdir(dirname(path(key)), { recursive: true });
      await writeFile(path(key), body);
    },
    async get(key) {
      return readFile(path(key)).then((b) => new Uint8Array(b), (e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? null : Promise.reject(e)));
    },
    async delete(key) {
      await rm(path(key), { force: true });
    },
    async presign() {
      throw new Error("storage: a backup directory has no links; amax serves exports itself");
    },
    async versioned() {
      return false;
    },
  };
}
