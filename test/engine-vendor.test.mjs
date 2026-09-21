import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "vite";

/**
 * Engine tests.
 *
 * The engine is TypeScript, so it is bundled with Vite into one throwaway file
 * and imported — that exercises the exact modules the app ships, without a dev
 * server (whose watcher would keep the test process alive forever).
 *
 * Everything that needs pixels lives in `check:targets` and `check:browser`
 * instead. These are the assertions that can be made about the markup.
 */

const bundleDir = await mkdtemp(join(tmpdir(), "puff-engine-"));
process.on("exit", () => {
  void rm(bundleDir, { recursive: true, force: true });
});

const built = await build({
  configFile: false,
  logLevel: "silent",
  build: {
    write: false,
    minify: false,
    lib: {
      entry: "test/_engine-entry.ts",
      formats: ["es"],
      fileName: () => "engine.mjs",
    },
  },
});

const chunk = (Array.isArray(built) ? built[0].output : built.output).find(
  (entry) => entry.type === "chunk",
);
const bundlePath = join(bundleDir, "engine.mjs");
await writeFile(bundlePath, chunk.code, "utf8");

const {
  renderSvg,
  svgDataUrl,
  roundRectPath,
  squarePath,
  rimBandPath,
  CANVAS_SIZE,
  BG_MODES,
  DEFAULT_RADIUS,
  MAX_RADIUS,
  PALETTES,
  paletteById,
  EXPORT_TARGETS,
  MARK_BOX,
  MARK_CIRCLE,
  MARK_TRAVEL,
  MAX_MARK_SCALE,
  MAX_OFFSET_UNITS,
  MIN_MARK_SCALE,
  SHADOW_SPREAD,
  artworkExtent,
  clampOffset,
  clampScale,
  fitFor,
  guideBox,
  guideCircle,
  markHalf,
  markTravel,
  maxOffsetUnits,
  targetById,
  TEMPLATES,
  RADIUS_LIMITS,
  templateById,
  SAMPLE_MARKS,
  SAMPLE_SHOWCASE,
  sampleMarkById,
} = await import(pathToFileURL(bundlePath).href);

/**
 * The reference plate, as numbers rather than as a file.
 *
 * `docs/Frame.svg` is a 1031-canvas export of a 1024 plate inset 3.5, whose
 * corner arc runs from y=3.5 to y=221.682 — a radius of 218.182 — and whose rim
 * is a 7-wide band centred on the plate edge. These are the three derived
 * constants that make the reference reproducible; asserting them here is what
 * stops a later change to the corner shape or the band width from silently
 * shipping a plate that is no longer the reference's.
 *
 * The reference's rim is a `conic-gradient` inside a `foreignObject`, which no
 * SVG-as-image raster renders — so its colours are checked as the ramp it
 * specifies rather than as pixels. The pixels are `pnpm check:targets`'s job.
 */
const REFERENCE = {
  radius: 221.682 - 3.5,
  band: 7,
  canvas: 1024,
};

/* ------------------------------------------------------------ documents */

const plate = (overrides = {}) => ({
  palette: {
    bg: "#2B63F6",
    bg2: "#1B3FC0",
    bgMode: "radial",
    ...(overrides.palette ?? {}),
  },
  finish: { shadow: 0.55, grain: 0.1, ...(overrides.finish ?? {}) },
  radius: overrides.radius ?? DEFAULT_RADIUS,
  title: "Test plate",
  seedHint: 42,
  ...(overrides.artwork ? { artwork: overrides.artwork } : {}),
});

/**
 * The `<use>` that paints a mark, in full.
 *
 * Written as a helper because the reference is emitted **twice** — the SVG 2
 * `href` and the older `xlink:href` — so every pattern that means "this file
 * paints its artwork" has to name both, or it would match a file that only a
 * browser can read.
 */
const MK_USE = (uid) => `<use href="#${uid}-mk" xlink:href="#${uid}-mk"/>`;

/**
 * The artwork's own rectangle, past both copies of its href.
 *
 * The href is a data URL of unknown length, so the second one has to be stepped
 * over by pattern rather than by count of characters.
 */
