/**
 * README hero: full screenshots, upright, uniform scale only.
 * Diagnostics is largest and on top. Overview and Cleanup sit behind, smaller.
 * Run: npm run screenshots:showcase
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const shotsDir = path.join(root, "docs/screenshots");
const iconFile = path.join(root, "src-tauri/icons/128x128.png");
const outFile = path.join(shotsDir, "product-showcase.png");

const canvasW = 1400;
const headerH = 84;

async function fullShot(filename, width) {
  const source = path.join(shotsDir, filename);
  const resized = await sharp(source).resize({ width }).png().toBuffer();
  const meta = await sharp(resized).metadata();
  const radius = 12;
  const mask = Buffer.from(
    `<svg width="${meta.width}" height="${meta.height}"><rect width="${meta.width}" height="${meta.height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  const image = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return { image, width: meta.width, height: meta.height };
}

function brandLockup() {
  return Buffer.from(`<svg width="${canvasW}" height="${headerH}" xmlns="http://www.w3.org/2000/svg">
    <text x="${canvasW / 2 + 28}" y="38" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="32" font-weight="650" fill="#111">Dev Doctor</text>
    <text x="${canvasW / 2 + 28}" y="64" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="15" fill="#5c6370">Local diagnostics for Node.js projects on your Mac</text>
  </svg>`);
}

const logo = await sharp(iconFile).resize(48, 48).png().toBuffer();
const backW = 560;
const frontW = 820;
const left = await fullShot("product-hero.png", backW);
const right = await fullShot("cleanup.png", backW);
const front = await fullShot("diagnostics.png", frontW);

const frontTop = headerH + 4;
const canvasH = frontTop + front.height + 20;
const backTop = frontTop + Math.round((front.height - left.height) / 2);
const frontLeft = Math.round((canvasW - front.width) / 2);

await sharp({
  create: {
    width: canvasW,
    height: canvasH,
    channels: 4,
    background: { r: 244, g: 245, b: 247, alpha: 1 },
  },
})
  .composite([
    { input: brandLockup(), left: 0, top: 6 },
    { input: logo, left: Math.round(canvasW / 2 - 112), top: 16 },
    { input: left.image, left: 16, top: backTop },
    { input: right.image, left: canvasW - right.width - 16, top: backTop },
    { input: front.image, left: frontLeft, top: Math.max(headerH + 8, frontTop) },
  ])
  .png({ compressionLevel: 9 })
  .toFile(outFile);

console.log(`Wrote ${outFile} (${canvasW}×${canvasH})`);
