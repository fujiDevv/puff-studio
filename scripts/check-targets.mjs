import { createServer } from "vite";

import { connect, launchChrome } from "./cdp.mjs";
import { pngDataUrl } from "./test-image.mjs";

/**
 * Export-target and plate-edge checks, measured on real pixels.
 *
 * Three things that are easy to break silently, checked against the real
 * renderer rather than against the tables that describe it:
 *
 *  1. **Safe areas.** Each platform masks the square master to a different shape,
 *     so the artwork has to fit a different limit per target. Every look in the
 *     library is measured with an upload attached, at the fitted scale, against
 *     the target's limit — so retuning a look or the fit maths cannot quietly
 *     push a logo past Android's 66/108 circle. Each look is measured at both
 *     ends of the resize range as well, because a logo the user has enlarged is
 *     the case most likely to reach an edge and the one a fit tuned only for the
 *     default box would get wrong.
 *  2. **Alpha.** iOS and the App Store reject a 1024 master that carries an alpha
 *     channel, so a square master must be opaque right into its corners — while
 *     the rounded preview beside it must stay transparent outside the curve.
 *  3. **The reference edge.** `docs/Frame.svg` and `docs/logo.svg` are the design
 *     this plate is meant to reproduce: a 7-wide rim band centred on the plate
 *     edge, whose sweep is muted at 3 o'clock (`#A0A3BE`), white at 9, and
 *     nearly gone at 12 and 6. The reference draws that sweep as a CSS
 *     `conic-gradient` inside a `foreignObject`, which no SVG-as-image raster
 *     renders at all — so the comparison here is against the numbers that
 *     gradient specifies, measured out of our own rendered pixels.
 *
 * Run: `pnpm check:targets`
 */

const RASTER = 200;
/** The edge checks read a band 3.5 units wide, so they need the full master. */
const EDGE_RASTER = 1024;
const EPSILON = 0.012;

const results = [];
let failed = false;

function record(step, ok, detail) {
  results.push({ step, ok, detail });
  if (!ok) failed = true;
}

/** `docs/logo.svg`'s own field, so the edge comparison is like for like. */
const REFERENCE_FIELD = { bg: "#0F0F13", bg2: "#353856", bgMode: "linear" };
/** The zero end of the reference's conic ramp: `rgba(160, 163, 190, 1)`. */
const REFERENCE_BEVEL = [160, 163, 190];
/** The reference plate's corner radius, and its rim band, in 1024 units. */
const REFERENCE_RADIUS = 221.682 - 3.5;
const RIM_WIDTH = 7;

const vite = await createServer({
  configFile: false,
  logLevel: "silent",
  server: { middlewareMode: true },
  appType: "custom",
});

