import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import { connect, launchChrome } from "./cdp.mjs";

/**
 * Every brand asset in `public/`, rendered from the app's own engine.
 *
 * Run: `pnpm assets`
 *
 * ## Why this exists
 *
 * Seven files describe one plate: a favicon (three sizes), an SVG icon, two
 * manifest icons, a maskable icon, a touch icon and a social card. Drawn by hand,
 * they drift — the second-best-known failure mode in this repo, after "the check
 * passed against an empty document". The favicon is the one people never look at
 * again, so it is the one that ends up a different blue.
 *
 * So the plate comes from `lib/brand.ts` through `renderSvg` — the same direction
 * the landing header draws and the same renderer a user's export goes through.
 * Regenerating after an engine change is one command, and the icons *cannot* be
 * stale with respect to the code.
 *
 * ## Why Chrome, and why in this repo
 *
 * The rasterizer is the headless Chrome the target checks already use (`cdp.mjs`),
 * reached over the DevTools protocol. No new dependency, no `sharp`, no
 * `resvg-wasm`: this project already treats "measure the real pixels" as the only
 * measurement worth trusting, and the device-scale-factor is pinned to 1 so
 * `width: 512px` in the page *is* 512 pixels of PNG.
 *
 * The three claims worth checking — that a rounded icon really is transparent
 * outside its curve, that a square one really is opaque, and that the file's
 * header agrees with its declared size — are checked here by decoding each PNG
 * back through a canvas and reading pixels, rather than by trusting the render
 * that produced it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "public");

/** Chrome renders at this factor, so CSS pixels and file pixels are 1:1. */
const SCALE = 1;

const FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const results = [];
let failed = false;

function record(file, ok, detail) {
  results.push({ file, ok, detail });
  if (!ok) failed = true;
}

/* ------------------------------------------------------------ the engine */

const vite = await createServer({
  configFile: false,
  logLevel: "silent",
  server: { middlewareMode: true },
  appType: "custom",
});

const { BRAND, BRAND_UID } = await vite.ssrLoadModule("/lib/brand.ts");
const { renderSvg } = await vite.ssrLoadModule("/lib/engine/render.ts");
const { CANVAS_SIZE } = await vite.ssrLoadModule("/lib/engine/geometry.ts");
const { SITE } = await vite.ssrLoadModule("/lib/site.ts");

/**
 * The two documents everything here is cut from.
 *
 * `rounded` is the drawn mark — transparent outside a 218.18 arc. `square` is the
 * platform master, opaque into all four corners, for the two consumers that
 * demand it: iOS rejects a touch icon that carries an alpha channel, and an
 * Android launcher crops a maskable icon to its own shape, so pre-rounded corners
 * would show through as holes.
 */
const ROUNDED = renderSvg(BRAND, {
  uid: BRAND_UID,
  corners: "rounded",
  size: CANVAS_SIZE,
});
const SQUARE = renderSvg(BRAND, {
  uid: BRAND_UID,
  corners: "square",
  size: CANVAS_SIZE,
});

const svgHref = (svg) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/* ------------------------------------------------------------- the browser */

const chrome = await launchChrome({ port: 9335 });
const page = await connect(chrome.port);
await page.send("Page.enable");

async function render(html, { width, height, transparent }) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: SCALE,
    mobile: false,
  });
  // Without this the capture composites onto white, so a rounded icon would come
  // out with opaque white corners — a plausible-looking PNG that breaks on any
  // non-white background. Clearing it is what makes alpha mean alpha.
  await page.send("Emulation.setDefaultBackgroundColorOverride", {
    color: transparent
      ? { r: 0, g: 0, b: 0, a: 0 }
      : { r: 15, g: 15, b: 19, a: 255 },
  });

  await page.evaluate(
    `(() => { document.open(); document.write(${JSON.stringify(html)}); document.close(); return true; })()`,
  );
  // Decode, then two frames: one for the paint, one to be sure it landed. The
  // grain is an feTurbulence filter, so the SVG is not free to rasterize.
  await page.evaluate(`(async () => {
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 80))));
    return true;
  })()`);

  const { data } = await page.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  return Buffer.from(data, "base64");
}

/**
 * Decodes a PNG back through a canvas and reports the few pixels that decide
 * whether the file is what it claims to be.
 *
 * The alpha samples are taken at (1,1) rather than (0,0) because a rounded
 * corner's antialiasing can touch the very first pixel; the rim sample is the top
 * edge's midpoint, which proves the plate actually reached the edge rather than
 * the image being blank.
 */
