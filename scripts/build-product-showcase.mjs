/**
 * README hero: dark lockup, windows tilted and faded into a blurred backdrop.
 * Source shots are the dark-mode window captures in docs/screenshots/.
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

const canvasW = 1600;
const canvasH = 640;

function svg(width, height, body) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
  );
}

async function contentCrop(filename) {
  const absolute = path.join(shotsDir, filename);
  const { data, info } = await sharp(absolute).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const bg = at(Math.floor(width * 0.62), height - 20);
  const far = (x, y) => {
    const [r, g, b] = at(x, y);
    return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 26;
  };
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    let hits = 0;
    for (let x = 0; x < width; x += 3) {
      if (far(x, y)) hits += 1;
    }
    if (hits > 6) maxY = y;
  }
  const bottom = Math.min(height, maxY + 18);
  return { left: 0, top: 0, width, height: Math.max(bottom, 220) };
}

async function windowCard(filename, { width, fade, opacity = 1, radius = 18, rotate = 0, cropHeight }) {
  const detected = await contentCrop(filename);
  const extract = cropHeight ? { ...detected, height: Math.min(detected.height, cropHeight) } : detected;
  const resized = await sharp(path.join(shotsDir, filename)).extract(extract).resize({ width }).png().toBuffer();
  const meta = await sharp(resized).metadata();
  const rounded = svg(
    meta.width,
    meta.height,
    `<rect width="${meta.width}" height="${meta.height}" rx="${radius}" ry="${radius}" fill="#fff"/>`,
  );
  const edge =
    fade === "left"
        ? `<linearGradient id="f" x1="0" y1="0" x2="1" y2="0">
           <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
           <stop offset="14%" stop-color="#fff" stop-opacity="${opacity}"/>
           <stop offset="100%" stop-color="#fff" stop-opacity="${opacity}"/>
         </linearGradient>`
      : `<linearGradient id="f" x1="1" y1="0" x2="0" y2="0">
           <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
           <stop offset="18%" stop-color="#fff" stop-opacity="${opacity}"/>
           <stop offset="100%" stop-color="#fff" stop-opacity="${opacity}"/>
         </linearGradient>`;
  const mask = svg(
    meta.width,
    meta.height,
    `<defs>${edge}</defs><rect width="100%" height="100%" fill="url(#f)"/>`,
  );
  const faded = await sharp(resized)
    .ensureAlpha()
    .composite([
      { input: rounded, blend: "dest-in" },
      { input: mask, blend: "dest-in" },
    ])
    .png()
    .toBuffer();
  const turned = await sharp(faded).rotate(rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const turnedMeta = await sharp(turned).metadata();
  return { image: turned, width: turnedMeta.width, height: turnedMeta.height };
}

async function backdrop() {
  const shot = await sharp(path.join(shotsDir, "diagnostics.png"))
    .resize(canvasW + 160, canvasH + 160, { fit: "cover" })
    .blur(26)
    .modulate({ brightness: 0.45, saturation: 0.7 })
    .extract({ left: 80, top: 80, width: canvasW, height: canvasH })
    .png()
    .toBuffer();
  const veil = svg(
    canvasW,
    canvasH,
    `<defs>
       <radialGradient id="v" cx="50%" cy="48%" r="62%">
         <stop offset="0%" stop-color="#0c0e14" stop-opacity="0.2"/>
         <stop offset="58%" stop-color="#0c0e14" stop-opacity="0.72"/>
         <stop offset="100%" stop-color="#0c0e14" stop-opacity="0.94"/>
       </radialGradient>
     </defs>
     <rect width="100%" height="100%" fill="#0c0e14"/>
     <rect width="100%" height="100%" fill="url(#v)"/>`,
  );
  return sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 12, g: 14, b: 20, alpha: 1 } },
  })
    .composite([
      { input: shot, left: 0, top: 0 },
      { input: veil, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

const iconSize = 136;

async function appIcon() {
  const resized = await sharp(iconFile).resize(iconSize, iconSize).png().toBuffer();
  const mask = svg(iconSize, iconSize, `<rect width="${iconSize}" height="${iconSize}" rx="32" ry="32" fill="#fff"/>`);
  return sharp(resized).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

const [left, lowerLeft, back, front, icon, background] = await Promise.all([
  windowCard("processes.png", { width: 500, fade: "left", opacity: 0.96, rotate: -6 }),
  windowCard("cleanup.png", { width: 460, fade: "left", opacity: 0.9, rotate: 5, cropHeight: 430 }),
  windowCard("product-hero.png", { width: 500, fade: "right", opacity: 0.78, rotate: 5 }),
  windowCard("diagnostics.png", { width: 540, fade: "right", opacity: 0.98, rotate: -3 }),
  appIcon(),
  backdrop(),
]);

const lockup = svg(
  canvasW,
  canvasH,
  `<text x="800" y="348" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif" font-size="80" font-weight="650" fill="#f4f6fb">Dev Doctor</text>
   <text x="800" y="404" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif" font-size="26" fill="#c5cad6">Diagnose projects, reclaim disk, find the port</text>
   <rect x="718" y="432" width="164" height="2" rx="1" fill="#6aa7ff"/>
   <text x="800" y="474" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif" font-size="20" fill="#9aa3b5">for macOS</text>`,
);

await sharp(background)
  .composite([
    { input: left.image, left: -20, top: 12 },
    { input: lowerLeft.image, left: -36, top: canvasH - lowerLeft.height + 28 },
    { input: back.image, left: 1210, top: 8 },
    { input: front.image, left: 1148, top: 210 },
    { input: icon, left: Math.round((canvasW - iconSize) / 2), top: 64 },
    { input: lockup, left: 0, top: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(outFile);

console.log(`Wrote ${outFile} (${canvasW}×${canvasH})`);