let sweep;
let masters;
let edge;
try {
  const { renderSvg } = await vite.ssrLoadModule("/lib/engine/render.ts");
  const { TEMPLATES } = await vite.ssrLoadModule("/lib/templates.ts");
  const { EXPORT_TARGETS, MAX_MARK_SCALE, MAX_OFFSET_UNITS, MIN_MARK_SCALE, fitFor } =
    await vite.ssrLoadModule("/lib/engine/targets.ts");

  /**
   * The upload every look is measured with.
   *
   * A look carries no artwork — it is the surface, and the logo is yours — so the
   * extent check only means anything with one attached. Square, because that is
   * the worst case for a circular mask: drawn `meet` inside its box, a square
   * image reaches the box's corners.
   */
  const upload = {
    href: pngDataUrl({ width: 64, height: 64 }),
    name: "upload.png",
    mime: "image/png",
    width: 64,
    height: 64,
  };

  const artTargets = EXPORT_TARGETS.filter((t) => t.layers !== "background");

  sweep = [];
  for (const target of artTargets) {
    const limit = target.safeBox ?? target.safeCircle;
    const shape = target.safeBox ? "box" : "circle";
    for (const template of TEMPLATES) {
      // Five cases per look, and each one is a term the fit has to make room for:
      // the look's own finish, the heaviest shadow it could be moved to, the mark
      // pushed as far off centre as the studio allows, and then that same worst
      // case at both ends of the resize range. The shadow, the offset and the size
      // are the three terms the fit cannot shrink away, so all three are pushed to
      // their extreme here rather than trusted to a recipe — and the fill scale is
      // the single most demanding document this studio can produce.
      const corner = { x: MAX_OFFSET_UNITS, y: MAX_OFFSET_UNITS };
      for (const [label, finish, offset, scale] of [
        ["own", template.direction.finish, undefined, undefined],
        [`shadow 1`, { ...template.direction.finish, shadow: 1 }, undefined, undefined],
        ["corner", { ...template.direction.finish, shadow: 1 }, corner, undefined],
        ["fill", { ...template.direction.finish, shadow: 1 }, corner, MAX_MARK_SCALE],
        ["tiny", { ...template.direction.finish, shadow: 1 }, corner, MIN_MARK_SCALE],
      ]) {
        const direction = {
          ...template.direction,
          finish,
          artwork: {
            ...upload,
            ...(offset ? { offset } : {}),
            ...(scale ? { scale } : {}),
          },
        };
        const fit = fitFor(target, finish, offset, scale);
        const uid = `s${target.id.replace(/[^a-z]/gi, "")}${template.id.replace(/[^a-z0-9]/gi, "")}${label.replace(/[^a-z0-9]/gi, "")}`;
        sweep.push({
          target: target.id,
          label: `${template.id} ${label}`,
          limit,
          shape,
          fit: +fit.toFixed(3),
          svg: renderSvg(direction, { uid, fit, layers: target.layers }),
        });
      }
    }
  }

  // The masters whose alpha decides whether a platform accepts the file at all.
  const referencePlate = {
    palette: REFERENCE_FIELD,
    finish: { shadow: 0.55, grain: 0.1 },
    radius: REFERENCE_RADIUS,
    title: "Reference plate",
    seedHint: 42,
  };

  masters = [
    { key: "ios-master", svg: renderSvg(referencePlate, { uid: "opaqueios" }) },
    {
      key: "preview",
      svg: renderSvg(referencePlate, { uid: "opaqueprev", corners: "rounded" }),
    },
    {
      key: "android-bg",
      svg: renderSvg(referencePlate, { uid: "opaqueanbg", layers: "background" }),
    },
    {
      key: "android-fg",
      svg: renderSvg(referencePlate, { uid: "opaqueanfg", layers: "foreground" }),
    },
  ];

  edge = {
    svg: renderSvg(referencePlate, { uid: "edgeref", corners: "rounded" }),
  };
} finally {
  await vite.close();
}

const { child, port } = await launchChrome({ port: 9349 });
const cdp = await connect(port);

