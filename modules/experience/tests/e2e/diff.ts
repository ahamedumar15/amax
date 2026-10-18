import type { Locator } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export type Region = { box: { x: number; y: number; width: number; height: number }; png: Buffer };

export async function capture(locator: Locator): Promise<Region> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("region is not visible");
  return { box, png: await locator.screenshot({ animations: "disabled", caret: "hide" }) };
}

// A region at a fractional offset can rasterise one pixel taller or wider (041); compare the common
// area then. Anything larger is a different size.
function crop(img: PNG, width: number, height: number) {
  if (img.width === width && img.height === height) return img.data;
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) img.data.copy(out, y * width * 4, y * img.width * 4, (y * img.width + width) * 4);
  return out;
}

export function diffRatio(a: Region, b: Region) {
  const left = PNG.sync.read(a.png);
  const right = PNG.sync.read(b.png);
  if (Math.abs(left.width - right.width) > 1 || Math.abs(left.height - right.height) > 1) return 1;
  const [w, h] = [Math.min(left.width, right.width), Math.min(left.height, right.height)];
  const changed = pixelmatch(crop(left, w, h), crop(right, w, h), null, w, h, { threshold: 0.1 });
  return changed / (w * h);
}
