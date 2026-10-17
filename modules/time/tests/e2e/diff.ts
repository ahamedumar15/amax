import type { Locator } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export type Region = { box: { x: number; y: number; width: number; height: number }; png: Buffer };

export async function capture(locator: Locator): Promise<Region> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("region is not visible");
  return { box, png: await locator.screenshot({ animations: "disabled", caret: "hide" }) };
}

export function diffRatio(a: Region, b: Region) {
  const left = PNG.sync.read(a.png);
  const right = PNG.sync.read(b.png);
  if (left.width !== right.width || left.height !== right.height) return 1;
  const changed = pixelmatch(left.data, right.data, null, left.width, left.height, { threshold: 0.1 });
  return changed / (left.width * left.height);
}
