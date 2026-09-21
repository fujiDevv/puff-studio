import { renderSvg } from "./render";
import { EXPORT_TARGETS, fitFor, type ExportTarget } from "./targets";
import type { Direction, RenderOptions } from "./types";

/** Browser-only helpers for previewing, rasterizing, and downloading icons. */

export function svgBlobUrl(direction: Direction, options?: RenderOptions) {
  const svg = renderSvg(direction, options);
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * The vector master, and the one file that carries your corners.
 *
 * It is a *design* master rather than a submission: it goes to a designer, a
 * website, or a build pipeline, so it renders the plate as you designed it. The
 * four PNG targets are the opposite case — a platform masks what it is given,
 * and iOS rejects a rounded 1024 master that carries an alpha channel at all —
 * so those stay square on purpose. The export panel says so beside the radius.
 */
export function downloadSvg(direction: Direction, filename: string) {
  downloadText(filename, svgMaster(direction), "image/svg+xml");
}

/**
 * The vector master as a string, so the download and the clipboard share one
 * definition of it.
 *
 * They used to spell the render out separately — the same two options written
 * twice — which meant the copied file and the downloaded one could drift apart
 * without either looking wrong on its own. Whoever pastes the SVG and whoever
 * opens the file are asking for the same artefact, so they get the same call.
 */
export function svgMaster(direction: Direction): string {
  return renderSvg(direction, { corners: "rounded", radius: direction.radius });
}

/**
 * Rasterize a direction to a PNG blob at `size`, straight from the SVG string.
 * The SVG is self-contained (no external fonts or images) so the browser can
 * draw it into a canvas without a CORS taint.
 */
export function rasterize(
  direction: Direction,
  size: number,
  options: Omit<RenderOptions, "size"> = {},
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svg = renderSvg(direction, { ...options, size });
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/png",
      );
    };
    img.onerror = () => reject(new Error("Could not rasterize icon"));
    img.src = url;
  });
}

export async function downloadPng(
  direction: Direction,
  filename: string,
  size = 1024,
) {
  const blob = await rasterize(direction, size);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** One target's raster, with its mask, layers, and safe-area fit applied. */
export function rasterizeTarget(
  target: ExportTarget,
  direction: Direction,
): Promise<Blob> {
  return rasterize(direction, target.size, {
    // Explicitly square: every target is a platform file, and each platform
    // applies its own corners. See `EXPORT_TARGETS`.
    corners: "square",
    layers: target.layers,
    // The fit has to see the artwork's *size and position*, not just the finish:
    // a logo that has been moved toward a corner, or enlarged to near the canvas
    // edge, reaches farther from the centre and needs a smaller export scale to
    // stay inside the platform's mask. Passing only the finish was a real bug —
    // the preview fitted a moved logo and the downloaded PNG did not.
    fit: fitFor(
      target,
      direction.finish,
      direction.artwork?.offset,
      direction.artwork?.scale,
    ),
  });
}

/** What each file in the set is called. */
export function targetFilename(target: ExportTarget, slug: string) {
  return `${slug}-${target.id}-${target.size}.png`;
}

/**
 * The full platform set for one direction: an opaque square master for iOS, one
 * for Play, the two Android adaptive layers, and the vector master.
 *
 * Downloads are issued one after another rather than zipped — no archive
 * dependency, and the names carry the platform and size so a folder full of them
 * is still self-describing.
 */
export async function downloadExportSet(
  direction: Direction,
  slug: string,
): Promise<string[]> {
  const written: string[] = [];
  for (const target of EXPORT_TARGETS) {
    const blob = await rasterizeTarget(target, direction);
    const filename = targetFilename(target, slug);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    written.push(filename);
  }

  const svgName = `${slug}-icon.svg`;
  downloadSvg(direction, svgName);
  written.push(svgName);
  return written;
}

export function slugify(input: string, fallback = "puff-icon") {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || fallback;
}
