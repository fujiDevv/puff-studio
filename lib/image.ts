import type { MarkArtwork } from "./engine/types";

/**
 * Turning a picked file into the artwork, entirely in the browser.
 *
 * There is no upload step, and that is a design decision rather than a missing
 * feature: the artwork is embedded in the document as a data URL, so the export
 * is self-contained and it never leaves the machine. Nothing here touches the
 * network, so there is no endpoint to protect and no retention to explain.
 *
 * Three things are worth knowing about the sizes below.
 *
 *  - **Rasters are downscaled to 1024.** A 4096px photo is four times the canvas
 *    in each direction, and base64 costs another third on top — so a large upload
 *    would bloat every exported file forever, including the SVG master, to hold
 *    detail no platform will ever display.
 *  - **Vector is kept as vector.** Re-encoding an SVG to a bitmap would throw
 *    away the one format that stays crisp at every size, so it is passed through.
 *  - **The cap is on the file, not the result.** It is checked before anything is
 *    decoded, so an enormous file is refused instead of being read into memory
 *    first and refused after.
 */

/** Refused above this, before decoding. The App Store's own icon cap is far lower. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Longest edge a raster is kept at. The canvas is 1024, so more is waste. */
export const MAX_RASTER_EDGE = 1024;

export const ACCEPTED_MIME = [
  "image/svg+xml",
  "image/png",
  "image/webp",
  "image/jpeg",
] as const;

export function isAccepted(file: File) {
  return (ACCEPTED_MIME as readonly string[]).includes(file.type);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

/**
 * Decodes a raster so it can be measured and redrawn. A blob URL from a `File`
 * is same-origin, so the canvas it is drawn into stays untainted and
 * `toDataURL` works — which is the same property the embedded mark relies on at
 * export time.
 */
function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    // Revoked as soon as the bitmap is decoded: the pixels are in memory by
    // then, and holding the URL alive leaks the whole file for the session.
    const done = (fn: () => void) => () => {
      URL.revokeObjectURL(url);
      fn();
    };
    const image = new Image();
    image.onload = done(() => resolve(image));
    image.onerror = done(() =>
      reject(new Error("That file could not be decoded as an image.")),
    );
    image.src = url;
  });
}

export async function prepareMark(file: File): Promise<MarkArtwork> {
  if (!isAccepted(file)) {
    throw new Error(
      `${file.type || "That file type"} is not supported. Use SVG, PNG, WebP, or JPEG.`,
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Keep it under ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    );
  }

  if (file.type === "image/svg+xml") {
    // No width or height: vector has no natural size, and the renderer draws it
    // into the same fixed box as everything else.
    return {
      href: await readAsDataUrl(file),
      name: file.name,
      mime: file.type,
      width: 0,
      height: 0,
    };
  }

  const image = await decode(file);
  const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longEdge > MAX_RASTER_EDGE ? MAX_RASTER_EDGE / longEdge : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  // Always redrawn through a canvas, even at 1:1, so one code path decides what
  // gets embedded. Kept as PNG rather than WebP: PNG is what every platform and
  // every future reader of the exported SVG can decode.
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare an image for the canvas.");
  ctx.drawImage(image, 0, 0, width, height);

  return {
    href: canvas.toDataURL("image/png"),
    name: file.name,
    mime: file.type,
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}

/** Human-readable summary for the editor, e.g. `mark.svg · vector` or `logo.png · 2048×2048 → 1024`. */
export function describeMark(mark: MarkArtwork) {
  if (mark.mime === "image/svg+xml" || !mark.width) {
    return `${mark.name} · vector`;
  }
  const longest = Math.max(mark.width, mark.height);
  const scaled =
    longest > MAX_RASTER_EDGE
      ? ` → ${Math.round((mark.width * MAX_RASTER_EDGE) / longest)}×${Math.round((mark.height * MAX_RASTER_EDGE) / longest)}`
      : "";
  return `${mark.name} · ${mark.width}×${mark.height}${scaled}`;
}
