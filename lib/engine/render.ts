import {
  CANVAS_SIZE,
  rimBandPath,
  roundRectPath,
  squarePath,
} from "./geometry";
import { clampOffset, markHalf } from "./targets";
import { MAX_RADIUS, type Direction, type MarkArtwork, type RenderOptions } from "./types";

/**
 * The plate renderer.
 *
 * The layer stack is: plate clip, field, atmosphere, contact shadow, artwork,
 * grain, rim. (The reference's own order, from `docs/Frame.svg`.)
 *
 * Two things changed from the version that drew built-in marks, and both are
 * about the artwork rather than the plate:
 *
 *  - **The plate edges are now the reference's, exactly.** A plain circular
 *    corner at 218.18 (see `DEFAULT_RADIUS`), and a conic rim band rather than
 *    two elliptical radials standing in for one.
 *  - **The silhouette passes are gone.** Inflate, the specular cap, the rim
 *    light and the mark outline all read the mark's own geometry — a clip
 *    against its silhouette, a stroke along its edges. A bitmap has neither, and
 *    an `<image>` inside a `<clipPath>` is not valid SVG, so the clip would
 *    resolve to nothing and the light would vanish rather than merely look
 *    wrong. They are removed rather than disabled, because there is no longer a
 *    document in which they could do anything.
 */

const S = CANVAS_SIZE;

/* ------------------------------------------------------------------ grain */

/**
 * Film grain.
 *
 * The naive version of this — gray turbulence at a low opacity, blended with
 * `overlay` — is a trap. Two independent problems made the texture invisible:
 *
 * 1. `overlay` treats 50% grey as a no-op and turbulence centres on 50% grey, so
 *    raw noise is mathematically present and visually absent. Worse, any contrast
 *    gain strong enough to fix that clips a large share of the noise to solid
 *    black, and because overlay multiplies below 50% grey, the result is a
 *    *uniform darkening* wearing grain as a disguise.
 * 2. `baseFrequency` is in the 1024 master space, so a grain that is one
 *    user-space unit across is genuine at full size and averages clean away in a
 *    ~120px landing tile, where the browser folds ~8×8 of those units into each
 *    displayed pixel. `baseFrequency` here is deliberately low so a real share of
 *    the energy survives that resampling.
 *
 * So the grain is built the other way round: threshold the noise into a
 * black/white speckle and composite it *normally*. That is tone-neutral by
 * construction, because a 50/50 speckle blended as `base·(1-a) + speckle·a`
 * averages back to `base` at every base colour — which is what lets the plate
 * keep its exact gradient while still gaining texture.
 *
 * Normal blending also needs no blend mode, so a non-browser renderer opening the
 * exported SVG gets the same grain instead of silently dropping it.
 */
const GRAIN_FREQ = 0.16;
const GRAIN_SOFTEN = 1.1;
/** Layer opacity per unit of `finish.grain`. */
const GRAIN_STRENGTH = 0.6;

function grainFilter(uid: string, direction: Direction): string {
  const threshold = ["R", "G", "B"]
    .map((ch) => `<feFunc${ch} type="discrete" tableValues="0 1"/>`)
    .join("");
  return [
    `<filter id="${uid}-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`,
    `<feTurbulence type="fractalNoise" baseFrequency="${GRAIN_FREQ}" numOctaves="4" seed="${direction.seedHint % 97}" stitchTiles="stitch"/>`,
    // Desaturate before thresholding. Thresholding R, G and B independently
    // would leave a three-channel speckle in eight colours instead of grey;
    // folding them to luminance first also gives the speckle its 50/50 split.
    `<feColorMatrix type="saturate" values="0"/>`,
    `<feComponentTransfer>${threshold}</feComponentTransfer>`,
    // Just enough softening to stop the threshold reading as ordered dither.
    `<feGaussianBlur stdDeviation="${GRAIN_SOFTEN}"/>`,
    `</filter>`,
  ].join("");
}

/**
 * Zeroes RGB and keeps alpha, so the artwork comes out as flat black. That is
 * what lets the shadow reuse the artwork group directly instead of needing a
 * second, fill-stripped copy of it.
 */
const SHADOW_BLACKEN =
  `<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"/>`;

