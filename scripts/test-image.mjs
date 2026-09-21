import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

/**
 * A real PNG, generated rather than vendored.
 *
 * The custom-mark checks need an image that actually decodes: `check-targets`
 * measures the ink a mark paints, so a data URL that failed to rasterize would
 * read as "painted nothing" rather than as a broken fixture, and the browser
 * check has to hand a genuine file to a real file input. A byte array built here
 * keeps the size, the colour, and the aspect ratio under the caller's control —
 * and a square one is the worst case for the circular safe area, which is
 * exactly the case worth testing.
 *
 * Written by hand because a PNG is four parts: a signature, IHDR, the deflated
 * scanlines (each prefixed with a filter byte), and IEND, every chunk wrapped in
 * a CRC32. That is less code than a dependency for a fixture.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An opaque RGBA PNG. Colour defaults to a strong red, which no palette uses. */
export function makePng({ width = 64, height = 64, rgb = [239, 68, 68] } = {}) {
  const [r, g, b] = rgb;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function pngDataUrl(options) {
  return `data:image/png;base64,${makePng(options).toString("base64")}`;
}

/** Writes one to a temp file and returns its path, for a real file input. */
export async function pngFile(options) {
  return anyFile({ name: "upload.png", content: makePng(options) });
}

/**
 * Any file, under any name, for the paths where the point is what the app does
 * *before* it reads anything.
 *
 * The browser derives `File.type` from the extension, so a 3MB file named
 * `huge.png` arrives as `image/png` — which is exactly how the size cap gets
 * tested for the property it claims, namely that the file is refused before it
 * is decoded rather than after. Two different failures with two different
 * messages, and only one of them means the cap ran first.
 */
export async function anyFile({ name, content }) {
  const dir = await mkdtemp(join(tmpdir(), "puff-mark-"));
  const path = join(dir, name);
  await writeFile(path, content);
  return { path, dir };
}

/** A minimal but genuine SVG, for the vector pass-through. */
export const SVG_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="#7c3aed"/></svg>`;