try {
  await cdp.send("Runtime.enable");

  const measured = await cdp.evaluate(`(async () => {
    const S = ${RASTER};
    const E = ${EDGE_RASTER};
    const cases = ${JSON.stringify(sweep)};
    const masters = ${JSON.stringify(masters)};
    const edgeSvg = ${JSON.stringify(edge.svg)};

    function canvasOf(size) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      return c;
    }

    async function image(svgText) {
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
      return await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('raster failed'));
        i.src = url;
      });
    }

    async function draw(svgText, size) {
      const img = await image(svgText);
      const c = canvasOf(size);
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      return ctx.getImageData(0, 0, size, size).data;
    }

    /* ------------------------------------------------------- safe areas */

    const out = [];
    for (const c of cases) {
      const doc = new DOMParser().parseFromString(c.svg, 'image/svg+xml');
      // Strip the artwork group to get a baseline for the diff: this is the same
      // trick the eye does, and it needs no DOM parser in Node.
      doc.querySelector('[id$="-mk"]')?.remove();
      const bare = new XMLSerializer().serializeToString(doc.documentElement);
      const full = await draw(c.svg, S);
      const without = await draw(bare, S);

      let extent = 0, hit = false;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4;
          const d = Math.max(
            Math.abs(full[i] - without[i]),
            Math.abs(full[i + 1] - without[i + 1]),
            Math.abs(full[i + 2] - without[i + 2]),
            Math.abs(full[i + 3] - without[i + 3]),
          );
          // Below the threshold is dithering in the plate's own grain, not ink.
          if (d <= 24) continue;
          hit = true;
          const dx = Math.abs((x + 0.5) / S - 0.5);
          const dy = Math.abs((y + 0.5) / S - 0.5);
          const v = c.shape === 'box' ? Math.max(dx, dy) : Math.hypot(dx, dy);
          if (v > extent) extent = v;
        }
      }
      out.push({ ...c, extent: hit ? +extent.toFixed(4) : 0, hit });
    }

    /* ------------------------------------------------------------ alpha */

    const alphas = {};
    for (const m of masters) {
      const data = await draw(m.svg, S);
      const at = (x, y) => data[(y * S + x) * 4 + 3];
      alphas[m.key] = [at(1, 1), at(S - 2, 1), at(1, S - 2), at(S - 2, S - 2), at(S / 2, S / 2)];
    }

    /* --------------------------------------------------------- the edge */

    const data = await draw(edgeSvg, E);
    const px = (x, y) => {
      const i = (Math.round(y) * E + Math.round(x)) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    // The band is centred on the plate edge, so at 3 o'clock (the right edge of
    // the canvas) it covers the last 3.5 units: sample 2 units in from the edge.
    const bevel = px(E - 2, E / 2);
    const peak = px(1, E / 2);

    // How wide the visible light is, walking in from the left edge at 9 o'clock,
    // where the ramp is at its peak. A 7-wide stroke centred on the edge shows
    // 3.5 units on a 1024 master, which is three whole pixels plus half of a
    // fourth — so the count of fully lit pixels is 3, and the fourth's coverage
    // is recoverable from how far it has travelled from the field to white. An
    // overlap between wedges showed up here as 77% coverage instead of 50%.
    let full = 0;
    while (full < 12 && px(full, E / 2)[0] > 250) full++;
    const field = px(full + 3, E / 2)[0];
    const tail = (px(full, E / 2)[0] - field) / (255 - field);

    // The sweep is concentrated at 9 o'clock and nearly gone at 12. Comparing
    // each edge's lift over the field *just inside* it makes that a number: the
    // reference's ramp is at alpha 1 at 3 o'clock and 0.145 at 12, so the top's
    // lift should be a small fraction of the right edge's.
    const topLift = px(E / 2, 1)[0] - px(E / 2, 5)[0];
    const rightLift = px(E - 2, E / 2)[0] - px(E - 10, E / 2)[0];

    // The corner. Along the 45° diagonal the plate's boundary sits at
    // sqrt(2)·(512 − r) + r, so the radius is recoverable from where the opaque
    // field stops; the rim's own pixels there are a 15%-alpha light, well below
    // the cut.
    let corner = 0;
    for (let r = E * 0.9; r > E * 0.4; r -= 0.25) {
      const d = Math.SQRT1_2 * r;
      if (px(E / 2 + d, E / 2 - d)[3] >= 128) { corner = r; break; }
    }
    const expectedCorner = Math.SQRT2 * (E / 2 - ${REFERENCE_RADIUS}) + ${REFERENCE_RADIUS};

    return {
      out, alphas,
      edge: { bevel, peak, full, tail, topLift, rightLift, corner, expectedCorner },
    };
  })()`);

  /* ----------------------------------------------------------- safe areas */

  const byTarget = new Map();
  for (const m of measured.out) {
    const entry = byTarget.get(m.target) ?? { worst: 0, offenders: [], looks: new Set() };
    entry.looks.add(m.label);
    if (!m.hit) entry.offenders.push(`${m.label} painted nothing`);
    if (m.extent > entry.worst) entry.worst = m.extent;
    if (m.extent > m.limit + EPSILON) {
      entry.offenders.push(`${m.label} ${m.extent} > ${m.limit.toFixed(3)} (fit ${m.fit})`);
    }
    byTarget.set(m.target, entry);
  }

  for (const [target, entry] of byTarget) {
    const limit = measured.out.find((m) => m.target === target).limit;
    record(
      `${target}: artwork inside the safe area`,
      entry.offenders.length === 0,
      entry.offenders.length
        ? entry.offenders.slice(0, 4).join("; ")
        : `worst ${entry.worst.toFixed(3)} of ${limit.toFixed(3)} across ${entry.looks.size} look/finish pairs`,
    );
  }

  /* -------------------------------------------------------------- opacity */

  const opaque = (a) => a.every((v) => v === 255);
  const clear = (a) => a.slice(0, 4).every((v) => v === 0);
  const a = measured.alphas;
  record(
    "the square master is fully opaque, corners included",
    opaque(a["ios-master"]) && opaque(a["android-bg"]),
    `ios ${a["ios-master"].join(",")} · android bg ${a["android-bg"].join(",")}`,
  );
  record(
    "the rounded preview and the adaptive foreground stay transparent outside their shape",
    clear(a.preview) && clear(a["android-fg"]),
    `preview ${a.preview.join(",")} · fg ${a["android-fg"].join(",")}`,
  );

  /* ------------------------------------------------------------ the edge */

  const e = measured.edge;
  const near = (got, want, tol) => got.every((c, i) => Math.abs(c - want[i]) <= tol);

  record(
    "the rim's bevel at 3 o'clock is the reference's #A0A3BE",
    near(e.bevel.slice(0, 3), REFERENCE_BEVEL, 3),
    `rendered ${e.bevel.slice(0, 3).join(",")} against ${REFERENCE_BEVEL.join(",")}`,
  );
  record(
    "the rim peaks white at 9 o'clock",
    e.peak.slice(0, 3).every((c) => c >= 250),
    `rendered ${e.peak.slice(0, 3).join(",")}`,
  );
  record(
    "the visible light is 3.5 units wide, as the reference's half-stroke is",
    e.full === 3 && Math.abs(e.tail - 0.5) <= 0.08,
    `${e.full} fully lit pixels and a fourth at ${(e.tail * 100).toFixed(0)}% coverage ` +
      "(3.5 of the 7-wide band shows on a 1024 master)",
  );
  record(
    "the sweep is nearly gone at 12 o'clock, as the reference's is",
    e.rightLift > 0 && e.topLift / e.rightLift > 0.15 && e.topLift / e.rightLift < 0.32,
    `the top lifts the field by ${e.topLift}, the right edge by ${e.rightLift} ` +
      `(${((e.topLift / e.rightLift) * 100).toFixed(0)}%; the reference's ramp gives ~23%)`,
  );
  record(
    "the corner is the reference's arc, and the rim follows it",
    Math.abs(e.corner - e.expectedCorner) <= 2,
    `boundary at ${e.corner} of an expected ${e.expectedCorner.toFixed(2)} ` +
      `(radius ${REFERENCE_RADIUS} on a ${EDGE_RASTER} master)`,
  );
} catch (error) {
  record("runner completed", false, String(error));
} finally {
  cdp.close();
  child.kill();
}

const width = Math.max(...results.map((r) => r.step.length));
console.log("\nExport targets\n" + "─".repeat(width + 12));
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.step.padEnd(width)}  ${r.detail}`);
}
console.log("─".repeat(width + 12));
console.log(`plate radius ${REFERENCE_RADIUS}, rim band ${RIM_WIDTH}, raster ${RASTER}/${EDGE_RASTER}`);
console.log(failed ? "FAILED" : `PASSED (${results.length} checks)`);
process.exit(failed ? 1 : 0);