/** Filter regions are in user space and sized to cover the canvas plus blur. */
const SHADOW_REGION = `filterUnits="userSpaceOnUse" x="-192" y="-192" width="1408" height="1408" color-interpolation-filters="sRGB"`;

/* ---------------------------------------------------------------- colors */

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  const full =
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear blend between two hex colors; `t` runs 0 → a, 1 → b. */
export function mix(a: string, b: string, t: number) {
  const A = parseHex(a);
  const B = parseHex(b);
  return toHex([
    A[0] + (B[0] - A[0]) * t,
    A[1] + (B[1] - A[1]) * t,
    A[2] + (B[2] - A[2]) * t,
  ]);
}

/** Nudge a color toward white; used for the field's center glow. */
export function lighten(hex: string, t: number) {
  return mix(hex, "#FFFFFF", t);
}

/** Perceptual luminance of a hex color, as a hex grey. */
function grey(hex: string) {
  const [r, g, b] = parseHex(hex);
  const l = r * 0.299 + g * 0.587 + b * 0.114;
  return toHex([l, l, l]);
}

/**
 * Pull a color toward its own luminance. The reference plate's bloom and rim are
 * haze and light rather than pigment — they are markedly desaturated against the
 * field they sit on, which is most of why that plate reads as a lit object
 * instead of a flat swatch.
 */
export function desaturate(hex: string, t: number) {
  return mix(hex, grey(hex), t);
}

/**
 * The reference plate's own light, as three colours from `docs/Frame.svg` and
 * `docs/logo.svg`: the haze rising off the bottom edge, the two corner gleams,
 * and the zero end of the rim's sweep.
 *
 * These are **fixed** across both of the reference's variants — the saturated
 * blue plate and the near-black one share one slate — which is exactly what a
 * palette-derived colour gets wrong. Working purely from the field, a near-black
 * plate produced a dull mid-grey rim (`#818283` over a field of `#11141B`) where
 * the reference keeps a light cool bevel. The light is the point: it is what
 * makes the edge read as a bevelled object rather than as a slightly different
 * patch of the same surface.
 */
const REFERENCE_LIGHT = {
  haze: "#4E537B",
  gleam: "#6E75A5",
  bevel: "#A0A3BE",
} as const;

/**
 * How much of the field's own tint the reference's light takes on.
 *
 * The reference's slate is a light, and a light barely carries hue; a plate's own
 * colour is the one thing a fixed slate cannot know about a lime or a cream icon.
 * So the tint is transferred at a fraction — enough for a lime plate's bevel to
 * read as lime, not enough to make the blue plate's more saturated than the
 * reference's own.
 */
const TINT = 0.35;

/**
 * The reference's light, carrying a hint of the field's colour.
 *
 * The rule is one line and worth stating: **the reference sets the lightness, the
 * palette sets the tint.** Taking the reference's own colour and adding `TINT` of
 * the derived colour's deviation from its grey reproduces the reference's
 * `#A0A3BE` bevel when fed the reference's field (to within a level or two) while
 * leaving a lime or cream plate recognisably its own. It is the lightness that
 * had to come from the reference: there is no field colour from which a near-black
 * plate could derive a light one.
 */
function referenceLight(derived: string, reference: string): string {
  const d = parseHex(derived);
  const g = parseHex(grey(derived));
  const base = parseHex(reference);
  return toHex([
    base[0] + (d[0] - g[0]) * TINT,
    base[1] + (d[1] - g[1]) * TINT,
    base[2] + (d[2] - g[2]) * TINT,
  ]);
}

/* --------------------------------------------------------------- helpers */

