import { CANVAS_SIZE } from "./geometry";
import type { Finish, MarkOffset } from "./types";

/**
 * Export targets, and the safe-area maths that keeps artwork inside them.
 *
 * Why this exists: a 1024 master with rounded corners and a transparent edge is
 * the one thing Apple rejects outright, and each platform then masks the square
 * to a different shape — so the artwork has to fit a *different* safe area per
 * target or it gets cropped.
 *
 * Every target here renders a **square** plate. That is not an oversight and it
 * is not the same choice as the design radius: iOS and Play mask the master
 * themselves and reject a pre-rounded one that carries alpha, and an Android
 * adaptive layer is masked by the launcher, whose shape is not knowable at build
 * time. The radius you set in the studio shapes the preview and the SVG master,
 * which is where a design belongs; the platform files stay square on purpose.
 */
/**
 * Half-extent of the centred square a custom image is drawn into, as a canvas
 * fraction. The image is fitted inside this box (`preserveAspectRatio="meet"`),
 * so it always touches one axis and never overflows either.
 *
 * 0.30 — a 60%-of-canvas box — is a compromise. Larger reads better on iOS,
 * whose safe area is the most generous of the four, and worse on Android, where
 * the 66/108 circle is the tightest mask and the fit shrinks the artwork anyway.
 * It is a fixed number rather than one derived from the upload because the
 * extent tables have to be knowable without decoding the image.
 */
export const MARK_BOX = 0.3;

/**
 * The same measurement as a radius from the canvas centre.
 *
 * Not a measurement but an upper bound: the artwork is drawn `meet` inside a
 * square box, so its reach is the box's corner when the image is square and less
 * when it is not. Bounding it by the corner is what keeps this value valid for
 * every aspect ratio anyone could upload.
 */
export const MARK_CIRCLE = MARK_BOX * Math.SQRT2;

/**
 * How far the mark's box may travel from the canvas centre, as a canvas fraction,
 * **at its default size**.
 *
 * The box is 60% of the canvas, so its centre has 20% of canvas to move in each
 * direction before an edge of the box leaves the canvas. Stopping there is what
 * keeps dragging a positioning tool rather than a way to lose half a logo off an
 * edge: the artwork you place is always artwork the export contains.
 *
 * Scaling the artwork grows the box, so the room to move shrinks — that is
 * `markTravel`, and this constant is only its scale-1 case.
 */
export const MARK_TRAVEL = 1 / 2 - MARK_BOX;

/** The same limit in canvas units, for the studio's readouts and arrow nudges. */
export const MAX_OFFSET_UNITS = MARK_TRAVEL * CANVAS_SIZE;

/**
 * How far the artwork can be resized, as a multiple of the default box.
 *
 * `MAX_MARK_SCALE` is where a *square* image fills the canvas exactly: the box
 * half-extent is `MARK_BOX × scale`, so `0.5 / MARK_BOX` is the scale at which
 * the box reaches the canvas edge and `meet` stops leaving any margin. Allowing
 * more would mean a logo whose edges are outside the file, which is the one thing
 * this studio refuses to do — so the limit is a statement about the export, not
 * an arbitrary slider end.
 *
 * `MIN_MARK_SCALE` is the other end: a logo small enough to read as a dot. 0.1 is
 * 6% of the canvas, a sixth of the default, which is as small as an icon logo can
 * be drawn and still be judged as a shape.
 */
export const MIN_MARK_SCALE = 0.1;
export const MAX_MARK_SCALE = 0.5 / MARK_BOX;

/**
 * The artwork's scale, clamped to the range above.
 *
 * Applied at both ends for the same reason `clampOffset` is: the value can arrive
 * from `localStorage`, which is editable by anyone, and a scale of `1e6` would
 * put a logo through every platform's mask and off the canvas.
 */
export function clampScale(scale?: number): number {
  if (typeof scale !== "number" || !Number.isFinite(scale)) return 1;
  return Math.max(MIN_MARK_SCALE, Math.min(MAX_MARK_SCALE, scale));
}

/**
 * Half-extent of the artwork's box at a given scale, as a canvas fraction.
 *
 * This is the single number the rest of the file is built on: grow the box and
 * every derived quantity — the reach from the centre, the room to move, the fit
 * that survives a mask — follows from it rather than being recomputed by hand.
 */
export function markHalf(scale = 1): number {
  return MARK_BOX * clampScale(scale);
}

/**
 * How far the mark's box may travel from the centre at a given scale.
 *
 * Shrinks as the artwork grows, and is exactly zero at `MAX_MARK_SCALE`: a mark
 * that fills the canvas has nowhere to go, so it is pinned to the middle rather
 * than allowed to hang off an edge. `Math.max(0, …)` is belt and braces — the
 * clamp above already guarantees it cannot go negative.
 */
export function markTravel(scale = 1): number {
  return Math.max(0, 1 / 2 - markHalf(scale));
}

/** The travel limit in canvas units, for readouts and nudge limits. */
export function maxOffsetUnits(scale = 1): number {
  return markTravel(scale) * CANVAS_SIZE;
}

/**
 * How far the contact shadow reaches past the mark that casts it. Applied only
 * when a shadow is painted at all, which is why it is a separate term: a flat
 * plate should not be scaled down to make room for a shadow it does not have.
 */
export const SHADOW_SPREAD = 0.052;

export type LayerSet = "full" | "foreground" | "background";

