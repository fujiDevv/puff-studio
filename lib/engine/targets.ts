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
 * How far the mark's box may travel from the canvas centre, as a canvas fraction.
 *
 * The box is 60% of the canvas, so its centre has 20% of canvas to move in each
 * direction before an edge of the box leaves the canvas. Stopping there is what
 * keeps dragging a positioning tool rather than a way to lose half a logo off an
 * edge: the artwork you place is always artwork the export contains.
 */
export const MARK_TRAVEL = 1 / 2 - MARK_BOX;

/** The same limit in canvas units, for the studio's readouts and arrow nudges. */
export const MAX_OFFSET_UNITS = MARK_TRAVEL * CANVAS_SIZE;

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
export function clampOffset(offset: MarkOffset | undefined): MarkOffset {
  const limit = MARK_TRAVEL * CANVAS_SIZE;
  const clamp = (value: number) =>
    Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0;
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
export function artworkExtent(shape: "box" | "circle", offset?: MarkOffset): number {
  const { x, y } = clampOffset(offset);
  // Exactly the table values when centred, rather than a value that agrees with
  // them to within a rounding error.
  if (x === 0 && y === 0) return shape === "box" ? MARK_BOX : MARK_CIRCLE;
  const ox = Math.abs(x) / CANVAS_SIZE;
  const oy = Math.abs(y) / CANVAS_SIZE;
  return shape === "box"
    ? Math.max(ox, oy) + MARK_BOX
    : Math.hypot(ox + MARK_BOX, oy + MARK_BOX);
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
): number {
  const limit = target.safeBox ?? target.safeCircle;
  if (limit === undefined) return 1;

  const shadow = finish.shadow > 0 ? SHADOW_SPREAD : 0;
  const extent = artworkExtent(target.safeBox ? "box" : "circle", offset);
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