function rgb(hex: string, alpha: number) {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fieldLayers(id: string, d: Direction): string {
  const { bg, bg2, bgMode } = d.palette;
  if (bgMode === "solid") {
    return `<rect width="${S}" height="${S}" fill="${bg}"/>`;
  }
  if (bgMode === "linear") {
    return [
      `<defs><linearGradient id="${id}-field" x1="0" y1="0" x2="1" y2="1">`,
      `<stop offset="0" stop-color="${lighten(bg, 0.1)}"/>`,
      `<stop offset="0.55" stop-color="${bg}"/>`,
      `<stop offset="1" stop-color="${bg2}"/>`,
      `</linearGradient></defs>`,
      `<rect width="${S}" height="${S}" fill="url(#${id}-field)"/>`,
    ].join("");
  }
  if (bgMode === "glow") {
    return [
      `<defs><radialGradient id="${id}-field" cx="0.5" cy="0.38" r="0.78">`,
      `<stop offset="0" stop-color="${lighten(bg, 0.22)}"/>`,
      `<stop offset="0.45" stop-color="${bg}"/>`,
      `<stop offset="1" stop-color="${bg2}"/>`,
      `</radialGradient></defs>`,
      `<rect width="${S}" height="${S}" fill="url(#${id}-field)"/>`,
    ].join("");
  }
  // radial — a saturated field with a subtle center glow.
  return [
    `<defs><radialGradient id="${id}-field" cx="0.5" cy="0.44" r="0.72">`,
    `<stop offset="0" stop-color="${lighten(bg, 0.14)}"/>`,
    `<stop offset="0.62" stop-color="${bg}"/>`,
    `<stop offset="1" stop-color="${bg2}"/>`,
    `</radialGradient></defs>`,
    `<rect width="${S}" height="${S}" fill="url(#${id}-field)"/>`,
  ].join("");
}

/* ---------------------------------------------------------------- plate */

/**
 * The plate's atmosphere, rescaled from the reference's 1031 master to canvas
 * fractions. A haze rising from the bottom edge plus two faint gleams in the
 * lower corners: the haze colour is the field's own mid-tone pulled most of the
 * way to grey, which is what keeps it reading as air over the field instead of a
 * second gradient.
 */
const HAZE = { cx: 0.5, cy: 1.249, r: 0.4334, opacity: 0.45 };
const GLEAMS = [
  { cx: 0.2742, cy: 0.8927, r: 0.4145, opacity: 0.1 },
  { cx: 0.7709, cy: 0.8883, r: 0.5175, opacity: 0.1 },
];

function plateDefs(uid: string, d: Direction): string {
  const mid = mix(d.palette.bg, d.palette.bg2, 0.5);
  // The reference reuses one slate atmosphere across both of its variants (a
  // saturated blue field and a near-black one), so the muted character is the
  // point rather than an artifact of that field. The derivation supplies the
  // tint; `anchorLight` supplies the light, which is what a dark field has none
  // of its own to give.
  const haze = referenceLight(desaturate(mid, 0.72), REFERENCE_LIGHT.haze);
  const gleam = referenceLight(desaturate(lighten(mid, 0.2), 0.62), REFERENCE_LIGHT.gleam);
  const sphere = (id: string, color: string, g: { cx: number; cy: number; r: number }) =>
    `<radialGradient id="${id}" cx="${g.cx}" cy="${g.cy}" r="${g.r}">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="1"/>` +
    `<stop offset="1" stop-color="${color}" stop-opacity="0"/>` +
    `</radialGradient>`;
  return [
    sphere(`${uid}-haze`, haze, HAZE),
    GLEAMS.map((g, i) => sphere(`${uid}-gleam${i}`, gleam, g)).join(""),
  ].join("");
}

/** The atmosphere layers, painted straight onto the field. */
function plateAtmosphere(uid: string): string {
  const sphere = (id: string, opacity: number) =>
    `<rect width="${S}" height="${S}" fill="url(#${id})" opacity="${opacity}"/>`;
  return [
    sphere(`${uid}-haze`, HAZE.opacity),
    ...GLEAMS.map((g, i) => sphere(`${uid}-gleam${i}`, g.opacity)),
  ].join("");
}

/**
 * The rim: a conic sweep around the plate edge.
 *
 * The reference draws this as a CSS `conic-gradient` inside a `foreignObject`,
 * which is exactly the kind of thing that survives a design tool and then
 * collapses the moment the artwork is rasterized from a data URL or opened in a
 * non-browser renderer — so it cannot be used here.
 *
 * SVG 1.1 has no conic primitive either, and the two obvious stand-ins both
 * fail: a pair of elliptical radial gradients (what this used to be) can be made
 * to *resemble* the sweep but never reproduces it, and a few solid wedges leave
 * visible steps, because the ramp's steepest stretch moves alpha by 0.023 per
 * degree — a step of 4% luminance per 2° wedge, which is squarely in banding
 * territory.
 *
 * So the sweep is drawn as a fan of wedges, each filled with its own two-stop
 * gradient, and clipped to the 7-unit band centred on the plate's edge. The
 * wedges tile exactly — see `RIM_OVERLAP` for why an overlap is worse than a
 * seam. The
 * gradient endpoints are placed on a circle at the band's own radius rather than
 * at arm's length, which is what makes a chord work: the colour then depends on
 * the angle alone to within ~0.3% across a wedge, and the variation across the
 * band's 7-unit width is under 1% of one wedge's change. Two things follow — the
 * fan is smooth rather than stepped, and it stays smooth at any wedge count, so
 * `RIM_STEPS` is a size/accuracy dial rather than a smoothness one.
 *
 * The band itself is `rimBandPath`: a stroke cannot be used as a clip, and a
 * clip is what keeps the rim's edges crisp while the sweep inside it interpolates.
 */
const RIM_WIDTH = 7;
/** Wedges around the circle. 24 is 15° each — see the note above. */
const RIM_STEPS = 24;
/**
 * Overlap between neighbouring wedges, in degrees.
 *
 * Zero, deliberately. A fan of translucent wedges is drawn with source-over
 * compositing, so any overlap paints the overlap region **twice** — and because
 * the overlap sits on the seam ray, the doubling lands exactly where the band
 * meets the plate edge. Measured on the 1024 master with a 0.6° overlap, the
 * band's last 3.5 units came out at 77% coverage instead of 50% and the 12
 * o'clock light was 77 of 255 where the reference's ramp calls for 44: a bright
 * radial tick every 15° around an edge whose whole job is to look like one
 * continuous sweep. The colours are equal at a shared edge by construction, so
 * tiling exactly is both seamless and correct.
 */
const RIM_OVERLAP = 0;
/**
 * Radius the gradients are laid out on: the plate's own edge distance, which for
 * a 1024 plate runs 512 at the edge midpoints to 526 at the diagonal. One value
 * covers both to within a fraction of a percent.
 */
const RIM_RADIUS = 520;
/**
 * The reference's ramp, converted from its `conic-gradient(from 90deg)` to
 * clockwise-from-12-o'clock angles by adding 90. `key` marks the stops that are
 * white; the rest take the field's muted slate.
 *
 * Read the bright end as one continuous cap: the light peaks at 9 o'clock
 * (269.83), holds 0.8 from 228 to 309, and is effectively gone by the top and
 * bottom. The muted colour sits at 3 o'clock at full strength and fades to 0.2
 * around it.
 */
const RIM_RAMP = [
  { angle: 90, key: false, alpha: 1 },
  { angle: 161.68, key: false, alpha: 0.2 },
  { angle: 197.5, key: true, alpha: 0.1 },
  { angle: 228.18, key: true, alpha: 0.8 },
  { angle: 269.83, key: true, alpha: 1 },
  { angle: 309.48, key: true, alpha: 0.8 },
  { angle: 344.46, key: true, alpha: 0.1 },
  { angle: 378.86, key: false, alpha: 0.2 },
  { angle: 450, key: false, alpha: 1 },
] as const;

/**
 * The sweep's colour at an angle, in `rgba()`.
 *
 * Interpolated in **premultiplied** space, because that is what a browser's
 * `conic-gradient` does — interpolating the colour and the alpha independently
 * would drag the mid-stops through a lighter, less transparent grey than the
 * reference has.
 */
const WHITE = [255, 255, 255] as const;

function rimColorAt(
  deg: number,
  muted: string,
): { color: string; alpha: number } {
  let a = ((deg % 360) + 360) % 360;
  // Angles are authored from 90 (the ramp's zero) round to 450, so anything
  // below 90 belongs to the wrapped tail.
  if (a < 90) a += 360;

  let i = 0;
  while (i < RIM_RAMP.length - 2 && RIM_RAMP[i + 1].angle < a) i++;
  const from = RIM_RAMP[i];
  const to = RIM_RAMP[i + 1];
  const t = (a - from.angle) / (to.angle - from.angle);
  const c0 = from.key ? [...WHITE] : parseHex(muted);
  const c1 = to.key ? [...WHITE] : parseHex(muted);

  // Premultiply → interpolate → unpremultiply.
  const pa = c0.map((c) => c * from.alpha);
  const pb = c1.map((c) => c * to.alpha);
  const alpha = from.alpha + (to.alpha - from.alpha) * t;
  if (alpha <= 0) return { color: "rgb(0, 0, 0)", alpha: 0 };
  const c = pa.map((value, index) => (value + (pb[index] - value) * t) / alpha);
  return {
    color: `rgb(${clamp(c[0])}, ${clamp(c[1])}, ${clamp(c[2])})`,
    alpha: Number(alpha.toFixed(4)),
  };
}

/** A point at `angle` (clockwise from 12 o'clock) and `radius` from the centre. */
function polar(angle: number, radius: number): [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [
    Number((S / 2 + radius * Math.sin(rad)).toFixed(2)),
    Number((S / 2 - radius * Math.cos(rad)).toFixed(2)),
  ];
}

function rimFan(uid: string, d: Direction): string {
  // The ramp's muted end: the field's own mid-tone pushed toward grey, then
  // lit to the reference's own level — see `referenceLight`. This is the single
  // most visible thing about the edge, because its alpha is 1 across the whole of
  // 3 o'clock.
  const mid = mix(d.palette.bg, d.palette.bg2, 0.5);
  const muted = referenceLight(
    desaturate(lighten(mid, 0.475), 0.6),
    REFERENCE_LIGHT.bevel,
  );
  const step = 360 / RIM_STEPS;
  const defs: string[] = [];
  const wedges: string[] = [];

  for (let i = 0; i < RIM_STEPS; i++) {
    const a0 = 90 + i * step;
    const a1 = a0 + step;
    const [gx0, gy0] = polar(a0, RIM_RADIUS);
    const [gx1, gy1] = polar(a1, RIM_RADIUS);
    const [px0, py0] = polar(a0 - RIM_OVERLAP, S);
    const [px1, py1] = polar(a1 + RIM_OVERLAP, S);
    const from = rimColorAt(a0, muted);
    const to = rimColorAt(a1, muted);
    // `stop-color` plus `stop-opacity` rather than an `rgba()` string: the
    // attribute is a plain SVG 1.1 colour, and every renderer that can open an
    // exported file understands the pair.
    defs.push(
      `<linearGradient id="${uid}-rim${i}" gradientUnits="userSpaceOnUse" x1="${gx0}" y1="${gy0}" x2="${gx1}" y2="${gy1}">` +
        `<stop offset="0" stop-color="${from.color}" stop-opacity="${from.alpha}"/>` +
        `<stop offset="1" stop-color="${to.color}" stop-opacity="${to.alpha}"/>` +
        `</linearGradient>`,
    );
    wedges.push(
      `<path d="M ${S / 2} ${S / 2} L ${px0} ${py0} L ${px1} ${py1} Z" fill="url(#${uid}-rim${i})"/>`,
    );
  }

  return `<defs>${defs.join("")}</defs>${wedges.join("")}`;
}

/* ---------------------------------------------------------------- render */

export function renderSvg(
  direction: Direction,
  options: RenderOptions = {},
): string {
  const {
    watermark = false,
    size = S,
    uid: uidOption,
    fit = 1,
    corners = "square",
    radius,
    layers = "full",
  } = options;
  const uid = (uidOption ?? `p${direction.seedHint.toString(36)}`).replace(
    /[^a-z0-9]/gi,
    "",
  );
  const { finish } = direction;
  const artwork = direction.artwork;

  // Everything is authored in the fixed 1024 user space. `size` only sets the
  // rendered width/height, so rasterizing at another size rescales the same
  // artwork instead of redrawing it at a different scale.
  const rounded = corners === "rounded";
  const plateRadius = rounded
    ? Math.max(0, Math.min(radius ?? direction.radius, MAX_RADIUS))
    : 0;
  const plate = rounded ? roundRectPath(0, 0, S, S, plateRadius) : squarePath(S);
  const square = squarePath(S);

  // The plate is the field and its atmosphere; the artwork sits on it. An
  // adaptive icon ships those as two separate files, so each half has to be
  // renderable without the other.
  const showPlate = layers !== "foreground";
  const showArt = layers !== "background";

  // A full-bleed square needs no canvas clip: the field rect already fills it,
  // and clipping to a rounded outline is the *only* thing that leaves the
  // corners transparent. Scaled about the centre so offsets shrink
  // proportionally — which is what lets one measured extent serve both a square
  // and a circular safe area.
  const fitTransform =
    fit < 1
      ? ` transform="translate(${S / 2} ${S / 2}) scale(${fit.toFixed(4)}) translate(${-S / 2} ${-S / 2})"`
      : "";
  const canvasClip = rounded ? ` clip-path="url(#${uid}-canvas)"` : "";

  const defs = [
    `<clipPath id="${uid}-canvas"><path d="${plate}"/></clipPath>`,
    plateDefs(uid, direction),
    // The turbulence filter is the most expensive thing in the file — only
    // emit it when grain is actually on.
    finish.grain > 0 ? grainFilter(uid, direction) : "",
    // The contact shadow's two passes: a tight, offset pass that reads as the
    // artwork occluding the field, and a wide, centred pass that grounds it.
    finish.shadow > 0 && artwork
      ? `<filter id="${uid}-shadow" ${SHADOW_REGION}>` +
        `<feGaussianBlur stdDeviation="${(S * 0.022).toFixed(1)}"/>` +
        SHADOW_BLACKEN +
        `</filter>`
      : "",
    finish.shadow > 0 && artwork
      ? `<filter id="${uid}-shadow-soft" ${SHADOW_REGION}>` +
        `<feGaussianBlur stdDeviation="${(S * 0.05).toFixed(1)}"/>` +
        SHADOW_BLACKEN +
        `</filter>`
      : "",
    // The artwork lives in `<defs>` so its shadow passes can reuse the same
    // group. The fit transform sits on the group itself rather than on a
    // wrapper, so every reference to it follows.
    artwork ? `<g id="${uid}-mk"${fitTransform}>${artworkBody(artwork)}</g>` : "",
  ].join("");

  // Contact shadow, traced from the artwork's own alpha.
  //
  // It used to be a blurred ellipse pinned under the canvas centre, which sat
  // *behind* the mark and so only ever showed as a stray dark edge near its
  // lower-right. Tracing the artwork instead puts the shade exactly where it
  // occludes the field: a soft edge under the lower-right, plus a wider centred
  // pool that settles it onto the plate.
  const shadow =
    artwork && finish.shadow > 0
      ? [
          `<g transform="translate(${(S * 0.018).toFixed(1)} ${(S * 0.028).toFixed(1)})" filter="url(#${uid}-shadow)" opacity="${(finish.shadow * 0.5).toFixed(3)}">`,
          `<use ${ref(`#${uid}-mk`)}/>`,
          `</g>`,
          `<g filter="url(#${uid}-shadow-soft)" opacity="${(finish.shadow * 0.28).toFixed(3)}">`,
          `<use ${ref(`#${uid}-mk`)}/>`,
          `</g>`,
        ].join("")
      : "";

  // The reference that paints the artwork. Not optional: the group lives in
  // `<defs>`, so a document with no reference to it paints nothing at all — and
  // the only other references are the shadow passes, which would leave an upload
  // rendering as two faint smears at 0.15 and 0.08 opacity instead of as itself.
  const body = artwork ? `<use ${ref(`#${uid}-mk`)}/>` : "";

  const grain =
    finish.grain > 0
      ? `<rect width="${S}" height="${S}" filter="url(#${uid}-grain)" opacity="${(finish.grain * GRAIN_STRENGTH).toFixed(3)}"/>`
      : "";

  // The rim rides whichever edge the plate is using. Under `corners: "square"`
  // it is banded along the square, so the platform's own mask trims the corners
  // and leaves a continuous edge light; rounded, it follows the radius into
  // every corner. An adaptive background gets no rim at all — the launcher's
  // mask is not knowable at build time, so any edge treatment would be cropped
  // arbitrarily.
  const rim =
    layers === "full"
      ? `<defs><clipPath id="${uid}-band"><path d="${rimBandPath(0, 0, S, S, plateRadius, RIM_WIDTH)}" clip-rule="evenodd"/></clipPath></defs>` +
        `<g clip-path="url(#${uid}-band)">${rimFan(uid, direction)}</g>`
      : "";

  const mark = watermark
    ? [
        `<g opacity="0.5" clip-path="url(#${uid}-canvas)">`,
        `<text x="${S - 46}" y="${S - 40}" text-anchor="end"`,
        ` font-family="Inter, ui-sans-serif, system-ui, sans-serif"`,
        ` font-size="30" font-weight="700" letter-spacing="10" fill="#FFFFFF" fill-opacity="0.9">PUFF</text>`,
        `</g>`,
      ].join("")
    : "";

  return [
    // `xmlns:xlink` is declared even on a plate with no artwork: see `ref`.
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${S} ${S}" width="${size}" height="${size}" role="img">`,
    defs,
    `<g${canvasClip}>`,
    showPlate ? fieldLayers(uid, direction) : "",
    showPlate ? plateAtmosphere(uid) : "",
    showArt ? shadow : "",
    showArt ? body : "",
    showPlate ? grain : "",
    rim,
    // The watermark is preview-only, so it stays outside the layer split.
    mark,
    `</g>`,
    `</svg>`,
  ].join("");
}

/* -------------------------------------------------------------- artwork */

/**
 * The user's artwork.
 *
 * Drawn into the centred square box the extent tables describe, `meet` so it is
 * contained rather than stretched — a logo is not going to arrive square, and
 * distorting it in the name of filling the box would be worse than the empty
 * space. The box position is fixed rather than measured from the image because
 * the fit that keeps artwork inside a platform's mask is computed from a table,
 * not from pixels; the box touching one axis and never overflowing the other is
 * what makes that table honest for any aspect ratio.
 *
 * Its offset from the canvas centre is the one thing the user moves, and it is
 * clamped here as well as in the studio — see `clampOffset` — so a hand-edited
 * document cannot put half a logo off the canvas. The offset goes into the
 * `<image>`'s own coordinates rather than onto a wrapping transform, so the fit
 * the export applies about the centre composes with it in the right order: the
 * mark is placed, then the whole composition is scaled toward the middle.
 *
 * Resizing is the *box* changing size, not the image being stretched: the `meet`
 * fit runs after the box does, so a logo keeps its own aspect ratio at every
 * scale. Growing the box is therefore equivalent to zooming about the mark's own
 * centre — which is what makes one `<image>` rectangle enough to express both
 * size and position, with no wrapper transform to keep in step with them.
 *
 * Note that the clamp is given the mark's own scale rather than the default: at
 * `MAX_MARK_SCALE` the box fills the canvas and there is no room to move at all,
 * so a stored offset that was legal at a smaller size is pulled back to the
 * middle here rather than rendered half off the edge.
 */
function artworkBody(mark: MarkArtwork): string {
  const half = S * markHalf(mark.scale);
  const side = half * 2;
  const { x, y } = clampOffset(mark.offset, mark.scale);
  return (
    `<image ${ref(attr(mark.href))} x="${(S / 2 - half + x).toFixed(1)}" ` +
    `y="${(S / 2 - half + y).toFixed(1)}" width="${side.toFixed(1)}" ` +
    `height="${side.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`
  );
}

/**
 * A reference written twice: once the SVG 2 way, once the old way.
 *
 * SVG 2 dropped the need for the xlink namespace, so `href` alone is correct and
 * every browser renders it — which is why this went unnoticed. **Importers have
 * not caught up.** Several design tools and rasterizers resolve `xlink:href`
 * only, and the symptom is not an error: an `<image>` with an unresolvable
 * reference draws nothing, so the plate arrives with the logo simply missing from
 * it. That is the worst shape a bug can take here, because the file is a valid
 * SVG that looks complete in a text editor.
 *
 * Emitting both costs a few bytes and is what Inkscape, Figma and Illustrator's
 * own exporters do. The namespace is declared on the root unconditionally — an
 * unused declaration is harmless, and a condition that has to stay in step with
 * every `<use>` in this file is not.
 */
function ref(href: string) {
  return `href="${href}" xlink:href="${href}"`;
}

/**
 * Escapes a value for a double-quoted attribute.
 *
 * A data URL from `FileReader` or `canvas.toDataURL` contains no quote, but an
 * SVG read as text and base64-encoded does not pass through either — and this
 * string is injected with `dangerouslySetInnerHTML` and written into a file, so
 * it is the wrong place to rely on that.
 */
function attr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/* ------------------------------------------------------------ data URLs */

export function svgDataUrl(direction: Direction, options?: RenderOptions) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSvg(direction, options))}`;
}
