/**
 * Geometry for the plate renderer. Everything lives in the 1024×1024 master
 * space, and paths are emitted as SVG `d` strings so the same output feeds both
 * the DOM preview and the export file.
 *
 * What is deliberately absent: the superellipse, and every mark shape. The plate
 * is a rounded rectangle — the reference frame's own corner is a plain circular
 * arc (`docs/Frame.svg` approximates its quarter circle with the standard
 * 0.5523·r cubic controls), and the marks that used petals, capsules and arc
 * bands are gone with the shape families.
 */

const CANVAS = 1024;

/**
 * The canvas as a hard square. Used for a full-bleed export: the platforms mask
 * a square master themselves, and a pre-rounded one gets masked twice (and, for
 * iOS, rejected for carrying an alpha channel at all).
 */
export function squarePath(size = CANVAS): string {
  return `M 0 0 H ${size} V ${size} H 0 Z`;
}

/** Trims the float noise that makes a `d` string unreadable. */
const n = (value: number) => Number(value.toFixed(3));

/**
 * A rounded rectangle with **circular** corners, as four arcs.
 *
 * Circular rather than continuous-curve, and that is the point of the change: the
 * reference plate's corner is an exact quarter circle at radius 218.182 on a 1024
 * plate, so this reproduces it unit for unit. A superellipse would be a different
 * shape wearing the same number.
 */
export function roundRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) {
    return `M ${n(x)} ${n(y)} H ${n(x + w)} V ${n(y + h)} H ${n(x)} Z`;
  }
  const arc = `A ${n(rr)} ${n(rr)} 0 0 1`;
  return [
    `M ${n(x + rr)} ${n(y)}`,
    `H ${n(x + w - rr)}`,
    `${arc} ${n(x + w)} ${n(y + rr)}`,
    `V ${n(y + h - rr)}`,
    `${arc} ${n(x + w - rr)} ${n(y + h)}`,
    `H ${n(x + rr)}`,
    `${arc} ${n(x)} ${n(y + h - rr)}`,
    `V ${n(y + rr)}`,
    `${arc} ${n(x + rr)} ${n(y)}`,
    "Z",
  ].join(" ");
}

/**
 * A band of `width`, centred on the boundary of a rounded rectangle.
 *
 * This is the rim's shape, and it exists because the reference's rim is a 7-wide
 * *stroke* on the plate edge: half of it falls outside the viewBox, so what shows
 * is a crisp 3.5-unit light running the whole way round and following the radius
 * into every corner. Returned as one path with two subpaths, meant to be filled
 * with `evenodd` — the inner rectangle cuts the hole — because a stroke cannot be
 * used as a clip, and the rim is painted by clipping its gradient to this band.
 *
 * Offsetting a rounded rectangle outward by `half` gives another rounded
 * rectangle whose radius is `r + half` — the corner centre stays put and the arc
 * grows — **except** at `r === 0`, where the corner is sharp and stays sharp: an
 * outward offset does not invent a curve. Applying `r + half` there would round
 * the corners of a square plate's band by 3.5 units, which is small but wrong,
 * and it is the case every export target takes (`corners: "square"`).
 */
export function rimBandPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  width: number,
): string {
  const half = width / 2;
  const outerRadius = r === 0 ? 0 : r + half;
  const outer = roundRectPath(x - half, y - half, w + width, h + width, outerRadius);
  const inner = roundRectPath(x + half, y + half, w - width, h - width, Math.max(0, r - half));
  return `${outer} ${inner}`;
}

/** The renderer's canvas size, exported so callers never hardcode 1024. */
export const CANVAS_SIZE = CANVAS;