export interface ExportTarget {
  id: "ios" | "play" | "android-fg" | "android-bg";
  label: string;
  /** What this file is for, in one line, for the UI. */
  note: string;
  /** Raster size in px. Android's 108dp canvas at xxxhdpi is 432. */
  size: number;
  layers: LayerSet;
  /** Safe area as a half-extent of the canvas, for square masks. */
  safeBox?: number;
  /** Safe area as a radius of the canvas, for circular masks. */
  safeCircle?: number;
}

/** 820 of 1024, i.e. Apple's safe area inside its own squircle mask. */
const IOS_SAFE_BOX = 820 / 1024 / 2;
/** 66 of 108, i.e. the visible circle an adaptive icon is guaranteed. */
const ANDROID_SAFE_CIRCLE = 66 / 108 / 2;

export const EXPORT_TARGETS: ExportTarget[] = [
  {
    id: "ios",
    label: "iOS 1024",
    note: "Opaque square. Xcode and the App Store render every device size from it, and iOS applies its own corners.",
    size: 1024,
    layers: "full",
    safeBox: IOS_SAFE_BOX,
  },
  {
    id: "play",
    label: "Google Play 512",
    note: "Opaque square. Play crops it into a rounded container, so the artwork keeps the same 80% margin.",
    size: 512,
    layers: "full",
    safeBox: IOS_SAFE_BOX,
  },
  {
    id: "android-fg",
    label: "Android foreground",
    note: "Transparent artwork layer for an adaptive icon: 108dp canvas, artwork inside the central 66dp circle.",
    size: 432,
    layers: "foreground",
    safeCircle: ANDROID_SAFE_CIRCLE,
  },
  {
    id: "android-bg",
    label: "Android background",
    note: "Opaque full-bleed field layer for the same adaptive icon. No rim: the launcher's mask is unpredictable.",
    size: 432,
    layers: "background",
  },
];

export function targetById(id: ExportTarget["id"]): ExportTarget {
  const target = EXPORT_TARGETS.find((t) => t.id === id);
  if (!target) throw new Error(`Unknown export target: ${id}`);
  return target;
}

/**
 * The mark's offset, clamped to the travel the canvas allows.
 *
 * Applied at both ends — the studio writes a clamped value and the renderer
 * clamps again — because the offset can also arrive from `localStorage`, which is
 * editable by anyone.
 */
export function clampOffset(offset: MarkOffset | undefined, scale = 1): MarkOffset {
  const limit = maxOffsetUnits(scale);
  // `+ 0` normalises negative zero, which `Math.max(-0, -n)` returns once the
  // limit itself is 0 — the fill scale. It is not cosmetic: the renderer formats
  // this straight into the SVG's `x`/`y`, and "-0.0" is a coordinate nobody meant
  // to write.
  const clamp = (value: number) =>
    Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) + 0 : 0;
  return { x: clamp(offset?.x ?? 0), y: clamp(offset?.y ?? 0) };
}

/**
 * How far the artwork reaches from the canvas centre before any fit scaling.
 *
 * An offset mark is no longer centred, so the reach is measured from the canvas
 * centre to the mark's **farthest corner** — which is what the safe-area maths
 * needs, since a mask crops whatever is farthest out. Dragging a logo toward a
 * corner therefore shrinks the fitted export, and that is the honest answer: it is
 * the only way the same logo can both sit off-centre and survive Android's
 * 66/108 circle.
 */
export function artworkExtent(
  shape: "box" | "circle",
  offset?: MarkOffset,
  scale = 1,
): number {
  const half = markHalf(scale);
  const { x, y } = clampOffset(offset, scale);
  // Exactly the derived values when centred, rather than a value that agrees
  // with them to within a rounding error.
  if (x === 0 && y === 0)
    return shape === "box" ? half : half * Math.SQRT2;
  const ox = Math.abs(x) / CANVAS_SIZE;
  const oy = Math.abs(y) / CANVAS_SIZE;
  return shape === "box"
    ? Math.max(ox, oy) + half
    : Math.hypot(ox + half, oy + half);
}

/**
 * The scale to render the artwork at so it survives a target's mask. Capped at 1:
 * this shrinks artwork that would be cropped and leaves artwork that already fits
 * exactly as it was authored.
 *
 * The shadow is subtracted from the budget *before* the division, because it is
 * the one term the fit does not shrink. It is a blurred copy of the artwork, so
 * scaling the artwork down scales the silhouette it is copied from — but the blur
 * radius, its offset, and its filter region are all in canvas units, untouched by
 * the inner transform. Treating it as scalable was an earlier version of this
 * function, and `pnpm check:targets` caught it: the mark overflowed Android's
 * circle by exactly the shadow's spread.
 */
export function fitFor(
  target: ExportTarget,
  finish: Finish,
  offset?: MarkOffset,
  scale = 1,
): number {
  const limit = target.safeBox ?? target.safeCircle;
  if (limit === undefined) return 1;

  const shadow = finish.shadow > 0 ? SHADOW_SPREAD : 0;
  const extent = artworkExtent(target.safeBox ? "box" : "circle", offset, scale);
  return Math.min(1, (limit - shadow) / extent);
}

/** The safe-area guide the studio draws over a preview, as viewport fractions. */
export function guideBox(target: ExportTarget): string | null {
  if (!target.safeBox) return null;
  const inset = ((1 - target.safeBox * 2) / 2) * 100;
  return `${inset}%`;
}

export function guideCircle(target: ExportTarget): string | null {
  if (!target.safeCircle) return null;
  return `${target.safeCircle * 2 * 100}%`;
}

/** The plate's own measurements, for callers that need them without a target. */
export const PLATE_BOX = { size: CANVAS_SIZE, half: MARK_BOX } as const;
