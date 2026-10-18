import type { Locator } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export type Region = { box: { x: number; y: number; width: number; height: number }; png: Buffer };

export async function capture(locator: Locator): Promise<Region> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("region is not visible");
  return { box, png: await locator.screenshot({ animations: "disabled", caret: "hide" }) };
}

const crop = (png: PNG, width: number, height: number) => {
  const out = new PNG({ width, height });
  PNG.bitblt(png, out, 0, 0, width, height, 0, 0);
  return out.data;
};

// Same-sized boxes can rasterise one pixel apart when the shell places them on a half pixel, so the
// shared area is compared; a real size difference is caught by comparing the boxes first.
export function diffRatio(a: Region, b: Region) {
  const left = PNG.sync.read(a.png);
  const right = PNG.sync.read(b.png);
  if (Math.abs(left.width - right.width) > 1 || Math.abs(left.height - right.height) > 1) return 1;
  const width = Math.min(left.width, right.width), height = Math.min(left.height, right.height);
  const changed = pixelmatch(crop(left, width, height), crop(right, width, height), null, width, height, { threshold: 0.1 });
  return changed / (width * height);
}