async function inspectPng(bytes) {
  const href = `data:image/png;base64,${bytes.toString("base64")}`;
  return await page.evaluate(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(href)};
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const at = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      corner: at(1, 1),
      farCorner: at(canvas.width - 2, canvas.height - 2),
      edge: at(Math.floor(canvas.width / 2), 1),
      centre: at(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)),
    };
  })()`);
}

function pngHeaderSize(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const ICON_HTML = (href, size) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style>
</head><body><img src="${href}"></body></html>`;

/**
 * One square icon: rendered, size-checked, and alpha-checked against what its
 * corner treatment promises.
 */
async function icon({ name, size, svg, opaque }) {
  const bytes = await render(ICON_HTML(svgHref(svg), size), {
    width: size,
    height: size,
    transparent: !opaque,
  });
  await writeFile(join(OUT, name), bytes);

  const declared = pngHeaderSize(bytes);
  const seen = await inspectPng(bytes);
  const corner = seen.corner[3];
  const transparent = corner === 0;
  const ok =
    declared.width === size &&
    declared.height === size &&
    seen.width === size &&
    seen.centre[3] === 255 &&
    seen.edge[3] === 255 &&
    (opaque ? corner === 255 : transparent);

  record(
    name,
    ok,
    `${size}x${size} · corner alpha ${corner} (${opaque ? "opaque" : "transparent"}) · ${bytes.length} B`,
  );
  return { bytes, seen };
}

/* --------------------------------------------------------------- the card */

/**
 * The social card, composed as a page rather than as image manipulation.
 *
 * Text is text: laying it out in the browser gets real font shaping, real
 * line-breaking and real hinting for free, and the alternative — no text, or text
 * drawn as SVG paths — is either a worse card or a font-licensing problem.
 *
 * The plate sits on a soft brand glow because the mark is a *plate with nothing
 * on it*: at card size, on a flat field, it would read as a blue square and
 * nothing else. The glow is what says it is a plate.
 */
