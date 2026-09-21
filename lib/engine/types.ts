/**
 * The document schema.
 *
 * A document is a *plate* and, optionally, the artwork sitting on it. There are
 * no built-in marks: the shapes this app used to draw were the only AI-shaped
 * part of it, and the studio is now about your logo on a well-designed plate.
 *
 * Everything is authored in a fixed 1024 user space, so a template and a
 * hand-edited document are the same kind of object and the renderer never has to
 * rescale its geometry.
 */

export const BG_MODES = ["solid", "linear", "radial", "glow"] as const;
export type BgMode = (typeof BG_MODES)[number];

export interface Palette {
  /** Field color. */
  bg: string;
  /** Second field color for gradient/glow modes. */
  bg2: string;
  bgMode: BgMode;
}

export interface Finish {
  /** Strength of the contact shadow, 0–1. */
  shadow: number;
  /** Film-grain opacity, 0–1. */
  grain: number;
}

/**
 * The plate's corner radius, in the 1024 user space, and its limits.
 *
 * `218.18` is not a round number because it is not arbitrary: it is the radius
 * of the reference frame (`docs/Frame.svg`, a 1024 plate inset 3.5 inside a 1031
 * canvas, corner arc running 3.5 → 221.682). Matching it means our plate at
 * radius 218.18 and the reference at 1024 are the same shape, to the unit — no
 * scaling, no approximation, and no continuous-curve smoothing, since the
 * reference's corner is a plain circular arc.
 *
 * 512 is a circle, which is the point at which the value stops meaning anything.
 */
export const DEFAULT_RADIUS = 218.18;
export const MAX_RADIUS = 512;

/**
 * The user's artwork.
 *
 * Carried in the document rather than in a side table because it has to travel
 * exactly where a mark travels: through the renderer, into the SVG, and out
 * through the rasterizer. That is also what keeps the promise that nothing
 * leaves the browser — a data URL *is* the file, so there is no upload step to
 * forget to wire up, and the exported SVG stays self-contained (an external
 * `href` would make the rasterizer's canvas tainted, and `toBlob` would then
 * refuse outright).
 */
/**
 * Where the mark sits, in the 1024 user space, as an offset from the canvas
 * centre.
 *
 * It lives on the artwork rather than on the `Direction` because it is a property
 * of the image: replace the logo and the new file arrives centred, which is the
 * only sane default for something you have not seen on this plate yet. It is also
 * what makes the offset survive a look change — `setTemplate` carries the artwork
 * across *whole*, and this is part of it.
 *
 * Clamped by `clampOffset` in `targets.ts`, both on the way in from the studio
 * and again inside the renderer: a document can also arrive from a hand-edited
 * session record, and the renderer is the last place that can guarantee the
 * artwork is still on the canvas.
 */
export interface MarkOffset {
  x: number;
  y: number;
}

export interface MarkArtwork {
  /** A `data:` URL. Never a remote or blob URL, so nothing is fetched later. */
  href: string;
  /** The original filename, for the UI to name what is loaded. */
  name: string;
  /** The original media type, so the UI can say whether it is vector or raster. */
  mime: string;
  /** Natural size before any downscale. `0` for vector, which has no fixed size. */
  width: number;
  height: number;
  /** Where the mark sits relative to the canvas centre. Absent means centred. */
  offset?: MarkOffset;
  /**
   * How big the artwork is drawn, as a multiple of the default box. Absent
   * means `1`, the authored size.
   *
   * A multiplier rather than a size in canvas units, because the box is what
   * every extent in `targets.ts` is derived from: scaling the box scales the
   * reach, and the fit that keeps the artwork inside a platform's mask then has
   * one number to read. It is clamped to `MAX_MARK_SCALE`, the point at which a
   * square image fills the canvas exactly — past that there is nothing left to
   * zoom into, only artwork the export would have to throw away.
   */
  scale?: number;
}

export interface Direction {
  palette: Palette;
  finish: Finish;
  /** Plate corner radius in the 1024 space. See `DEFAULT_RADIUS`. */
  radius: number;
  /**
   * Short human label for this document: names the file and titles the preview.
   * Not a prompt — nothing here is fed to a model.
   */
  title: string;
  /** Poses the field's variation (the grain seed). Deterministic. */
  seedHint: number;
  /**
   * The artwork. Nothing is drawn on the plate without it, which is the honest
   * empty state: a plate with no logo in it is a plate, not a broken icon.
   */
  artwork?: MarkArtwork;
}

export interface RenderOptions {
  /** Quiet PUFF watermark for previews. Removed on unlock. */
  watermark?: boolean;
  size?: number;
  /** Unique SVG id prefix. Needed when two different plates share a seed. */
  uid?: string;
  /**
   * Scale the artwork about the canvas centre so it survives a platform's mask.
   * `1` leaves it as authored. `fitFor` in `targets.ts` derives the value from a
   * measured extent, so nothing here has to rasterize and re-measure.
   */
  fit?: number;
  /**
   * Corner treatment. `square` is what every export target uses: each platform
   * masks the master itself, and iOS rejects a rounded 1024 master that carries
   * an alpha channel at all. `rounded` is the design look — the preview and the
   * SVG master — and takes its radius from `radius` (or the document's own).
   */
  corners?: "square" | "rounded";
  /** Radius in user-space units, when `corners: "rounded"`. */
  radius?: number;
  /**
   * Which layers to paint. `full` is the whole plate; `foreground` and
   * `background` are the two halves of an Android adaptive icon, which are
   * delivered as separate layers and masked by the launcher at runtime.
   */
  layers?: "full" | "foreground" | "background";
}