const IMAGE = /<image href="[^"]+" xlink:href="[^"]+" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)"/;
const IMAGE_XY = /<image href="[^"]+" xlink:href="[^"]+" x="([-\d.]+)" y="([-\d.]+)"/;

/** A stand-in upload. The renderer never decodes it, so the bytes are opaque. */
const artwork = (overrides = {}) => ({
  href: "data:image/png;base64,iVBORw0KGgo=",
  name: "upload.png",
  mime: "image/png",
  width: 64,
  height: 64,
  ...overrides,
});

/**
 * The paths in a `d` string, split so they can be inspected one at a time.
 *
 * The leading signs are not optional. The band runs *outside* the plate, so half
 * its coordinates are negative, and a pattern written as `[\d.]+` silently skips
 * every one of them — which is how an earlier version of this file reported four
 * arcs for a band that has eight, and made a square band look like an arc-less one.
 */
const arcsOf = (d) => [
  ...d.matchAll(/A (-?[\d.]+) (-?[\d.]+) 0 0 1 (-?[\d.]+) (-?[\d.]+)/g),
];

/* --------------------------------------------------------------- plate */

test("the default plate is the reference frame's shape, unit for unit", () => {
  assert.equal(DEFAULT_RADIUS, 218.18);
  assert.ok(
    Math.abs(REFERENCE.radius - DEFAULT_RADIUS) < 0.01,
    `the reference radius is ${REFERENCE.radius}, the default is ${DEFAULT_RADIUS}`,
  );

  const d = roundRectPath(0, 0, 1024, 1024, DEFAULT_RADIUS);
  const arcs = arcsOf(d);
  assert.equal(arcs.length, 4, "a rounded rect is four arcs");
  for (const arc of arcs) {
    assert.equal(Number(arc[1]), DEFAULT_RADIUS, "every corner uses the radius");
    assert.equal(Number(arc[2]), DEFAULT_RADIUS);
  }
  // Circular, not superelliptical: an arc command with rx = ry = r is a circle,
  // and the reference's own corner is the standard cubic approximation of the
  // same circle (controls at 0.5523·r), so the two are the same shape.
  assert.match(d, /^M 218\.18 0 H 805\.82 A 218\.18 218\.18 0 0 1 1024 218\.18/);
  assert.match(d, / A 218\.18 218\.18 0 0 1 218\.18 0 Z$/);
});

test("the rim band is centred on the plate edge, as the reference's stroke is", () => {
  const band = rimBandPath(0, 0, 1024, 1024, DEFAULT_RADIUS, REFERENCE.band);
  const arcs = arcsOf(band);
  assert.equal(arcs.length, 8, "two rounded rects: an outer and the hole");
  const half = REFERENCE.band / 2;
  const outer = Number(arcs[0][1]);
  const inner = Number(arcs[4][1]);
  assert.equal(outer, DEFAULT_RADIUS + half);
  assert.equal(inner, DEFAULT_RADIUS - half);
  // Half the band falls outside the canvas, exactly as a centred stroke on the
  // edge would — which is why the visible light is 3.5 units wide. The outer
  // boundary therefore starts 3.5 units outside the plate, at the corner centre
  // the plate's own arc uses (218.18 + 3.5 = 221.68 of radius about the same
  // centre), and the canvas crops the rest.
  assert.match(band, /^M 218\.18 -3\.5/);
});

test("the plate is square and opaque unless corners are asked for", () => {
  const square = renderSvg(plate(), { uid: "sq", corners: "square" });
  const rounded = renderSvg(plate(), { uid: "rd", corners: "rounded" });

  // No canvas clip at all in square mode: the field rect fills the canvas, and a
  // clip is the only thing that could leave the corners transparent.
  assert.ok(!square.includes('clip-path="url(#sq-canvas)"'));
  assert.match(rounded, /clip-path="url\(#rd-canvas\)"/);
  // The frame is the same 1024 in both, so `size` never touches the geometry.
  for (const svg of [square, rounded]) {
    assert.match(svg, /viewBox="0 0 1024 1024"/);
  }
});

test("the corners option defaults to square, and to the document's radius", () => {
  // The default matters more than it looks: every export target relies on it, so
  // a caller that forgets to pass anything must still get a platform-safe square.
  const implicit = renderSvg(plate(), { uid: "dflt" });
  assert.ok(!implicit.includes('clip-path="url(#dflt-canvas)"'));
  assert.match(implicit, new RegExp(squarePath(1024).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const own = renderSvg(plate({ radius: 140 }), { uid: "own", corners: "rounded" });
  assert.match(own, /A 140 140 0 0 1/);
  // An explicit radius wins over the document's.
  const forced = renderSvg(plate({ radius: 140 }), {
    uid: "forced",
    corners: "rounded",
    radius: 96,
  });
  assert.match(forced, /A 96 96 0 0 1/);
});

test("the radius is clamped to something a plate can be", () => {
  const tooBig = renderSvg(plate({ radius: 9999 }), { uid: "clamp", corners: "rounded" });
  assert.match(tooBig, new RegExp(`A ${MAX_RADIUS} ${MAX_RADIUS} 0 0 1`));
  const negative = renderSvg(plate({ radius: -40 }), { uid: "neg", corners: "rounded" });
  // A negative radius falls back to a hard corner rather than to a negative arc.
  assert.ok(!negative.match(/A -/), "a negative radius reached the path");
  assert.ok(negative.includes('clip-path="url(#neg-canvas)"'));
});

test("the plate carries atmosphere and a conic rim", () => {
  const svg = renderSvg(plate(), { uid: "trim" });
  for (const id of ["haze", "gleam0", "gleam1"]) {
    assert.match(svg, new RegExp(`id="trim-${id}"`), `missing atmosphere ${id}`);
  }
  // The rim is a fan of wedges clipped to the band, not the pair of elliptical
  // radials that used to stand in for a conic gradient.
  const gradients = svg.match(/id="trim-rim\d+"/g) ?? [];
  assert.equal(gradients.length, 24, "one gradient per wedge");
  assert.match(svg, /clipPath id="trim-band"/);
  assert.match(svg, /clip-rule="evenodd"/);
  assert.equal((svg.match(/fill="url\(#trim-rim\d+\)"/g) ?? []).length, 24);
});

test("the rim's sweep runs the way the reference's does", () => {
  const svg = renderSvg(plate(), { uid: "sweep" });
  /** The two stops of the wedge whose start angle is `deg`. */
  const wedgeAt = (deg) => {
    const step = 360 / 24;
    // The fan is authored from 90° round to 450°, so 12 o'clock belongs to the
    // wrapped tail at index 18 rather than to a wedge at -6.
    const index = Math.round(((deg < 90 ? deg + 360 : deg) - 90) / step);
    const m = svg.match(
      new RegExp(`id="sweep-rim${index}"[^>]*><stop offset="0" stop-color="([^"]+)" stop-opacity="([^"]+)"`),
    );
    assert.ok(m, `no wedge starting at ${deg}°`);
    return { color: m[1], alpha: Number(m[2]) };
  };

  // 3 o'clock is the ramp's zero: the field's muted slate at full strength.
  const right = wedgeAt(90);
  assert.notEqual(right.color, "rgb(255, 255, 255)", "3 o'clock must not be white");
  assert.equal(right.alpha, 1);
  // 9 o'clock is the peak, and it is pure white. Not exactly 1: the reference's
  // peak stop sits at 269.83deg (its own `from 90deg` origin puts the peak at
  // 179.828), which is 0.17deg before the nearest wedge boundary, so the wedge
  // that starts there has already begun its descent.
  const left = wedgeAt(270);
  assert.equal(left.color, "rgb(255, 255, 255)");
  assert.ok(left.alpha > 0.995, `the peak reads ${left.alpha}`);
  // And the top and the bottom are nearly gone, which is what makes it read as
  // one light sweeping an edge rather than a ring.
  assert.ok(wedgeAt(0).alpha <= 1, "the top is a value, not a wrap");
  assert.ok(wedgeAt(180).alpha < 0.5, "the bottom should be faint");
});

test("the rim rides the square when the plate is square", () => {
  const square = renderSvg(plate(), { uid: "sqr", corners: "square" });
  const band = square.match(/clipPath id="sqr-band"><path d="([^"]+)"/)[1];
  // A square band has no arcs at all, so the platform's mask trims the corners
  // and the light follows whatever shape the platform applies.
  assert.equal(arcsOf(band).length, 0);
  assert.match(band, /^M -3\.5 -3\.5/);
});

test("an adaptive background gets no rim at all", () => {
  // The launcher's mask is not knowable at build time, so any edge treatment
  // would be cropped arbitrarily.
  const bg = renderSvg(plate(), { uid: "anbg", layers: "background" });
  assert.ok(!bg.includes("anbg-band"));
  const fg = renderSvg(plate(), { uid: "anfg", layers: "foreground" });
  // The foreground carries the artwork but not the field or the rim.
  assert.ok(!fg.includes("anfg-band"));
  assert.ok(!fg.includes("anfg-field"), "the foreground must not paint the field");
});

/* ------------------------------------------------------------- artwork */

test("an empty plate renders no artwork and no shadow", () => {
  const svg = renderSvg(plate(), { uid: "empty" });
  assert.ok(!svg.includes("<image"), "nothing should be drawn");
  assert.ok(!svg.includes("-shadow"), "no artwork, so nothing to cast one");
  assert.ok(!svg.includes('id="empty-mk"'));
  // And it is still a complete, renderable plate.
  assert.match(svg, /<rect width="1024" height="1024"/);
});

test("the artwork is embedded, never linked", () => {
  const svg = renderSvg(plate({ artwork: artwork() }), { uid: "embed" });
  assert.match(svg, /<image href="data:image\/png;base64,/);
  // Every reference has to be internal or inline. This SVG is written into a file
  // the user opens later, so a remote `href` would be a broken icon on their
  // machine — and here it would taint the canvas the PNG is rasterized through,
  // which makes `toBlob` fail outright rather than merely look wrong.
  const hrefs = [...svg.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(
      href.startsWith("#") || href.startsWith("data:"),
      `non-self-contained reference: ${href.slice(0, 40)}`,
    );
  }
});

test("every reference is readable by an importer, not only by a browser", () => {
  const svg = renderSvg(plate({ artwork: artwork() }), { uid: "xlink" });

  // The bug this exists for: SVG 2 made plain `href` correct, so the file renders
  // in every browser — and the logo was **missing** when the SVG was pasted into a
  // design tool, because those resolve `xlink:href` only. An unresolvable
  // `<image>` draws nothing, so the symptom is a plate with a hole in it and no
  // error anywhere, which is why it took a paste to find.
  assert.match(
    svg,
    /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/,
    "the xlink namespace has to be declared, or a prefixed attribute is invalid XML",
  );

  // Both forms, on both elements that reference anything.
  const image = svg.match(/<image [^>]*>/)?.[0] ?? "";
  assert.ok(image.includes("href=") && image.includes("xlink:href="), `image refs: ${image.slice(0, 60)}`);
  const uses = [...svg.matchAll(/<use [^>]*>/g)].map((m) => m[0]);
  assert.equal(uses.length, 3);
  for (const use of uses) {
    assert.ok(
      /href="#[^"]+"/.test(use.replace("xlink:href=", "")) && /xlink:href="#[^"]+"/.test(use),
      `use is missing a form: ${use}`,
    );
  }

  // Every reference has to resolve *within the file*. An unprefixed href is not a
  // namespace error, but an `xlink:href` with no declaration is — the document
  // would be rejected before anything rendered, and the plate would not appear at
  // all rather than appearing without its logo.
  for (const [, prefix] of svg.matchAll(/\s(xlink:)?href="[^"]*"/g)) {
    if (prefix) {
      assert.ok(svg.includes("xmlns:xlink"), "xlink:href without the namespace declaration");
      break;
    }
  }
});

test("the artwork is painted, not merely defined", () => {
  const svg = renderSvg(plate({ artwork: artwork() }), { uid: "paint" });
  // The group lives in the document's definitions, so a document with no
  // reference to it paints nothing at all. This shipped once: the only references
  // were the two blurred shadow passes, so artwork rendered as two faint smears at
  // 0.15 and 0.08 opacity while the markup still looked complete.
  const shadows = svg.lastIndexOf("paint-shadow-soft");
  const bodyAt = svg.lastIndexOf(MK_USE("paint"));
  assert.ok(shadows > 0, "expected the shadow passes");
  assert.ok(bodyAt > shadows, "the artwork is blurred but never drawn");
  // Once for the body and once per shadow pass, so it is not painted twice over
  // itself either.
  assert.equal(svg.split(MK_USE("paint")).length - 1, 3);
});

test("the fit transform reaches the artwork", () => {
  const svg = renderSvg(plate({ artwork: artwork() }), { uid: "fit", fit: 0.6 });
  assert.match(svg, /<g id="fit-mk" transform="translate\(512 512\) scale\(0\.6000\)/);
  assert.ok(svg.includes(MK_USE("fit")));
});

test("the artwork sits in the box the extent tables describe", () => {
  const svg = renderSvg(plate({ artwork: artwork() }), { uid: "box" });
  const half = MARK_BOX * CANVAS_SIZE;
  assert.match(
    svg,
    new RegExp(`<image href="data:[^"]+" xlink:href="data:[^"]+" x="${(CANVAS_SIZE / 2 - half).toFixed(1)}"`),
  );
  assert.match(svg, new RegExp(`width="${(half * 2).toFixed(1)}"`));
  // `meet`, not `slice`: a logo is not going to arrive square, and stretching it
  // to fill the box would be worse than the empty space.
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
});

test("a quote in a data URL cannot break out of the attribute", () => {
  // A data URL from FileReader contains no quote, but an SVG read as text and
  // base64-encoded does not pass through either — and this string is injected
  // with `dangerouslySetInnerHTML` and written into a file.
  const svg = renderSvg(
    plate({ artwork: artwork({ href: 'data:image/svg+xml,"><script>alert(1)</script>' }) }),
    { uid: "esc" },
  );
  assert.ok(!svg.includes("<script>"), "the href broke out of its attribute");
  assert.ok(svg.includes("&quot;"), "the quote should have been escaped");
});

/* ------------------------------------------------------------ palettes */

test("palettes carry only what the plate reads", () => {
  assert.equal(PALETTES.length, 12);
  const ids = new Set(PALETTES.map((p) => p.id));
  assert.equal(ids.size, PALETTES.length, "two palettes share an id");
  const fields = new Set(PALETTES.map((p) => p.palette.bg.toLowerCase()));
  assert.equal(fields.size, PALETTES.length, "two palettes share a field colour");

  for (const entry of PALETTES) {
    assert.deepEqual(
      Object.keys(entry.palette).sort(),
      ["bg", "bg2", "bgMode"],
      `${entry.id}: a colour nothing can paint is still in the palette`,
    );
    assert.ok(BG_MODES.includes(entry.palette.bgMode), `${entry.id}: bad mode`);
    for (const key of ["bg", "bg2"]) {
      assert.match(entry.palette[key], /^#[0-9A-Fa-f]{6}$/, `${entry.id}.${key}`);
    }
  }
});

test("every palette mode reaches the field", () => {
  for (const mode of BG_MODES) {
    const svg = renderSvg(
      plate({ palette: { bgMode: mode } }),
      { uid: `mode${mode}` },
    );
    assert.match(svg, /<rect width="1024" height="1024"/, `${mode}: no field`);
    if (mode !== "solid") {
      assert.match(svg, new RegExp(`id="mode${mode}-field"`), `${mode}: no gradient`);
    }
  }
});

test("paletteById hands back a copy, not the table's own object", () => {
  // Two documents that pick the same palette must not share one object, or editing
  // a colour on one would edit it on the other and the change would outlive a
  // reset of either.
  const a = paletteById("electric-blue");
  const b = paletteById("electric-blue");
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
  assert.equal(paletteById("not-a-palette").bg, PALETTES[0].palette.bg);
});

/* ---------------------------------------------------------------- render */

test("no paint-server reference dangles", () => {
  // The regression that matters most: SVG resolves a `fill="url(#missing)"` to no
  // fill at all, so a missing gradient definition silently renders an empty plate
  // while the markup still looks complete.
  const subjects = [
    ...TEMPLATES.map((t) => t.direction),
    plate(),
    plate({ artwork: artwork() }),
    plate({ finish: { shadow: 0, grain: 0 } }),
    plate({ palette: { bgMode: "solid" } }),
  ];
  for (const [index, direction] of subjects.entries()) {
    const svg = renderSvg(direction, { uid: `ref${index}` });
    const defined = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const referenced = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(referenced.length > 0, `subject ${index}: expected a url() reference`);
    for (const ref of referenced) {
      assert.ok(defined.has(ref), `subject ${index}: dangling reference url(#${ref})`);
    }
  }
});

test("rendering is deterministic", () => {
  const d = plate({ artwork: artwork() });
  assert.equal(renderSvg(d, { uid: "det" }), renderSvg(d, { uid: "det" }));
});

test("size changes the rendered box and nothing else", () => {
  const base = renderSvg(plate({ artwork: artwork() }), { uid: "sized" });
  const smaller = renderSvg(plate({ artwork: artwork() }), { uid: "sized", size: 304 });
  assert.match(smaller, /viewBox="0 0 1024 1024"/);
  assert.match(smaller, /width="304" height="304"/);
  // Everything is authored in the fixed 1024 user space, so a smaller raster is
  // the same artwork rescaled rather than redrawn at a different scale. Comparing
  // the whole document with only the width and height removed is what says that.
  // An arc count — which this assertion used to be — only ever said that both
  // documents contain paths.
  assert.equal(
    smaller.replace('width="304" height="304"', "SIZE"),
    base.replace('width="1024" height="1024"', "SIZE"),
  );
});

test("grain is opt-in and its filter is only emitted when it is on", () => {
  const grainy = renderSvg(plate({ finish: { grain: 0.14 } }), { uid: "g0" });
  const clean = renderSvg(plate({ finish: { grain: 0 } }), { uid: "g1" });
  assert.ok(grainy.includes('filter="url(#g0-grain)"'));
  // The turbulence filter is the most expensive thing in the file.
  assert.ok(!clean.includes("g1-grain"), "the turbulence filter should not be emitted");
});

test("the shadow is only emitted when the artwork can cast one", () => {
  const withShadow = renderSvg(plate({ artwork: artwork(), finish: { shadow: 0.5 } }), {
    uid: "s0",
  });
  const flat = renderSvg(plate({ artwork: artwork(), finish: { shadow: 0 } }), { uid: "s1" });
  assert.ok(withShadow.includes('id="s0-shadow"'));
  assert.ok(!flat.includes('id="s1-shadow"'));
});

test("watermark is opt-in and clipped to the plate", () => {
  const plain = renderSvg(plate(), { uid: "plain" });
  const marked = renderSvg(plate(), { uid: "marked", watermark: true });
  assert.ok(!plain.includes("PUFF"));
  assert.ok(marked.includes("PUFF"));
  assert.match(marked, /clip-path="url\(#marked-canvas\)"/);
});

test("svgDataUrl is a usable data URL", () => {
  const url = svgDataUrl(plate(), { uid: "url" });
  const prefix = "data:image/svg+xml;charset=utf-8,";
  assert.ok(url.startsWith(prefix));
  assert.ok(decodeURIComponent(url.slice(prefix.length)).startsWith("<svg"));
});

/* -------------------------------------------------------------- library */

test("every look is a complete, renderable document", () => {
  for (const template of TEMPLATES) {
    const d = template.direction;
    assert.equal(typeof d.title, "string", `${template.id}: no label`);
    assert.ok(d.title.length > 0, `${template.id}: empty label`);
    assert.ok(Number.isFinite(d.seedHint), `${template.id}: seedHint not finite`);
    assert.ok(
      d.radius >= RADIUS_LIMITS.min && d.radius <= RADIUS_LIMITS.max,
      `${template.id}: radius ${d.radius} out of range`,
    );
    // A look carries no artwork: it is the surface, and the artwork is yours.
    assert.equal(d.artwork, undefined, `${template.id}: a look must not ship artwork`);
    for (const [key, value] of Object.entries(d.finish)) {
      assert.ok(Number.isFinite(value) && value >= 0, `${template.id}.${key}`);
    }
    const svg = renderSvg(d, { uid: `t${template.id.replace(/[^a-z0-9]/gi, "")}` });
    assert.match(svg, /<rect width="1024" height="1024"/, `${template.id}: no field`);
  }
});

test("a look renders identically every time", () => {
  // Looks are the whole input to this app, so one that rendered differently on
  // each pass would make the exported file unreproducible.
  const d = templateById("slate").direction;
  assert.equal(renderSvg(d, { uid: "stable" }), renderSvg(d, { uid: "stable" }));
});

test("the library has no duplicates", () => {
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
  assert.equal(new Set(TEMPLATES.map((t) => t.name)).size, TEMPLATES.length);
  assert.ok(TEMPLATES.length >= 24, "the library should carry the product");
});

test("every look names a palette the studio offers", () => {
  // A look whose palette is not in the table would leave the swatch row
  // highlighting nothing.
  const known = new Set(PALETTES.map((p) => p.palette.bg.toLowerCase()));
  for (const template of TEMPLATES) {
    assert.ok(
      known.has(template.direction.palette.bg.toLowerCase()),
      `${template.id}: unknown palette ${template.direction.palette.bg}`,
    );
  }
});

test("each look owns its finish, so one edit cannot reach another", () => {
  const a = templateById("slate").direction;
  const b = templateById("paper").direction;
  assert.notEqual(a.finish, b.finish, "finishes must not be shared");
  assert.notEqual(a.palette, b.palette, "palettes must not be shared");
});

test("the library covers every palette and every radius recipe", () => {
  // Otherwise a look would be reachable only through a search term nobody types.
  assert.equal(
    new Set(TEMPLATES.map((t) => t.direction.palette.bg.toLowerCase())).size,
    PALETTES.length,
    "a palette is unreachable from the gallery",
  );
  const radii = new Set(TEMPLATES.map((t) => t.direction.radius));
  assert.ok(radii.size >= 4, `only ${radii.size} radius values across the library`);
  assert.ok(radii.has(DEFAULT_RADIUS), "the reference radius should be a look's own");
});

test("templateById throws rather than handing back a lookalike", () => {
  assert.throws(() => templateById("nope"), /Unknown template/);
  assert.equal(templateById("candy").name, "Candy");
});

/* ----------------------------------------------------------- samples */

test("every sample mark is an embedded vector, not a fetched file", () => {
  assert.ok(SAMPLE_MARKS.length >= 4, "the landing row needs marks to show");
  assert.equal(new Set(SAMPLE_MARKS.map((m) => m.id)).size, SAMPLE_MARKS.length);
  assert.equal(new Set(SAMPLE_MARKS.map((m) => m.label)).size, SAMPLE_MARKS.length);
  for (const { id, artwork } of SAMPLE_MARKS) {
    // A remote or relative href would be a file the page fetches later, which is
    // the one thing this app's artwork must never be: an icon that breaks when
    // the network does, and a canvas that a PNG export cannot be drawn through.
    assert.match(artwork.href, /^data:image\/svg\+xml/, `${id}: not an inline SVG`);
    assert.equal(artwork.mime, "image/svg+xml", `${id}: mime`);
    assert.equal(artwork.width, 0, `${id}: a vector has no natural width`);
    assert.equal(artwork.height, 0, `${id}: a vector has no natural height`);
    const decoded = decodeURIComponent(artwork.href.replace(/^data:[^,]+,/, ""));
    assert.match(decoded, /^<svg[^>]*viewBox="0 0 64 64"/, `${id}: no sized viewBox`);
    // Nothing may be a link, an image, or a script: these are drawn shapes.
    assert.ok(!/<(image|script|use|a)\b/.test(decoded), `${id}: unexpected element`);
  }
});

test("a sample plate paints its mark and stays self-contained", () => {
  const svg = renderSvg(
    { ...templateById("slate").direction, artwork: sampleMarkById("spark").artwork },
    { uid: "sample" },
  );
  // Once for the body and once per shadow pass — the count is what says the mark
  // is painted rather than merely defined.
  assert.equal(svg.split(MK_USE("sample")).length - 1, 3);
  const hrefs = [...svg.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(
      href.startsWith("#") || href.startsWith("data:"),
      `non-self-contained reference: ${href.slice(0, 40)}`,
    );
  }
});

test("the showcase pairs real looks with real marks", () => {
  // A caption naming a look that no longer exists is the failure mode here, and
  // it would be an empty tile on the landing page rather than a broken build.
  assert.ok(SAMPLE_SHOWCASE.length >= 6, "the row should carry a full set");
  assert.equal(
    new Set(SAMPLE_SHOWCASE.map((s) => s.look)).size,
    SAMPLE_SHOWCASE.length,
    "two tiles would share a look",
  );
  for (const { look, mark } of SAMPLE_SHOWCASE) {
    const template = templateById(look);
    assert.ok(sampleMarkById(mark).artwork.href.startsWith("data:"), `${mark}`);
    // A look with no artwork, so the tile the homepage builds is not the studio's
    // document — it is that document plus one embedded image.
    assert.equal(template.direction.artwork, undefined, `${look} ships artwork`);
  }
  // Every look in the row exists in the gallery the studio actually offers.
  const known = new Set(TEMPLATES.map((t) => t.id));
  for (const { look } of SAMPLE_SHOWCASE) {
    assert.ok(known.has(look), `${look} is not in the library`);
  }
});

test("every arc in a sample mark can span its own chord", () => {
  // The spec silently rescales an arc whose radii cannot reach across its chord,
  // and that is how a crescent became a hole: an inner arc of radius 20 drawn over
  // a 52-unit chord was scaled up to 26 — exactly the outer radius — so both arcs
  // traced the same circle in opposite directions and the non-zero fill cancelled
  // to nothing. The mark painted zero pixels while its markup looked perfect.
  //
  // Asserting on the arcs catches the whole class, and catches it here rather than
  // in a screenshot of the homepage: an author writing an impossible arc is a
  // typo, and a typo is a unit test's business.
  for (const { id, artwork } of SAMPLE_MARKS) {
    const svg = decodeURIComponent(artwork.href.slice(artwork.href.indexOf(",") + 1));
    for (const tag of svg.match(/<path[^>]*>/g) ?? []) {
      const d = tag.match(/\bd="([^"]+)"/)?.[1];
      if (!d) continue;
      let at = [0, 0];
      for (const [, cmd, rest] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
        const nums = (rest.match(/-?\d*\.?\d+/g) ?? []).map(Number);
        const kind = cmd.toUpperCase();
        if (kind === "Z" || nums.length === 0) continue;
        if (kind === "A") {
          const [rx, ry, , , , x, y] = nums;
          const chord = Math.hypot(x - at[0], y - at[1]);
          assert.ok(
            chord <= 2 * Math.min(rx, ry) + 1e-6,
            `${id}: an arc of radius ${rx}/${ry} has to span a chord of ${chord.toFixed(2)} — ` +
              `the radii would be scaled up, drawing a different shape than written`,
          );
          at = [x, y];
        } else if (kind !== "V" && kind !== "H") {
          // M, L, C, S, Q and T all end at their last coordinate pair.
          at = [nums[nums.length - 2], nums[nums.length - 1]];
        }
      }
    }
  }
});

/* ------------------------------------------------------------ extents */

test("the extent tables describe the artwork box and nothing else", () => {
  assert.equal(artworkExtent("box"), MARK_BOX);
  assert.equal(artworkExtent("circle"), MARK_CIRCLE);
  // Square is the worst case for a circular mask: `meet` inside a square box means
  // the artwork reaches the corner.
  assert.ok(MARK_CIRCLE > MARK_BOX);
  assert.ok(Math.abs(MARK_CIRCLE - MARK_BOX * Math.SQRT2) < 1e-9);
  assert.ok(MARK_BOX > 0 && MARK_BOX < 0.5);
  // The box is 60% of the canvas, so it has 20% of canvas to travel before its
  // own edge would leave the canvas.
  assert.ok(Math.abs(MARK_TRAVEL - 0.2) < 1e-9);
  assert.ok(Math.abs(MAX_OFFSET_UNITS - 204.8) < 1e-9);
  // At the default size the derived helpers agree with the constants, so a later
  // edit cannot make the scaled path and the constant disagree about scale 1.
  assert.equal(markHalf(1), MARK_BOX);
  assert.equal(markTravel(1), MARK_TRAVEL);
  assert.equal(maxOffsetUnits(1), MAX_OFFSET_UNITS);
  assert.equal(artworkExtent("box", undefined, 1), MARK_BOX);
});

/* --------------------------------------------------------------- resizing */

test("the artwork is drawn at the size the document asks for, about its own centre", () => {
  const at = (svg) => svg.match(IMAGE).slice(1).map(Number);
  const base = renderSvg(plate({ artwork: artwork() }), { uid: "sz1" });
  const big = renderSvg(plate({ artwork: artwork({ scale: 1.5 }) }), { uid: "sz2" });
  const [x0, y0, w0] = at(base);
  const [x1, y1, w1] = at(big);
  assert.ok(Math.abs(w0 - MARK_BOX * 2 * CANVAS_SIZE) < 0.05, `authored width ${w0}`);
  assert.ok(Math.abs(w1 / w0 - 1.5) < 1e-6, `${w0} → ${w1} is not 1.5×`);
  // Resizing zooms about the mark's own centre, so an unoffset mark's box keeps
  // its middle: growing it must not also slide it.
  for (const [x, y, w] of [
    [x0, y0, w0],
    [x1, y1, w1],
  ]) {
    assert.ok(Math.abs(x + w / 2 - CANVAS_SIZE / 2) < 0.05, "the box did not stay centred");
    assert.ok(Math.abs(y + w / 2 - CANVAS_SIZE / 2) < 0.05);
  }
});

test("the scale is clamped, and at the fill scale the mark is pinned to the middle", () => {
  assert.equal(clampScale(undefined), 1, "an absent scale is the authored size");
  assert.equal(clampScale(Number.NaN), 1, "a malformed scale falls back rather than to a limit");
  assert.equal(clampScale(1e6), MAX_MARK_SCALE);
  assert.equal(clampScale(0), MIN_MARK_SCALE);
  // The fill scale is defined as the one where a square image touches all four
  // edges — if this drifts, `MAX_MARK_SCALE` has stopped meaning anything.
  assert.ok(Math.abs(markHalf(MAX_MARK_SCALE) - 0.5) < 1e-9);
  assert.equal(maxOffsetUnits(MAX_MARK_SCALE), 0, "a full-bleed mark has nowhere to go");
  assert.deepEqual(clampOffset({ x: 400, y: -400 }, MAX_MARK_SCALE), { x: 0, y: 0 });
  // A bigger mark has strictly less room to move, at every step.
  for (const [small, large] of [
    [MIN_MARK_SCALE, 1],
    [1, 1.3],
    [1.3, MAX_MARK_SCALE],
  ]) {
    assert.ok(
      markTravel(large) < markTravel(small),
      `travel did not shrink from ${small} to ${large}`,
    );
  }
  // And the renderer applies both clamps itself: this document arrives from
  // `localStorage`, which anyone can edit.
  const svg = renderSvg(
    plate({ artwork: artwork({ scale: 500, offset: { x: 400, y: 400 } }) }),
    { uid: "szclamp" },
  );
  const [x, y, width] = svg.match(IMAGE).slice(1).map(Number);
  assert.ok(Math.abs(width - CANVAS_SIZE) < 0.05, `clamped width ${width}`);
  assert.ok(Math.abs(x) < 0.05 && Math.abs(y) < 0.05, `clamped to ${x},${y}`);
});

test("an enlarged mark is fitted harder, so the export still contains it", () => {
  const finish = { shadow: 1, grain: 0.1 };
  const shadow = SHADOW_SPREAD;
  for (const id of ["ios", "play", "android-fg"]) {
    const target = targetById(id);
    const limit = target.safeBox ?? target.safeCircle;
    const shape = target.safeBox ? "box" : "circle";
    for (const scale of [MIN_MARK_SCALE, 1, 1.3, MAX_MARK_SCALE]) {
      for (const offset of [undefined, { x: MAX_OFFSET_UNITS, y: MAX_OFFSET_UNITS }]) {
        const fit = fitFor(target, finish, offset, scale);
        const reached = artworkExtent(shape, offset, scale) * fit + shadow;
        assert.ok(
          fit > 0 && reached <= limit + 1e-9,
          `${id} at ${scale}× / ${offset ? "corner" : "centre"}: ` +
            `${reached.toFixed(3)} over ${limit.toFixed(3)} (fit ${fit.toFixed(3)})`,
        );
      }
    }
  }

  // Monotonic, so the fit can be trusted as "this much of the allowed size is
  // used": a bigger mark is never fitted more generously than a smaller one.
  const ios = targetById("ios");
  const flat = { shadow: 0, grain: 0 };
  const fitted = [1, 1.2, 1.4, MAX_MARK_SCALE].map((scale) =>
    fitFor(ios, flat, undefined, scale),
  );
  for (let i = 1; i < fitted.length; i++) {
    assert.ok(fitted[i] <= fitted[i - 1] + 1e-9, `fit rose at step ${i}: ${fitted}`);
  }
  assert.ok(fitted[fitted.length - 1] < fitted[0], "enlarging changed nothing");
});

/* ------------------------------------------------------------- position */

test("the offset reaches the image, and is clamped on the way through", () => {
  const centred = renderSvg(plate({ artwork: artwork() }), { uid: "off0" });
  const moved = renderSvg(
    plate({ artwork: artwork({ offset: { x: 100, y: -60 } }) }),
    { uid: "off1" },
  );
  const at = (svg) => svg.match(IMAGE_XY).slice(1).map(Number);
  const [x0, y0] = at(centred);
  const [x1, y1] = at(moved);
  assert.equal(x1 - x0, 100, "the x offset did not reach the image");
  assert.equal(y1 - y0, -60, "the y offset did not reach the image");

  // A hand-edited document is the reason this is clamped in the renderer rather
  // than only in the studio: `localStorage` is editable, and a mark pushed to
  // 1e9 units would render as nothing on the canvas at all.
  const absurd = renderSvg(
    plate({ artwork: artwork({ offset: { x: 1e9, y: -1e9 } }) }),
    { uid: "off2" },
  );
  const [x2, y2] = at(absurd);
  assert.equal(x2 - x0, MAX_OFFSET_UNITS);
  assert.equal(y2 - y0, -MAX_OFFSET_UNITS);
  assert.deepEqual(clampOffset({ x: Number.NaN, y: 12 }), { x: 0, y: 12 });
});

test("an off-centre mark is measured to its farthest corner", () => {
  const half = MAX_OFFSET_UNITS;
  // Centred, the reach is the box's own half-extent. Moved to a corner, it is the
  // box's half-extent plus the whole travel on both axes.
  assert.ok(Math.abs(artworkExtent("box", { x: half, y: half }) - 0.5) < 1e-9);
  assert.ok(
    Math.abs(artworkExtent("circle", { x: half, y: half }) - Math.hypot(0.5, 0.5)) < 1e-9,
  );
  // A box-shaped safe area only cares about the further axis, so travelling on
  // one axis and on both cost exactly the same — and either axis is symmetric.
  assert.equal(artworkExtent("box", { x: half, y: 0 }), artworkExtent("box", { x: 0, y: half }));
  assert.equal(artworkExtent("box", { x: half, y: half }), artworkExtent("box", { x: half, y: 0 }));
  // The circle's reach is the distance from the centre to the mark's far corner,
  // which is why an offset toward a corner is what shrinks an adaptive export.
  assert.ok(
    artworkExtent("circle", { x: half, y: half }) > artworkExtent("circle", { x: half, y: 0 }),
  );
});

test("moving the mark off centre shrinks the fitted export", () => {
  const finish = { shadow: 0.5, grain: 0.1 };
  const ios = targetById("ios");
  const android = targetById("android-fg");
  const centred = fitFor(ios, finish);
  const corner = fitFor(ios, finish, { x: MAX_OFFSET_UNITS, y: MAX_OFFSET_UNITS });
  assert.ok(corner < centred, `corner fit ${corner} against centred ${centred}`);
  // And the Android circle, where the diagonal is the binding constraint.
  const centredCircle = fitFor(android, finish);
  const cornerCircle = fitFor(android, finish, {
    x: MAX_OFFSET_UNITS,
    y: MAX_OFFSET_UNITS,
  });
  assert.ok(cornerCircle < centredCircle);
  // A target with no safe area has nothing to fit, wherever the mark sits.
  assert.equal(fitFor(targetById("android-bg"), finish, { x: MAX_OFFSET_UNITS, y: 0 }), 1);
});

test("every document survives every export target", () => {
  // The studio promises pixel-perfect files; this is that promise as an
  // assertion, per look, per platform — including the Android adaptive foreground
  // whose 66/108 circle is the tightest mask of the four.
  const documents = [
    ...TEMPLATES.map((t) => t.direction),
    plate({ artwork: artwork() }),
    plate({ artwork: artwork(), finish: { shadow: 1 } }),
    plate({ artwork: artwork(), finish: { shadow: 0 } }),
    // The resized ends of the range, each with the heaviest shadow it can carry:
    // the fill scale is the largest a mark can be drawn, and the smallest is the
    // one with the most room to travel, which is the worst case for a box mask.
    plate({ artwork: artwork({ scale: MAX_MARK_SCALE }), finish: { shadow: 1 } }),
    plate({
      artwork: artwork({ scale: MIN_MARK_SCALE, offset: { x: MAX_OFFSET_UNITS, y: MAX_OFFSET_UNITS } }),
      finish: { shadow: 1 },
    }),
  ];
  for (const target of EXPORT_TARGETS) {
    const limit = target.safeBox ?? target.safeCircle;
    if (limit === undefined) continue;
    const shape = target.safeBox ? "box" : "circle";
    for (const [index, direction] of documents.entries()) {
      // Read from the document rather than from a fixed size and position: the
      // point of this check is that *whatever* the document says is honoured by
      // the fit, so it must be the document's own numbers that are measured.
      const art = direction.artwork;
      const fit = fitFor(target, direction.finish, art?.offset, art?.scale);
      assert.ok(fit > 0 && fit <= 1, `${target.id}/${index}: fit ${fit}`);
      // The shadow is the one term the fit cannot shrink, so it is added back
      // after the scaling rather than being left out of the budget.
      const shadow = direction.finish.shadow > 0 ? SHADOW_SPREAD : 0;
      const reached = artworkExtent(shape, art?.offset, art?.scale) * fit + shadow;
      assert.ok(
        reached <= limit + 1e-9,
        `${target.id}/${index}: ${reached.toFixed(3)} over ${limit.toFixed(3)}`,
      );
    }
  }
});

test("the fit is 1 for a target with no safe area", () => {
  const bg = targetById("android-bg");
  assert.equal(fitFor(bg, { shadow: 1, grain: 0.2 }), 1);
  assert.equal(guideBox(bg), null);
  assert.equal(guideCircle(bg), null);
});

test("the guides describe the masks they claim to", () => {
  // The two are in different units because their consumers are: the box is a CSS
  // `inset` on all four sides, the circle is a width and a height. Both are
  // compared as numbers — the exact string is float formatting, the value is not.
  const iosBox = parseFloat(guideBox(targetById("ios")));
  // Apple's safe area is 820 of 1024, so (1024 - 820) / 2 = 102 px of margin: an
  // inset of 9.96%. A 20% inset would be a 60%-wide box, which is a designer's
  // habit rather than Apple's number.
  assert.ok(Math.abs(iosBox - 9.9609375) < 1e-9, `iOS box inset ${iosBox}`);
  // 66 of 108: the circle an adaptive icon is guaranteed.
  const fgCircle = parseFloat(guideCircle(targetById("android-fg")));
  assert.ok(Math.abs(fgCircle - (66 / 108) * 100) < 1e-9, `fg circle ${fgCircle}`);
  // A square target has no circle and a circular one has no box.
  assert.equal(guideCircle(targetById("ios")), null);
  assert.equal(guideBox(targetById("android-fg")), null);
});

test("the rim's bevel is the reference's own, at the reference's own field", () => {
  // `docs/logo.svg`'s field, so the comparison is like for like. The reference
  // reuses one slate rim across both of its variants, and deriving one purely from
  // the field gave a dull mid-grey (#818283) on a field this dark.
  const svg = renderSvg(
    plate({ palette: { bg: "#0F0F13", bg2: "#353856", bgMode: "linear" } }),
    { uid: "bevel" },
  );
  const stop = svg.match(
    /id="bevel-rim0"[^>]*><stop offset="0" stop-color="([^"]+)" stop-opacity="([^"]+)"/,
  );
  assert.ok(stop, "no wedge starting at 3 o'clock");
  const channels = stop[1].match(/\d+/g).map(Number);
  // The reference's `rgba(160, 163, 190, 1)`, the zero end of its conic ramp.
  for (const [index, want] of [160, 163, 190].entries()) {
    assert.ok(
      Math.abs(channels[index] - want) <= 3,
      `channel ${index}: ${channels[index]} against the reference's ${want}`,
    );
  }
  assert.equal(Number(stop[2]), 1, "the bevel's alpha is 1 at 3 o'clock");
});

test("targetById throws rather than returning undefined", () => {
  assert.throws(() => targetById("nope"), /Unknown export target/);
});

test("every target is square and none of them carries a mask", () => {
  // The radius shapes the preview and the SVG master. Each platform masks the
  // master itself, and iOS rejects a rounded 1024 that carries alpha at all — so
  // a target gaining a mask would be a regression, not a feature.
  for (const target of EXPORT_TARGETS) {
    assert.equal(target.mask, undefined, `${target.id} should have no mask`);
    assert.ok(["full", "foreground", "background"].includes(target.layers));
  }
});