function cardHtml() {
  const host = SITE.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: ${SITE.backgroundColor}; }
  body {
    width: 1200px; height: 630px; box-sizing: border-box; overflow: hidden;
    display: flex; align-items: center; padding: 84px;
    font-family: ${FONT};
    background-image: radial-gradient(760px 520px at 12% 18%, rgba(43, 99, 246, 0.28), transparent 70%),
                      radial-gradient(680px 520px at 96% 96%, rgba(53, 56, 86, 0.55), transparent 72%);
  }
  .mark { position: relative; flex: 0 0 292px; }
  .mark .glow {
    position: absolute; inset: -74px; border-radius: 50%;
    background: radial-gradient(circle, rgba(43, 99, 246, 0.45), rgba(43, 99, 246, 0) 68%);
  }
  .mark img { position: relative; display: block; width: 292px; height: 292px; }
  .copy { flex: 1; padding-left: 76px; }
  .eyebrow {
    margin: 0 0 22px; font-size: 19px; font-weight: 600; letter-spacing: 0.2em;
    text-transform: uppercase; color: #8A8FB0;
  }
  h1 {
    margin: 0; font-size: 60px; line-height: 1.07; font-weight: 600;
    letter-spacing: -0.022em; color: #F2F3F8; max-width: 640px;
  }
  .sub { margin: 24px 0 0; font-size: 25px; line-height: 1.4; color: #A0A3BE; max-width: 620px; }
  .host {
    display: inline-block; margin-top: 34px; padding: 11px 20px; border-radius: 999px;
    border: 1px solid rgba(160, 163, 190, 0.28); background: rgba(255, 255, 255, 0.04);
    font-size: 21px; color: #C7CAE2; letter-spacing: 0.01em;
  }
</style></head><body>
  <div class="mark"><div class="glow"></div><img src="${svgHref(ROUNDED)}"></div>
  <div class="copy">
    <p class="eyebrow">Puff Studio</p>
    <h1>App icons, designed &mdash; not generated.</h1>
    <p class="sub">44 looks, your logo placed and resized by the number, and every iOS and Android size exported from the browser.</p>
    <span class="host">${host}</span>
  </div>
</body></html>`;
}

/* ------------------------------------------------------------- the favicon */

/**
 * A multi-size `.ico`.
 *
 * The container is trivial once you have the PNGs — a 6-byte directory header, a
 * 16-byte entry per image, then the payloads back to back — and since Windows
 * Vista an ICO may hold PNGs verbatim, so there is no second encoder here. Written
 * by hand for the same reason `test-image.mjs` writes its PNG by hand: it is less
 * code than a dependency, and it can be parsed back in the assertion below.
 *
 * Three sizes because the three consumers ask for different ones: the browser tab
 * (16), the bookmark bar and taskbar (32), and Windows' medium icons (48).
 */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((entry, i) => {
    const base = i * 16;
    dir[base] = entry.size >= 256 ? 0 : entry.size; // 0 means 256
    dir[base + 1] = entry.size >= 256 ? 0 : entry.size;
    dir[base + 2] = 0; // palette size
    dir[base + 3] = 0; // reserved
    dir.writeUInt16LE(1, base + 4); // colour planes
    dir.writeUInt16LE(32, base + 6); // bits per pixel
    dir.writeUInt32LE(entry.png.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((entry) => entry.png)]);
}

function parseIco(buffer) {
  const count = buffer.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const base = 6 + i * 16;
    entries.push({
      width: buffer[base] === 0 ? 256 : buffer[base],
      height: buffer[base + 1] === 0 ? 256 : buffer[base + 1],
      bytes: buffer.readUInt32LE(base + 8),
      offset: buffer.readUInt32LE(base + 12),
    });
  }
  return entries;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* ------------------------------------------------------------------- run */

await mkdir(OUT, { recursive: true });

// The two scalable sources.
await writeFile(join(OUT, "icon.svg"), ROUNDED);
record(
  "icon.svg",
  ROUNDED.startsWith("<svg") &&
    ROUNDED.includes("xmlns:xlink") &&
    !ROUNDED.includes("<image"),
  `${ROUNDED.length} B · xlink declared · no raster payload`,
);

await icon({ name: "icon-192.png", size: 192, svg: ROUNDED, opaque: false });
await icon({ name: "icon-512.png", size: 512, svg: ROUNDED, opaque: false });
await icon({
  name: "icon-maskable-512.png",
  size: 512,
  svg: SQUARE,
  opaque: true,
});
await icon({ name: "apple-icon.png", size: 180, svg: SQUARE, opaque: true });

const faviconSizes = [16, 32, 48];
const faviconParts = [];
for (const size of faviconSizes) {
  const bytes = await render(ICON_HTML(svgHref(ROUNDED), size), {
    width: size,
    height: size,
    transparent: true,
  });
  faviconParts.push({ size, png: bytes });
}
const ico = buildIco(faviconParts);
await writeFile(join(OUT, "favicon.ico"), ico);

const parsed = parseIco(ico);
const icoOk =
  parsed.length === faviconSizes.length &&
  parsed.every((entry, i) => {
    const payload = ico.subarray(entry.offset, entry.offset + entry.bytes);
    return (
      entry.width === faviconSizes[i] &&
      entry.height === faviconSizes[i] &&
      entry.bytes === faviconParts[i].png.length &&
      payload.subarray(0, 8).equals(PNG_SIGNATURE)
    );
  });
record(
  "favicon.ico",
  icoOk,
  `${parsed.map((entry) => `${entry.width}x${entry.height}`).join(", ")} · ${ico.length} B`,
);

const og = await render(cardHtml(), {
  width: 1200,
  height: 630,
  transparent: false,
});
await writeFile(join(OUT, "og.png"), og);
const ogSeen = await inspectPng(og);
const ogOk =
  ogSeen.width === 1200 &&
  ogSeen.height === 630 &&
  ogSeen.centre[3] === 255 &&
  og.readUInt32BE(16) === 1200;
record("og.png", ogOk, `1200x630 · opaque · ${og.length} B`);

/* ----------------------------------------------------------------- report */

const width = Math.max(...results.map((r) => r.file.length));
for (const r of results) {
  console.log(
    `${r.ok ? "ok  " : "FAIL"} ${r.file.padEnd(width)}  ${r.detail}`,
  );
}

await page.close();
chrome.child.kill();
await vite.close();

if (failed) {
  console.error("\nBrand assets are wrong — see the FAIL lines above.");
  process.exit(1);
}
console.log(`\n${results.length} assets written to public/`);
process.exit(0);
