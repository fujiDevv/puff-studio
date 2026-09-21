import { readFile } from "node:fs/promises";

import { connect, launchChrome, sleep } from "./cdp.mjs";
import { anyFile, pngFile, SVG_MARK } from "./test-image.mjs";

/**
 * Drives the real pages in a real browser.
 *
 *   landing   the wall loops cleanly, every tile paints, the page stays put
 *   studio    every look is free, the design tabs hold real levers, editing
 *             writes through, the safe-area guide fits the artwork the export
 *             will, and a logo can be dragged or nudged into place
 *
 * Run against a dev server: `pnpm dev` then `pnpm check:browser`.
 *
 * Two things are checked here that nothing else can check. The first is the
 * marquee's *seam*: the loop travels `-50%`, so the duplicate copy has to land
 * exactly where the first began, and that is a geometry fact about the rendered
 * track rather than anything visible in the markup. The second is id
 * uniqueness: the tiles carry inline SVG, and two tiles sharing an id would
 * make one paint with the other's gradient — an invisible failure in source and
 * an obvious one on screen.
 */

/**
 * A string that only this app's landing page contains. The sibling `puff-app`
 * runs the same stack on the same machine, and it also answers on `/` with a
 * page about Puff — so "something is listening" is not enough to identify a
 * server, and probing by port alone would happily run this suite against the
 * other app and report nonsense.
 */
const APP_MARKER = "No prompts, no model, no waiting";

/**
 * Finds the dev server, unless `PUFF_URL` says exactly where it is.
 *
 * Auto-detection exists because the port is genuinely unpredictable here: this
 * app takes 3000 when the sibling is down and 3001 when it is not. Picking it
 * wrong used to fail as a navigation timeout, which reads like a broken page
 * rather than a wrong address.
 */
async function resolveBase() {
  if (process.env.PUFF_URL) return process.env.PUFF_URL;

  for (const port of [3000, 3001, 3002, 3003, 5173]) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (!res.ok) continue;
      const html = await res.text();
      if (html.includes(APP_MARKER)) return `http://localhost:${port}`;
    } catch {
      /* nothing there */
    }
  }

  throw new Error(
    "No dev server for this app found on 3000–3003 or 5173. Run `pnpm dev`, or set PUFF_URL.",
  );
}

const BASE = await resolveBase();

/**
 * The viewport every check runs against — named, because one check has to put it
 * back.
 *
 * `Emulation.setDeviceMetricsOverride` **replaces** the override rather than
 * stacking one, so the mobile check cannot undo itself with
 * `Emulation.clearDeviceMetricsOverride`: that removes emulation entirely and drops
 * back to Chrome's real window, which headless reports as 756×469 — below this
 * page's own `md` breakpoint. It was caught by the check *after* it, which went
 * from a 732px plate to 76px while still claiming to measure the desktop layout.
 */
const VIEWPORT = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };

/** Injected into the page: re-renders an SVG with its mark group removed and
 * measures how many pixels changed. A tile whose mark is missing — say a
 * dangling `fill="url(#…)"` — scores zero however complete the markup looks. */
const INK_HELPER = `
  async function rasterize(svgText, S) {
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('raster failed'));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(img, 0, 0, S, S);
    return ctx.getImageData(0, 0, S, S).data;
  }
  // How much of the square the svg actually paints. The wall's tiles are looks
  // with no artwork on them, so there is no mark to diff against — the question
  // there is simply whether the plate rasterizes at all.
  async function paintedCoverage(svgEl, S = 96) {
    const d = await rasterize(svgEl.outerHTML, S);
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) painted++;
    return painted / (S * S);
  }
  async function inkCoverage(svgEl, S = 96) {
    const full = svgEl.outerHTML;
    const doc = new DOMParser().parseFromString(full, 'image/svg+xml');
    const mark = doc.querySelector('[id$="-mk"]');
    if (!mark || doc.querySelector('parsererror')) return -1;
    mark.remove();
    const bare = new XMLSerializer().serializeToString(doc.documentElement);
    const a = await rasterize(full, S);
    const b = await rasterize(bare, S);
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(
        Math.abs(a[i] - b[i]),
        Math.abs(a[i + 1] - b[i + 1]),
        Math.abs(a[i + 2] - b[i + 2]),
        Math.abs(a[i + 3] - b[i + 3]),
      );
      if (d > 30) changed++;
    }
    return changed / (a.length / 4);
  }
`;

const results = [];
let failed = false;

function record(step, ok, detail = "") {
  results.push({ step, ok, detail });
  if (!ok) failed = true;
}

/**
 * Opens one of the design panel's tabs.
 *
 * The three panels are all kept mounted, so every control is in the DOM whichever
 * tab is showing — but a hidden panel's `innerText` is empty, and an assertion
 * that reads one would pass or fail on nothing at all. So anything that reads
 * text out of a panel says which tab it is reading, and this is how.
 */
async function openTab(cdp, id) {
  await cdp.evaluate(`(() => {
    const tab = document.querySelector('[data-slot="tabs-trigger"][data-tab="${id}"]');
    if (tab) tab.click();
  })()`);
  await sleep(220);
}

async function main() {
  const { child, port } = await launchChrome({ port: 9337 });
  const consoleErrors = [];
  let cdp;

  try {
    cdp = await connect(port, (message) => {
      if (message.method === "Runtime.exceptionThrown") {
        const d = message.params?.exceptionDetails;
        consoleErrors.push(
          `[exception] ${d?.exception?.description ?? d?.text ?? "unknown"}`,
        );
      }
      if (message.method === "Runtime.consoleAPICalled") {
        const { type, args } = message.params;
        if (type === "error" || type === "warning") {
          consoleErrors.push(
            `[${type}] ${(args ?? []).map((a) => a.value ?? a.description ?? "").join(" ")}`,
          );
        }
      }
    });

    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    // Headless Chrome reports the document as unfocused, and an unfocused
    // document cannot read the clipboard. Without this the copy check would be
    // measuring the browser's focus model rather than our button.
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });

    // Pin the viewport. Headless Chrome's default window is narrower than the
    // `sm`/`lg` breakpoints this page is designed around, and a hidden or
    // narrow element still reports `innerText` and zero-sized rects — so an
    // unpinned run measures the wrong layout and does not notice.
    await cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT);

    /* ------------------------------------------------------------ landing */

    await cdp.goto(`${BASE}/`);
    await cdp.evaluate("localStorage.clear()");
    await cdp.goto(`${BASE}/`);

    // Note these return objects, not strings: `evaluate` returns by value, and
    // a `JSON.parse` around it would stringify the object to "[object Object]".
    const landing = await cdp.evaluate(`(() => {
        const rows = [...document.querySelectorAll('[data-slot="sample-wall-row"]')].map((row) => {
          const track = row.querySelector('[data-slot="sample-wall-track"]');
          const copies = [...track.querySelectorAll('[data-slot="sample-wall-copy"]')];
          const tileCount = copies.reduce(
            (n, c) => n + c.querySelectorAll('[data-slot="sample-wall-tile"]').length, 0);
          const hidden = copies.filter((c) => c.getAttribute('aria-hidden') === 'true').length;
          return {
            trackWidth: track.getBoundingClientRect().width,
            copyWidth: copies[0].getBoundingClientRect().width,
            copies: copies.length,
            tileCount,
            hidden,
            rowWidth: row.clientWidth,
            animation: getComputedStyle(track).animationName,
            duration: getComputedStyle(track).animationDuration,
          };
        });

        // Every inline svg on the page: collect ids and url() references.
        const svgs = [...document.querySelectorAll('[data-slot="sample-wall"] svg')];
        const seen = new Map();
        const dangling = [];
        let paths = 0;
        for (const svg of svgs) {
          const ids = new Set([...svg.querySelectorAll('[id]')].map((n) => n.id));
          for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
          const html = svg.outerHTML;
          paths += (html.match(/<path/g) ?? []).length;
          for (const m of html.matchAll(/url\\(#([^)]+)\\)/g)) {
            if (!ids.has(m[1])) dangling.push(m[1]);
          }
        }
        const duplicated = [...seen.entries()].filter(([, n]) => n > 1);

        const hrefs = [...new Set(
          [...document.querySelectorAll('[data-slot="sample-wall-tile"]')]
            .map((a) => a.getAttribute('href')),
        )];

        const body = document.body.innerText;

        return {
          rows,
          svgCount: svgs.length,
          paths,
          dangling: [...new Set(dangling)],
          duplicateIds: duplicated.slice(0, 3),
          hrefs,
          headline: /designed/i.test(body),
          // The page's own text. The free-tier assertions are plain Node regexes
          // on it below, rather than regexes that have to survive being injected
          // into one template literal and parsed again inside another.
          bodyText: body,
          // The page must not gain a horizontal scrollbar from the full-bleed wall.
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      })()`);

    record(
      "the landing page renders its headline and wall",
      landing.headline &&
        landing.rows.length === 2 &&
        // One inline svg per tile, at least: the plates are drawn on the page
        // rather than being images of plates.
        landing.svgCount >= landing.rows[0].tileCount + landing.rows[1].tileCount,
      `rows=${landing.rows.length} svgs=${landing.svgCount} for ${landing.rows[0].tileCount + landing.rows[1].tileCount} tiles`,
    );

    // The seam invariant: the track is two copies and the animation travels
    // exactly half of it, so `trackWidth / 2` must equal one copy's width. A
    // flex `gap` between copies would put this off by half a gap.
    const seamError = Math.max(
      ...landing.rows.map((r) => Math.abs(r.trackWidth / 2 - r.copyWidth)),
    );
    record(
      "the marquee's -50% lands exactly on the duplicate copy",
      landing.rows.every((r) => r.copies === 2) && seamError < 0.5,
      `worst error ${seamError.toFixed(3)}px · track ${landing.rows[0].trackWidth.toFixed(1)} = 2 × ${landing.rows[0].copyWidth.toFixed(1)}`,
    );

    // The wall shows a *sample* set rather than the library, so the count worth
    // asserting is structural rather than a number: each row carries the whole set
    // twice, and the two rows are rotations of one another rather than slices of
    // it. One copy then covers the row at any width, which is what keeps the loop
    // seamless instead of showing a hole just before each restart.
    record(
      "each row carries the whole sample set twice",
      landing.rows[0].tileCount === landing.rows[1].tileCount &&
        landing.hrefs.length > 0 &&
        landing.rows[0].tileCount / 2 === landing.hrefs.length,
      `${landing.hrefs.length} sample looks × 2 copies = ${landing.rows[0].tileCount} tiles a row`,
    );

    // One copy has to cover the row or the loop shows a hole before it restarts.
    record(
      "one copy covers the row at this width",
      landing.rows.every((r) => r.copyWidth >= r.rowWidth),
      `copy ${landing.rows[0].copyWidth.toFixed(0)}px vs row ${landing.rows[0].rowWidth}px`,
    );

    // The row clips sideways and must not clip vertically: the tiles lift on hover
    // and a plate's shadow wants a little room, so a row that hides those shears
    // its own items. This is asserted on the *computed* value rather than the class,
    // because a Tailwind utility that compiles to nothing is a trap this codebase
    // has already been bitten by — and because the pairing is the whole point:
    // `clip` is the only overflow value that leaves the other axis `visible`.
    // Reading it back also proves the clipping is load-bearing, since the track is
    // wider than the row it is inside.
    const rowOverflow = JSON.parse(
      await cdp.evaluate(`(() => {
        const style = getComputedStyle(document.querySelector('[data-slot="sample-wall-row"]'));
        return JSON.stringify({ x: style.overflowX, y: style.overflowY });
      })()`),
    );

    record(
      "the marquee clips sideways and leaves the tiles' lift visible",
      rowOverflow.x === "clip" &&
        rowOverflow.y === "visible" &&
        landing.rows[0].trackWidth > landing.rows[0].rowWidth,
      `overflow ${rowOverflow.x}/${rowOverflow.y} · track ${landing.rows[0].trackWidth.toFixed(0)}px inside a ${landing.rows[0].rowWidth}px row`,
    );

    record(
      "each row drifts, and slowly",
      landing.rows.every((r) => r.animation !== "none") &&
        landing.rows.every((r) => parseFloat(r.duration) >= 100),
      landing.rows.map((r) => `${r.animation} ${r.duration}`).join(" · "),
    );

    record(
      "the duplicate copy is hidden from the accessibility tree",
      landing.rows.every((r) => r.hidden === 1),
      `hidden copies: ${landing.rows.map((r) => r.hidden).join(",")}`,
    );

    record(
      "no paint server reference dangles, and no id is reused",
      landing.dangling.length === 0 && landing.duplicateIds.length === 0,
      landing.dangling.length || landing.duplicateIds.length
        ? `dangling=${landing.dangling.join(",")} dupes=${JSON.stringify(landing.duplicateIds)}`
        : `${landing.svgCount} tiles, every url() resolves, every id unique`,
    );

    // Each tile opens the look it is standing on, and the sample mark it carries is
    // never offered as a starting point — so the destinations are looks, one per
    // sample, and every one of them is a valid route into the studio.
    record(
      "every tile opens the look it is standing on",
      landing.hrefs.length > 0 &&
        new Set(landing.hrefs).size === landing.hrefs.length &&
        landing.hrefs.every((h) => /^\/studio\?template=[a-z0-9-]+$/.test(h)),
      `${landing.hrefs.length} distinct destinations, all well-formed`,
    );

    record(
      "the wall does not give the page a horizontal scrollbar",
      landing.pageOverflow <= 0,
      `scrollWidth − innerWidth = ${landing.pageOverflow}px`,
    );

    // One tier, and the copy has to say so. Whether the page names the *library*
    // size is checked in the studio instead, against the library the gallery
    // actually pages through: the wall above is a sample set now, so deriving a
    // library count from it would be measuring the wrong thing and passing anyway.
    const page = landing.bodyText;
    const pricing = {
      freeTier: /\$0/.test(page) && /nothing to sign up/i.test(page),
      noPaywall: !/Puff Pro|\$\d/.test(page.replace(/\$0/g, "")),
    };

    record(
      "the pricing copy says the one tier is free",
      pricing.freeTier && pricing.noPaywall,
      `$0 free tier=${pricing.freeTier} · no paywall copy=${pricing.noPaywall}`,
    );

    // Ink: sample rather than measure all 100+, which would dominate the run.
    const ink = JSON.parse(
      await cdp.evaluate(`(async () => {
        ${INK_HELPER}
        const tiles = [...document.querySelectorAll('[data-slot="sample-wall-tile"] svg')];
        const sample = tiles.filter((_, i) => i % 9 === 0);
        const scores = [];
        const withMark = [];
        for (const svg of sample) {
          scores.push(await paintedCoverage(svg, 96));
          // A *finished* plate is a plate with a mark on it, and the mark has to be
          // embedded: a background-image, or an href the page fetches later, would
          // look identical here and be missing from every export.
          const img = svg.querySelector('image');
          withMark.push(!!img && (img.getAttribute('href') ?? '').startsWith('data:'));
        }
        return JSON.stringify({
          sampled: sample.length,
          worst: Math.min(...scores),
          // A rounded plate only gives up its four corners — about 4% of the
          // square — so anything well under 90% is a plate that failed to draw.
          below: scores.filter((s) => s < 0.9).length,
          marked: withMark.filter(Boolean).length,
        });
      })()`),
    );
    record(
      "every wall tile paints its plate",
      ink.below === 0,
      `${ink.sampled} sampled tiles, worst coverage ${(ink.worst * 100).toFixed(1)}%`,
    );

    // The wall's reason for existing is that an empty look cannot tell a visitor
    // whether a logo will read on it — so every tile has to carry a mark, and the
    // mark has to be embedded rather than fetched.
    record(
      "every wall tile is a finished plate, not a bare look",
      ink.sampled > 0 && ink.marked === ink.sampled,
      `${ink.marked} of ${ink.sampled} sampled tiles carry an embedded mark`,
    );

    /* -------------------------------------------- the marks on the wall tiles */

    // The wall's proof is that a mark reads on a plate, so what is checked here is
    // the *mark* rather than the plate: that it is really painted (not a picture of
    // one — a mark referenced only by the shadow passes still looks complete in the
    // markup), and that it is embedded rather than fetched. The plates are measured
    // above.
    const samples = await cdp.evaluate(`(() => {
        const tiles = [...document.querySelectorAll('[data-slot="sample-wall-tile"]')];
        return {
          count: tiles.length,
          looks: tiles.map((li) => li.getAttribute('data-look')),
          captions: tiles.map((li) => li.innerText.split('\\n')[0]),
          perTile: tiles.map((li) => {
            const html = li.querySelector('svg')?.outerHTML ?? '';
            return {
              // The body reference plus the two shadow passes: one reference
              // would mean the mark is only being blurred, not painted.
              uses: (html.match(/<use href="#/g) ?? []).length,
              hrefs: [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]),
            };
          }),
        };
      })()`);

    // Four copies of the sample set — two rows, each carrying the whole set twice —
    // so the number of tiles is exactly four times the number of distinct looks.
    // That is the structural claim; a count typed here is the kind that goes stale
    // silently, which is what happened to the number this replaces.
    record(
      "the wall puts a sample mark on every look it shows",
      samples.looks.length > 0 &&
        new Set(samples.looks).size >= 6 &&
        samples.count === 4 * new Set(samples.looks).size,
      `${samples.count} tiles on ${new Set(samples.looks).size} distinct looks`,
    );

    // One reference or three, and never two. One is the body on its own, which is
    // right for a look with no shadow — `flat` has none; three adds the two shadow
    // passes. Two would mean a shadow drawn without the body beneath it, which is
    // the failure this was written for: a mark referenced only by its shadows
    // renders as two faint smears while the markup still looks complete.
    record(
      "each sample plate references its mark, body included",
      samples.perTile.every((t) => t.uses === 1 || t.uses === 3) &&
        samples.perTile.some((t) => t.uses === 3),
      `use references per tile: ${[...new Set(samples.perTile.map((t) => t.uses))].sort().join("/")}`,
    );

    record(
      "every sample mark is embedded, not fetched",
      samples.perTile.every(
        (t) =>
          t.hrefs.some((h) => h.startsWith("data:image/svg+xml")) &&
          t.hrefs.every((h) => h.startsWith("#") || h.startsWith("data:")),
      ),
      samples.perTile.every((t) => t.hrefs.every((h) => h.startsWith("#") || h.startsWith("data:")))
        ? "every href is internal or inline"
        : samples.perTile
            .flatMap((t) => t.hrefs)
            .filter((h) => !h.startsWith("#") && !h.startsWith("data:"))
            .slice(0, 3)
            .join(", "),
    );

    // The mark is measured by rasterising *it* rather than by re-rasterising the
    // whole tile with the mark group removed. That difference is not academic here:
    // a tile's SVG text is handed to `encodeURIComponent`, and these marks are
    // themselves percent-encoded `data:image/svg+xml` URLs — so every `%` inside one
    // would be encoded a second time, the nested image would fail to load, and the
    // diff would come back as exactly zero for a mark that is in fact painted.
    // Loading the mark's own href has no nesting to break.
    const sampleInk = JSON.parse(
      await cdp.evaluate(`(async () => {
        // Every *distinct* mark, rather than every nth tile: the wall shows twelve
        // looks four times over, and the failure this is here to catch was a single
        // mark whose outline cancelled itself out — one that a stride over the tiles
        // can step straight past. Twelve rasterisations, and it covers all of them.
        const firstOfEachLook = new Map();
        for (const link of document.querySelectorAll('[data-slot="sample-wall-tile"]')) {
          const look = link.getAttribute('data-look');
          if (!firstOfEachLook.has(look)) firstOfEachLook.set(look, link.querySelector('svg'));
        }
        const tiles = [...firstOfEachLook.values()];
        const scores = [];
        for (const svg of tiles) {
          const href = svg.querySelector('image')?.getAttribute('href') ?? '';
          if (!href.startsWith('data:')) { scores.push(0); continue; }
          const img = await new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = () => rej(new Error('mark raster failed'));
            i.src = href;
          });
          const c = document.createElement('canvas');
          c.width = c.height = 128;
          const ctx = c.getContext('2d');
          ctx.clearRect(0, 0, 128, 128);
          ctx.drawImage(img, 0, 0, 128, 128);
          const d = ctx.getImageData(0, 0, 128, 128).data;
          let painted = 0;
          for (let k = 3; k < d.length; k += 4) if (d[k] > 8) painted++;
          scores.push(painted / (128 * 128));
        }
        return JSON.stringify({ worst: Math.min(...scores), count: scores.length });
      })()`),
    );
    record(
      "the sample marks cover real pixels when drawn on their own",
      sampleInk.count > 0 && sampleInk.worst > 0.01,
      `${sampleInk.count} marks rasterized, worst ink ${sampleInk.worst.toFixed(4)}`,
    );

    /* ----------------------------------------------------------------- seo */

    // Read the identity out of `lib/site.ts` rather than restating it here.
    // Restating it would be a second copy of the domain, and the interesting
    // question is not "is the domain X" but "does the head agree with the file
    // that claims to define it" — which is the invariant that actually rots.
    const siteSource = await readFile(
      new URL("../lib/site.ts", import.meta.url),
      "utf8",
    );
    const declared = (name) => {
      const match = siteSource.match(
        new RegExp(`${name}:[\\s\\S]{0,40}?"([^"]+)"`),
      );
      if (!match) throw new Error(`lib/site.ts declares no ${name}`);
      return match[1];
    };
    const ORIGIN = declared("url");
    const BRAND_NAME = declared("name");
    const BRAND_TITLE = declared("title");
    const BRAND_DESCRIPTION = declared("description");

    const head = await cdp.evaluate(`(() => {
        const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null;
        const link = (sel) => document.querySelector(sel)?.getAttribute('href') ?? null;
        return {
          title: document.title,
          description: meta('meta[name="description"]'),
          canonical: link('link[rel="canonical"]'),
          robots: meta('meta[name="robots"]'),
          og: {
            type: meta('meta[property="og:type"]'),
            siteName: meta('meta[property="og:site_name"]'),
            title: meta('meta[property="og:title"]'),
            description: meta('meta[property="og:description"]'),
            url: meta('meta[property="og:url"]'),
            image: meta('meta[property="og:image"]'),
            imageWidth: meta('meta[property="og:image:width"]'),
            imageHeight: meta('meta[property="og:image:height"]'),
            imageAlt: meta('meta[property="og:image:alt"]'),
          },
          twitter: {
            card: meta('meta[name="twitter:card"]'),
            image: meta('meta[name="twitter:image"]'),
          },
          icons: [...document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')]
            .map((n) => ({
              rel: n.getAttribute('rel'),
              href: n.getAttribute('href'),
              type: n.getAttribute('type'),
              sizes: n.getAttribute('sizes'),
            })),
        };
      })()`);

    // The brand appears once. It used to appear twice on the homepage, because
    // the page set a title that already contained it and the root layout's
    // template appended `· Puff Studio` to it — a head that reads fine at a
    // glance and is wrong in a browser tab, a bookmark and every search result.
    const brandMentions = (head.title.match(new RegExp(BRAND_NAME, "g")) ?? [])
      .length;
    record(
      "the homepage title names the brand exactly once",
      head.title === BRAND_TITLE && brandMentions === 1,
      `"${head.title}" · ${brandMentions} mention(s)`,
    );

    // The trailing slash is dropped from a root URL by the framework, so
    // `https://host/` comes back as `https://host`. Both address the same
    // document and the sitemap lists the slash-free form, so the check compares
    // them without it rather than pinning a form the router decides.
    const withoutSlash = (url) => (url ?? "").replace(/\/$/, "");

    record(
      "the head declares a canonical URL at the real origin",
      withoutSlash(head.canonical) === ORIGIN,
      head.canonical ?? "no <link rel=\"canonical\">",
    );

    record(
      "the description is the one lib/site.ts declares",
      head.description === BRAND_DESCRIPTION,
      `${head.description?.length ?? 0} chars of ${BRAND_DESCRIPTION.length}`,
    );

    // Relative URLs resolving to absolute ones is the whole job of
    // `metadataBase`, and the failure is silent: a relative `og:image` still
    // renders, against whatever host fetched the page — including a preview
    // deploy's own hostname.
    record(
      "the social card is absolute, sized and described",
      head.og.image === `${ORIGIN}/og.png` &&
        head.og.imageWidth === "1200" &&
        head.og.imageHeight === "630" &&
        Boolean(head.og.imageAlt),
      `${head.og.image} ${head.og.imageWidth}x${head.og.imageHeight}`,
    );

    record(
      "og:url and the Twitter card agree with the canonical",
      withoutSlash(head.og.url) === ORIGIN &&
        head.twitter.card === "summary_large_image" &&
        head.twitter.image === `${ORIGIN}/og.png` &&
        head.og.siteName === BRAND_NAME &&
        head.og.type === "website",
      `og:url ${head.og.url} · card ${head.twitter.card}`,
    );

    record(
      "the crawler directives allow indexing",
      (head.robots ?? "").includes("index") &&
        !(head.robots ?? "").includes("noindex"),
      head.robots ?? "no <meta name=\"robots\">",
    );

    // Four icon forms, because four consumers ask for different things: the SVG
    // for anywhere that scales, the PNGs for an installable app, the `.ico` for
    // the tab, and a squared touch icon for iOS. The expected size is read from
    // the `sizes` attribute the head itself declares, so this checks the *link*
    // and the *file* agree rather than comparing two hand-written lists.
    // Deduped: `favicon.ico` is declared twice on purpose — once as an icon with
    // its three sizes, once as `shortcut` — and the same file listed twice is not
    // two files.
    const iconUrls = [...new Set(head.icons.map((icon) => icon.href))];
    const expectedSize = Object.fromEntries(
      head.icons
        .filter((icon) => icon.sizes && /^\d+x\d+$/.test(icon.sizes))
        .map((icon) => [icon.href, Number(icon.sizes.split("x")[0])]),
    );

    const decoded = await cdp.evaluate(`(async () => {
        const want = ${JSON.stringify(iconUrls.concat(["/og.png"]))};
        const out = {};
        for (const path of want) {
          out[path] = await new Promise((done) => {
            const img = new Image();
            img.onload = () => done({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => done(null);
            img.src = path;
          });
        }
        return out;
      })()`);

    const wrongSize = head.icons
      .filter((icon, i) => head.icons.findIndex((o) => o.href === icon.href) === i)
      .filter((icon) => {
        const size = expectedSize[icon.href];
        const seen = decoded[icon.href];
        return !seen || (size && (seen.w !== size || seen.h !== size));
      });
    record(
      "every declared icon is a file that decodes at the size it claims",
      head.icons.length >= 4 && wrongSize.length === 0,
      head.icons
        .map((icon) => {
          const seen = decoded[icon.href];
          return `${icon.href} ${seen ? `${seen.w}x${seen.h}` : "MISSING"}`;
        })
        .join(" · "),
    );

    record(
      "the social card decodes at the size og:image advertises",
      decoded["/og.png"]?.w === 1200 && decoded["/og.png"]?.h === 630,
      decoded["/og.png"]
        ? `${decoded["/og.png"].w}x${decoded["/og.png"].h}`
        : "did not load",
    );

    record(
      "an apple-touch-icon is declared",
      head.icons.some((icon) => icon.rel === "apple-touch-icon"),
      head.icons.filter((i) => i.rel === "apple-touch-icon").map((i) => i.href).join(", ") ||
        "none",
    );

    // The route files, fetched rather than assumed. A `robots.txt` serving an
    // empty body with a 200 is exactly the shape a broken one takes, so the
    // content is what is asserted.
    const fetched = {};
    for (const path of [
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      fetched[path] = {
        status: res.status,
        type: (res.headers.get("content-type") ?? "").split(";")[0],
        body: await res.text(),
      };
    }

    const robots = fetched["/robots.txt"];
    const sitemap = fetched["/sitemap.xml"];
    const manifest = fetched["/manifest.webmanifest"];

    record(
      "robots.txt points crawlers at the sitemap",
      robots.status === 200 &&
        robots.body.includes(`Sitemap: ${ORIGIN}/sitemap.xml`),
      `${robots.status} ${robots.type} · ${robots.body.split("\n").length} lines`,
    );

    record(
      "the sitemap lists both routes at the real origin",
      sitemap.status === 200 &&
        sitemap.body.includes(`${ORIGIN}</loc>`) &&
        sitemap.body.includes(`${ORIGIN}/studio</loc>`),
      `${sitemap.status} ${sitemap.type}`,
    );

    // Parsed, not grepped: the icons list is the part that matters, and one that
    // names a file which does not exist is invisible in the JSON.
    let manifestIcons = [];
    try {
      manifestIcons = JSON.parse(manifest.body).icons ?? [];
    } catch {
      /* recorded below */
    }
    const manifestOk = await Promise.all(
      manifestIcons.map(async (icon) => {
        const res = await fetch(`${BASE}${icon.src}`);
        return res.status === 200 && res.headers.get("content-type")?.startsWith("image/");
      }),
    );
    record(
      "the web manifest names icons that are actually served",
      manifest.status === 200 &&
        manifestIcons.length >= 3 &&
        manifestIcons.every((_, i) => manifestOk[i]) &&
        JSON.parse(manifest.body).start_url === "/studio",
      `${manifestIcons.length} icons · ${manifestIcons.map((i) => i.src).join(", ")}`,
    );

    // The studio sets its own title in `app/studio/layout.tsx`, because its page
    // is a client component and cannot export metadata. Without it both routes
    // shared the homepage's `title.default`, so a search result for the studio
    // read as the landing page.
    const studioHtml = await (await fetch(`${BASE}/studio`)).text();
    const studioTitle = studioHtml.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    const studioMentions = (
      studioTitle.match(new RegExp(BRAND_NAME, "g")) ?? []
    ).length;
    record(
      "the studio route names itself once, and not as the homepage",
      studioTitle === `Studio · ${BRAND_NAME}` &&
        studioMentions === 1 &&
        studioTitle !== BRAND_TITLE,
      `"${studioTitle}"`,
    );

    /* ------------------------------------------------------------- studio */

    await cdp.goto(`${BASE}/studio`);
    await cdp.evaluate("localStorage.clear()");
    await cdp.goto(`${BASE}/studio`);

    /* ---- the shell: two columns, and the gallery scrolls in place ---- */

    const shell = await cdp.evaluate(`(() => {
        const list = document.querySelector('[data-slot="template-list"]');
        const editor = document.querySelector('[data-slot="studio-editor"]');
        const main = document.querySelector('main');
        const er = editor?.getBoundingClientRect();
        const cr = main?.getBoundingClientRect();
        const root = editor?.parentElement?.getBoundingClientRect();
        return {
          editor: !!editor,
          // Side by side, canvas on the left. Asserted as a *relationship*, since
          // the point of the two-column change is that these two no longer sit
          // above one another.
          sideBySide: !!cr && !!er && cr.right <= er.left + 1 && cr.width > 200,
          fullHeight: !!er && !!root && Math.abs(er.height - root.height) <= 1,
          canvasHeight: cr ? Math.round(cr.height) : 0,
          // The list must own its scrolling. If it overflowed the editor instead,
          // the observer below would be measuring the wrong root.
          listScrolls: list ? list.scrollHeight > list.clientHeight + 1 : false,
          overflow: list ? getComputedStyle(list).overflowY : 'none',
          initial: document.querySelectorAll('[data-slot="template-card"]').length,
          end: !!document.querySelector('[data-slot="template-end"]'),
        };
      })()`);

    record(
      "the studio is two columns: the canvas, and the editor beside it",
      shell.editor && shell.sideBySide && shell.fullHeight && shell.canvasHeight > 200,
      `editor full height=${shell.fullHeight} · canvas ${shell.canvasHeight}px · editor beside it=${shell.sideBySide}`,
    );

    record(
      "the look library scrolls in place inside the editor",
      shell.listScrolls && shell.overflow === "auto",
      `list overflow-y=${shell.overflow} · ${shell.initial} cards of a longer list`,
    );

    // The same two columns on a phone, stacked. Worth a check of its own because
    // this is where a two-column layout actually breaks: the canvas stops being
    // full-height, the editor takes the rest, and neither may overflow sideways.
    // The viewport is emulated rather than reasoned about — a breakpoint that
    // compiles to nothing looks identical to one that works.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      ...VIEWPORT,
      width: 414,
    });
    await sleep(350);
    const stacked = JSON.parse(
      await cdp.evaluate(`(() => {
        const main = document.querySelector('main').getBoundingClientRect();
        const editor = document.querySelector('[data-slot="studio-editor"]').getBoundingClientRect();
        return JSON.stringify({
          width: window.innerWidth,
          canvasAbove: main.bottom <= editor.top + 1,
          editorBelow: editor.top >= main.bottom - 1,
          // A repeat of the desktop claim, so the stacked case is not "working"
          // by pouring the editor off the side of the screen.
          sideBySide: main.right <= editor.left + 1,
          pageScrolls: document.documentElement.scrollWidth - window.innerWidth,
          canvasH: Math.round(main.height),
          editorH: Math.round(editor.height),
        });
      })()`),
    );
    await cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT);
    await sleep(350);

    record(
      "below the breakpoint the two columns stack instead",
      stacked.width <= 480 &&
        stacked.canvasAbove &&
        !stacked.sideBySide &&
        stacked.pageScrolls <= 1 &&
        stacked.canvasH > 100 &&
        stacked.editorH > 100,
      `${stacked.width}px: canvas ${stacked.canvasH}px above editor ${stacked.editorH}px · ` +
        `overflow-x ${stacked.pageScrolls}px`,
    );

    // The library is finite, so "infinite scroll" here means a first screenful
    // plus another batch each time the sentinel is reached — and it must stop
    // honestly rather than looping the library back on itself. Driving the real
    // scroll rather than faking it is the only way to check the observer is
    // wired to the right root, which is the mistake that would leave a list that
    // never grows.
    const scrolled = await cdp.evaluate(`(async () => {
        const list = document.querySelector('[data-slot="template-list"]');
        const count = () => document.querySelectorAll('[data-slot="template-card"]').length;
        const steps = [count()];
        for (let i = 0; i < 14; i++) {
          list.scrollTop = list.scrollHeight;
          await new Promise((r) => setTimeout(r, 260));
          const n = count();
          if (n === steps[steps.length - 1]) break;
          steps.push(n);
        }
        const cards = [...document.querySelectorAll('[data-slot="template-card"]')];
        return {
          steps,
          final: cards.length,
          end: !!document.querySelector('[data-slot="template-end"]'),
          endText: document.querySelector('[data-slot="template-end"]')?.innerText ?? '',
          // Nothing is gated any more, so the regression to watch for is a card
          // that is locked or priced rather than one that is missing.
          gated: cards.filter(
            (c) => c.dataset.locked === 'true' || /\\bpro\\b/i.test(c.innerText)
          ).length,
          // Read off the looks *section* rather than the gallery: the "all free"
          // claim moved into the section's summary row, where it stays visible
          // when the library is collapsed.
          freeFlag: /all free/i.test(
            document.querySelector('[data-slot="looks-panel"]')?.innerText ?? ''
          ),
          palettes: document.querySelectorAll('[data-slot="editor-palette"] button').length,
          colors: document.querySelectorAll('[data-slot="editor-color"]').length,
          fields: document.querySelectorAll('[data-slot="editor-field"] button').length,
          finishRows: [...document.querySelectorAll('[data-slot="editor-range"]')].map(
            (r) => r.dataset.row
          ),
        };
      })()`);

    record(
      "scrolling the list pages the whole library in",
      scrolled.steps.length > 1 &&
        scrolled.final > scrolled.steps[0] &&
        scrolled.end &&
        new RegExp(`All ${scrolled.final} looks shown`).test(scrolled.endText),
      `card count over ${scrolled.steps.length} screens: ${scrolled.steps.join(" → ")} · "${scrolled.endText}"`,
    );

    record(
      "every look is free, and the gallery says so",
      scrolled.gated === 0 && scrolled.freeFlag,
      `${scrolled.gated} gated cards of ${scrolled.final} · "all free" shown=${scrolled.freeFlag}`,
    );

    // The landing page's claim about the library, checked against the library the
    // gallery just paged through. Both are built from the same list, so the copy
    // and the set cannot drift apart — which is the failure a typed number here
    // would have hidden.
    record(
      "the landing page names the library the studio actually lists",
      landing.bodyText.includes(`${scrolled.final} looks`),
      `the page and the gallery both say ${scrolled.final} looks`,
    );

    // The levers, and the two that are deliberately absent: there is no shape
    // picker and no preset row, because the shapes are gone and a look *is* the
    // preset. A stale control would be the thing this catches.
    record(
      "the editor exposes every lever there is, and no other",
      scrolled.palettes === 12 &&
        scrolled.colors === 2 &&
        scrolled.fields === 4 &&
        scrolled.finishRows.join(",") === "shadow,grain",
      `${scrolled.palettes} palettes, ${scrolled.colors} colours, ${scrolled.fields} field modes, ` +
        `finish [${scrolled.finishRows.join(", ")}]`,
    );

    /* ---- the design panel is three tabs, and the recipes behind them ---- */

    // The panel used to be one column of every control, in the order it happened
    // to be written. Splitting it into tabs is only a redesign if the controls
    // inside still work, so each tab is opened and read — and both recipe rows are
    // *clicked* rather than counted, because a chip that lit up without writing
    // the document would look identical in a screenshot.
    //
    // The radius one is the interesting case: it has to reach the canvas, not just
    // the readout beside it, or the chip and the plate would disagree.
    const tabs = JSON.parse(
      await cdp.evaluate(`(async () => {
        const settle = () => new Promise((r) => setTimeout(r, 200));
        const triggers = () => [...document.querySelectorAll('[data-slot="tabs-trigger"]')];
        const open = async (id) => {
          const t = triggers().find((b) => b.dataset.tab === id);
          if (t) t.click();
          await settle();
        };

        const opened = {};
        for (const id of ['look', 'logo', 'finish']) {
          await open(id);
          const t = triggers().find((b) => b.dataset.tab === id);
          const panel = document.getElementById(t.getAttribute('aria-controls'));
          opened[id] = !!panel && !panel.hidden;
        }

        await open('look');
        const radii = [...document.querySelectorAll('[data-slot="editor-radius-recipes"] button')];
        radii.find((b) => b.textContent.trim() === 'Pill').click();
        await settle();

        await open('finish');
        const finishes = [...document.querySelectorAll('[data-slot="editor-finish-recipes"] button')];
        finishes.find((b) => b.textContent.trim() === 'Heavy').click();
        await settle();
        const rows = {};
        for (const r of document.querySelectorAll('[data-slot="editor-range"]')) {
          rows[r.dataset.row] = r.textContent.trim();
        }

        return JSON.stringify({
          labels: triggers().map((t) => t.textContent.trim()),
          opened,
          radii: radii.map((b) => b.textContent.trim()),
          readout: document.querySelector('[data-slot="radius-readout"]').textContent.trim(),
          canvasRadius: document.querySelector('[data-slot="canvas"]').dataset.radius,
          finishes: finishes.map((b) => b.textContent.trim()),
          rows,
        });
      })()`),
    );

    record(
      "the design panel is three tabs, and each opens onto its own controls",
      tabs.labels.length === 3 &&
        tabs.labels[0].startsWith("Look") &&
        tabs.labels[1].startsWith("Logo") &&
        tabs.labels[2].startsWith("Finish") &&
        tabs.opened.look &&
        tabs.opened.logo &&
        tabs.opened.finish,
      `${tabs.labels.length} tabs: ${tabs.labels.join(" | ")}`,
    );

    record(
      "a corner recipe writes the document, not just the chip",
      tabs.radii.join(",") === "Tight,Crisp,Reference,Round,Pill" &&
        tabs.readout === "300.00 u" &&
        tabs.canvasRadius === "300",
      `${tabs.radii.length} recipes [${tabs.radii.join(", ")}] · Pill → ${tabs.readout}, canvas data-radius=${tabs.canvasRadius}`,
    );

    record(
      "a finish recipe sets both values at once",
      tabs.finishes.join(",") === "Flat,Light,Soft,Lifted,Heavy" &&
        tabs.rows.shadow?.includes("0.80") &&
        tabs.rows.grain?.includes("0.16"),
      `${tabs.finishes.length} recipes · Heavy → shadow "${tabs.rows.shadow}", grain "${tabs.rows.grain}"`,
    );

    /* ---- editing has to write through to the artwork ---- */

    // The finish rows are read below, so the tab that holds them is opened: a
    // hidden panel reports no text at all.
    await openTab(cdp, "finish");

    const edit = JSON.parse(
      await cdp.evaluate(`(async () => {
        const previewSvg = () => document.querySelector('[data-slot="preview"] svg').outerHTML;
        const settle = () => new Promise((r) => setTimeout(r, 150));
        const before = previewSvg();

        // The third field, not the first: the document has to *move*, and
        // clicking the swatch it is already on would prove nothing.
        const swatches = [...document.querySelectorAll('[data-slot="editor-palette"] button')];
        swatches[2].click();
        await settle();
        const afterPalette = previewSvg();

        // The two colour pickers must now be showing that field's own pair.
        const colors = [...document.querySelectorAll('[data-slot="editor-color"]')]
          .map((input) => input.value.toLowerCase());

        // Every field mode has to produce a different plate. Checking only the
        // first click would pass on a control that re-tinted without changing
        // the gradient's kind, which is the whole of what a mode means.
        const modes = [...document.querySelectorAll('[data-slot="editor-field"] button')];
        const plates = new Set();
        for (const mode of modes) {
          mode.click();
          await settle();
          plates.add(previewSvg());
        }
        const modeActive = modes.filter(
          (b) => b.getAttribute('aria-pressed') === 'true'
        ).length;

        // The finish rows: both present, both reporting a real number, with the
        // shadow off while the plate is empty — it is cast by the artwork, and
        // none is loaded yet.
        const rows = [...document.querySelectorAll('[data-slot="editor-range"]')].map((r) => ({
          key: r.dataset.row,
          off: r.dataset.disabled,
          text: r.innerText.replace(/\s+/g, ' ').trim(),
        }));

        return JSON.stringify({
          paletteChanged: before !== afterPalette,
          colors,
          distinctPlates: plates.size,
          modeActive,
          rows,
        });
      })()`),
    );

    record(
      "picking a field writes through to the artwork and to both pickers",
      edit.paletteChanged &&
        edit.colors.length === 2 &&
        edit.colors.every((c) => /^#[0-9a-f]{6}$/.test(c)),
      `artwork changed=${edit.paletteChanged} · pickers [${edit.colors.join(", ")}]`,
    );

    record(
      "each field mode is its own plate, and exactly one reads as active",
      edit.distinctPlates >= 3 && edit.modeActive === 1,
      `${edit.distinctPlates} distinct plates from 4 modes · ${edit.modeActive} active`,
    );

    record(
      "the finish rows report their values, and shadow waits for artwork",
      edit.rows.length === 2 &&
        edit.rows[0].key === "shadow" &&
        edit.rows[0].off === "true" &&
        edit.rows[1].key === "grain" &&
        edit.rows[1].off === "false",
      edit.rows.map((r) => `${r.key}${r.off === "true" ? " (off)" : ""}: ${r.text}`).join(" · "),
    );

    /* ---- the safe-area guide must predict the export ---- */

    // Turn the Android guide on first. It is `Off` by default, so measuring the
    // overlay without selecting a platform would pass on a page that never drew
    // one — the guide has to be asked for before it can be judged.
    await cdp.evaluate(`(() => {
      // textContent again: the guide chips are capitalize, so innerText would
      // read "Android" and "OFF" while the source reads "Android" and "Off" —
      // a comparison against the source has to use the source.
      const android = [...document.querySelectorAll('[data-slot="preview"] button')]
        .find((b) => b.textContent.trim() === 'Android');
      android.click();
    })()`);
    await sleep(300);

    // This one does return a string: it builds its result with `JSON.stringify`
    // so it can report `false` for "no overlay" without the shape changing.
    const guide = JSON.parse(
      await cdp.evaluate(`(() => {
        const tile = () => document.querySelector('[data-slot="canvas"]');
        const mark = () => document.querySelector('[data-slot="preview"] svg [id$="-mk"]');
        const guideEl = () => document.querySelector('[data-slot="safe-area"]');

        const box = tile().getBoundingClientRect();
        const overlay = guideEl();
        if (!overlay) return JSON.stringify({ overlay: false });
        const rect = overlay.getBoundingClientRect();

        return JSON.stringify({
          overlay: true,
          ratio: rect.width / box.width,
          rounded: overlay.className.includes('rounded-full'),
          markTransform: mark()?.getAttribute('transform') ?? '',
          readout: document.querySelector('[data-slot="preview-readout"]').innerText,
        });
      })()`),
    );

    record(
      "the Android guide shows the platform's safe area and the fit it implies",
      // The `scale()` on the artwork group is *not* asserted here, because the
      // plate is still empty: the fit is computed either way, but there is
      // nothing yet for it to scale. That half of the claim is checked with a
      // file loaded, in the upload section below.
      guide.overlay &&
        Math.abs(guide.ratio - 66 / 108) < 0.01 &&
        guide.rounded &&
        // Case-insensitive: the readout's labels are `uppercase`, so `innerText`
        // hands back "EXPORT FIT".
        /export fit 0\./i.test(guide.readout.replace(/\s+/g, " ")),
      guide.overlay
        ? `overlay ${(guide.ratio * 100).toFixed(1)}% (66/108 = 61.1%) · reporting the fit`
        : "no overlay",
    );

    // Turning the guide off must remove both the overlay and the fit, or the
    // preview would keep shrinking artwork for a platform nobody selected.
    const guideOff = await cdp.evaluate(`(() => {
        const off = [...document.querySelectorAll('[data-slot="preview"] button')]
          .find((b) => b.textContent.trim() === 'Off');
        off.click();
        return 'clicked';
      })()`);

    await sleep(300);

    const cleared = JSON.parse(
      await cdp.evaluate(`(() => JSON.stringify({
        overlay: !!document.querySelector('[data-slot="safe-area"]'),
        mark: document.querySelector('[data-slot="preview"] svg [id$="-mk"]')?.getAttribute('transform') ?? '',
      }))()`),
    );

    record(
      "turning the guide off clears the overlay and the fit",
      guideOff === "clicked" && !cleared.overlay && !/scale\(/.test(cleared.mark),
      `overlay=${cleared.overlay} transform="${cleared.mark}"`,
    );

    /* ---- the canvas: nothing clipped, and a shape toggle that means it ---- */

    // The corners of the plate are sampled out of a real rasterization, because
    // "is anything hidden?" is a question about pixels, not about classes. A
    // transparent corner in Canvas mode would mean the preview was cropping
    // artwork the export keeps.
    const CORNER_HELPER = `
      async function cornerAlpha(svgEl, S = 120) {
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgEl.outerHTML);
        const img = await new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = () => rej(new Error('raster failed'));
          i.src = url;
        });
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, S, S);
        ctx.drawImage(img, 0, 0, S, S);
        const d = ctx.getImageData(0, 0, S, S).data;
        const at = (x, y) => d[(y * S + x) * 4 + 3];
        return [at(0, 0), at(S - 1, 0), at(0, S - 1), at(S - 1, S - 1)];
      }
      function plateEdges() {
        const el = document.querySelector('[data-slot="canvas"]');
        const inner = el.firstElementChild;
        const svg = el.querySelector('svg');
        const box = el.getBoundingClientRect();
        const art = svg.getBoundingClientRect();
        return {
          shape: el.dataset.shape,
          // The wrapper's own radius, which has to stay 0: the plate's corners are
          // cut inside the SVG now, so a CSS radius here would be a second, silently
          // disagreeing clip — one the export would not have.
          radius: getComputedStyle(inner).borderRadius,
          // How much canvas is left uncovered on each side, in CSS pixels.
          gaps: [art.left - box.left, art.top - box.top, box.right - art.right, box.bottom - art.bottom]
            .map((v) => Math.round(v * 10) / 10),
        };
      }
    `;

    const squareCanvas = JSON.parse(
      await cdp.evaluate(`(async () => {
        ${CORNER_HELPER}
        return JSON.stringify({
          ...plateEdges(),
          corners: await cornerAlpha(document.querySelector('[data-slot="canvas"] svg')),
        });
      })()`),
    );

    record(
      "the canvas is shown uncropped, to all four edges",
      squareCanvas.shape === "square" &&
        squareCanvas.radius === "0px" &&
        squareCanvas.gaps.every((g) => Math.abs(g) < 0.5) &&
        squareCanvas.corners.every((a) => a === 255),
      `shape=${squareCanvas.shape} radius=${squareCanvas.radius} gaps=[${squareCanvas.gaps.join(", ")}] cornerAlpha=[${squareCanvas.corners.join(",")}]`,
    );

    // And the toggle has to actually do something: rounded mode is the same
    // artwork wearing the document's radius, so the corners go transparent and
    // come back. The chip's label carries its radius, hence `startsWith`.
    await cdp.evaluate(`(() => {
      [...document.querySelectorAll('[data-slot="preview"] button')]
        .find((b) => b.textContent.trim().startsWith('Rounded')).click();
    })()`);
    await sleep(300);

    const squircleCanvas = JSON.parse(
      await cdp.evaluate(`(async () => {
        ${CORNER_HELPER}
        return JSON.stringify({
          ...plateEdges(),
          corners: await cornerAlpha(document.querySelector('[data-slot="canvas"] svg')),
        });
      })()`),
    );

    await cdp.evaluate(`(() => {
      [...document.querySelectorAll('[data-slot="preview"] button')]
        .find((b) => b.textContent.trim() === 'Canvas').click();
    })()`);
    await sleep(250);
    const backToSquare = await cdp.evaluate(
      `document.querySelector('[data-slot="canvas"]').dataset.shape`,
    );

    // Two halves, and the second is the redesigned one. The corners going
    // transparent says the rounding happened at all; `radius === "0px"` on the
    // wrapper says *where* it happened — inside the plate's own path, at the
    // document's radius, so the preview and the downloaded SVG cut the same corner.
    // A CSS radius would have passed the old version of this check and quietly
    // disagreed with the file.
    record(
      "the corner toggle rounds the plate itself rather than clipping it",
      squircleCanvas.shape === "rounded" &&
        squircleCanvas.radius === "0px" &&
        squircleCanvas.corners.every((a) => a === 0) &&
        backToSquare === "square",
      `rounded wrapper radius=${squircleCanvas.radius} cornerAlpha=[${squircleCanvas.corners.join(",")}] · toggled back to ${backToSquare}`,
    );

    /* ---- the canvas: the largest square that fits, and where it sits ---- */

    // Two things are asserted together because they are the same claim: the plate
    // is square, and it is inside the stage on every edge. `aspect-ratio` alone
    // cannot express "the largest square that fits" — a square capped by
    // max-height stops being square — so this is the check that the container
    // query actually did the job.
    const geometry = JSON.parse(
      await cdp.evaluate(`(() => {
        const plate = document.querySelector('[data-slot="canvas"]');
        const stage = document.querySelector('[data-slot="canvas-stage"]');
        const view = document.querySelector('[data-slot="canvas-viewbar"]');
        const status = document.querySelector('[data-slot="canvas-status"]');
        const p = plate.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        return JSON.stringify({
          w: Math.round(p.width),
          h: Math.round(p.height),
          // Gaps from the plate to the stage's content box on each side.
          gaps: [
            Math.round(p.left - s.left),
            Math.round(p.top - s.top),
            Math.round(s.right - p.right),
            Math.round(s.bottom - p.bottom),
          ],
          // Style, not geometry: a plate inside a Card would still measure square.
          card: !!plate.closest('[class*="rounded-xl"]'),
          underView: p.top >= view.getBoundingClientRect().bottom - 1,
          aboveStatus: p.bottom <= status.getBoundingClientRect().top + 1,
        });
      })()`),
    );

    record(
      "the canvas is the largest square that fits the whole column",
      Math.abs(geometry.w - geometry.h) <= 1 &&
        geometry.w > 240 &&
        geometry.gaps.every((g) => g >= 0) &&
        geometry.underView &&
        geometry.aboveStatus,
      `${geometry.w}×${geometry.h} in a stage with gaps [${geometry.gaps.join(", ")}] · ` +
        `below the view bar=${geometry.underView} · above the status bar=${geometry.aboveStatus}`,
    );

    /* ---- legibility, on demand: the Preview toggle ---- */

    // Three rendered plates are worth the height when you are judging legibility
    // and are clutter when you are placing a logo, so they are off until asked
    // for — and the toggle has to actually move them, in both directions.
    const strip = JSON.parse(
      await cdp.evaluate(`(async () => {
        const settle = () => new Promise((r) => setTimeout(r, 260));
        const toggle = () => document.querySelector('[data-slot="preview-toggle"]');
        const read = () => {
          const samples = [...document.querySelectorAll('[data-slot="size-sample"]')];
          return {
            count: samples.length,
            declared: samples.map((s) => Number(s.dataset.size)),
            measured: samples.map((s) => Math.round(s.getBoundingClientRect().width)),
            painted: samples.length > 0 && samples.every((s) => !!s.querySelector('svg path')),
            expanded: toggle().getAttribute('aria-expanded'),
            // Docked above the status bar rather than floating over the plate.
            docked: samples.length
              ? samples[0].closest('[data-slot="size-strip"]').getBoundingClientRect().bottom <=
                document.querySelector('[data-slot="canvas-status"]').getBoundingClientRect().top + 1
              : false,
          };
        };
        const before = read();
        toggle().click();
        await settle();
        const after = read();
        toggle().click();
        await settle();
        const back = read();
        return JSON.stringify({ before, after, back });
      })()`),
    );

    record(
      "the Preview toggle shows the icon at real home-screen sizes",
      strip.before.count === 0 &&
        strip.before.expanded === "false" &&
        strip.after.count === 3 &&
        strip.after.painted &&
        strip.after.docked &&
        strip.after.declared.join(",") === "180,120,60" &&
        strip.after.declared.every((d, i) => Math.abs(d - strip.after.measured[i]) <= 1) &&
        strip.back.count === 0 &&
        strip.back.expanded === "false",
      `closed (${strip.before.count}) → open (${strip.after.count} at ` +
        `${strip.after.measured.join("/")}px, docked=${strip.after.docked}) → closed (${strip.back.count})`,
    );

    /* ---- export: the header popover, per-target downloads and the SVG copy ---- */

    // The panel moved out of the scrolling column and behind a header button, so
    // it has to be *opened* before anything inside it exists — a closed popover is
    // unmounted rather than hidden, and a check that read the DOM regardless would
    // pass against a trigger wired to nothing.
    const openExport = async () => {
      await cdp.evaluate(`(() => {
        const t = document.querySelector('[data-slot="export-trigger"]');
        if (!t) return;
        if (!document.querySelector('[data-slot="export-panel"]')) t.click();
      })()`);
      await sleep(300);
    };
    const closeExport = async () => {
      await cdp.evaluate(`(() => {
        const c = document.querySelector('[data-slot="popover-content"]');
        if (c) document.querySelector('[data-slot="export-trigger"]').click();
      })()`);
      await sleep(300);
    };

    const beforeOpen = await cdp.evaluate(
      `!!document.querySelector('[data-slot="export-panel"]')`,
    );
    await openExport();
    const afterOpen = await cdp.evaluate(`(() => ({
      panel: !!document.querySelector('[data-slot="export-panel"]'),
      expanded: document.querySelector('[data-slot="export-trigger"]')?.getAttribute('aria-expanded'),
      inHeader: !!document.querySelector('header [data-slot="export-trigger"]'),
      // The panel is portaled out of the document flow, so this is the claim that
      // it left the scrolling column rather than merely also appearing up top.
      stillInColumn: !!document.querySelector('main [data-slot="export-panel"]'),
    }))()`);

    record(
      "the export panel hangs off a button in the header",
      !beforeOpen &&
        afterOpen.panel &&
        afterOpen.inHeader &&
        afterOpen.expanded === "true" &&
        !afterOpen.stillInColumn,
      `closed → ${beforeOpen ? "panel already mounted" : "no panel"} · open → ` +
        `panel=${afterOpen.panel} aria-expanded=${afterOpen.expanded} · ` +
        `still in the Design column=${afterOpen.stillInColumn}`,
    );

    const copyButtons = await cdp.evaluate(`(() => ({
      perTarget: document.querySelectorAll('[data-slot="export-target"] button[aria-label^="Download"]').length,
      targets: document.querySelectorAll('[data-slot="export-target"]').length,
    }))()`);

    // Four, named rather than merely non-zero: the count used to be asserted by
    // the editor-lever check, which no longer has the panel in view.
    record(
      "every export target can be taken on its own",
      copyButtons.perTarget === copyButtons.targets && copyButtons.targets === 4,
      `${copyButtons.perTarget} per-target buttons across ${copyButtons.targets} rows`,
    );

    // The clipboard is granted explicitly: without it the write rejects and the
    // check would be testing the browser's permission prompt, not our button.
    await cdp.send("Browser.grantPermissions", {
      origin: BASE,
      // `clipboardWrite` is not a CDP permission type; read-write plus
      // sanitized-write is the pair that actually covers both calls.
      permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
    });

    // An artwork first, because the bug this section exists for is invisible
    // without one: the copy used to be checked on an empty plate, where a missing
    // logo and a correctly empty one look exactly alike.
    const copyFile = await pngFile({ width: 96, height: 96 });
    const copyDoc = await cdp.send("DOM.getDocument", { depth: 1 });
    const copyInput = await cdp.send("DOM.querySelector", {
      nodeId: copyDoc.root.nodeId,
      selector: '[data-slot="artwork-input"]',
    });
    await cdp.send("DOM.setFileInputFiles", {
      nodeId: copyInput.nodeId,
      files: [copyFile.path],
    });
    await sleep(800);

    // Clicked with a real mouse event rather than `element.click()`. A clipboard
    // write needs transient user activation, and a synthetic click is not
    // trusted input — so `element.click()` here would prove only that the
    // browser refuses untrusted callers, not that the button works.
    const copyAt = JSON.parse(
      await cdp.evaluate(`(() => {
        const el = document.querySelector('[data-slot="export-copy"]');
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return JSON.stringify({
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
        });
      })()`),
    );
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await cdp.send("Input.dispatchMouseEvent", {
        type,
        x: copyAt.x,
        y: copyAt.y,
        button: "left",
        buttons: type === "mousePressed" ? 1 : 0,
        clickCount: 1,
      });
    }
    await sleep(600);

    const copied = await cdp.evaluate(`(async () => {
        try {
          return await navigator.clipboard.readText();
        } catch (error) {
          return 'ERROR: ' + error.message;
        }
      })()`);

    // What the artwork's own href is, straight off the canvas, so "the logo is in
    // the file" is checked against the bytes the studio is actually drawing. Read
    // as the un-prefixed attribute, which is the one a DOM lookup can be sure of:
    // a namespaced `xlink:href` needs `getAttributeNS`, and this only has to prove
    // the same bytes are in both places.
    const artHref = await cdp.evaluate(
      `document.querySelector('[data-slot="canvas"] svg image')?.getAttribute('href') ?? ''`,
    );
    const copyShape = typeof copied === "string" && copied.startsWith("<svg")
      ? {
          image: copied.includes(artHref) && artHref.length > 0,
          xlinkNs: /xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/.test(copied),
          xlinkRefs: (copied.match(/xlink:href="#/g) ?? []).length,
          rounded: /clip-path="url\(#[^)]+-canvas\)"/.test(copied),
        }
      : {};

    record(
      "Copy SVG puts the design master, logo included, on the clipboard",
      typeof copied === "string" &&
        copied.startsWith("<svg") &&
        copied.includes('width="1024"') &&
        copied.includes("viewBox=\"0 0 1024 1024\"") &&
        copyShape.image &&
        copyShape.rounded,
      typeof copied === "string"
        ? `${copied.length} chars · logo embedded=${copyShape.image} · corners kept=${copyShape.rounded}`
        : "no clipboard text",
    );

    // The bug that started this: SVG 2's plain `href` renders in every browser and
    // in *some* importers, so a copied SVG pasted into a design tool arrived with
    // the plate and no logo in it. Both forms are asserted, because emitting one is
    // exactly what shipped.
    record(
      "the copied SVG is readable by an importer, not only by a browser",
      copyShape.xlinkNs === true && copyShape.xlinkRefs === 3,
      `xmlns:xlink=${copyShape.xlinkNs} · xlink:href refs=${copyShape.xlinkRefs} (body + 2 shadow passes)`,
    );

    // Closed again before anything below drives the canvas with a real pointer: an
    // open popover sits over the page, and a drag aimed at a handle would land on
    // the panel instead.
    await closeExport();
    const closed = await cdp.evaluate(
      `!!document.querySelector('[data-slot="export-panel"]')`,
    );
    record(
      "closing the export popover puts the canvas back",
      !closed,
      `panel mounted after closing=${closed}`,
    );

    // The plate was emptied so the rest of the run starts from no artwork, which is
    // the state every check below was written against.
    await cdp.evaluate(`document.querySelector('[data-slot="artwork-remove"]').click()`);
    await sleep(400);

    /* ---- shuffle: a different template, and a clean document ---- */

    const shuffled = await cdp.evaluate(`(async () => {
        const title = () => document.querySelector('[data-slot="studio-title"]').innerText.trim();
        // Selected by slot rather than by label. Both of these were found by their
        // text until now, which is the kind of selector that breaks for reasons
        // unrelated to the check: the reset button's own title changes with the
        // document's state, and the chip row taught this suite that a capitalize
        // utility rewrites innerText out from under an exact match.
        const reset = () => document.querySelector('[data-slot="looks-reset"]');
        const before = { title: title(), resetDisabled: reset().disabled };
        document.querySelector('[data-slot="looks-shuffle"]').click();
        await new Promise((r) => setTimeout(r, 250));
        return {
          before,
          after: { title: title(), resetDisabled: reset().disabled },
        };
      })()`);

    record(
      "shuffle loads a different template, never a repeat",
      shuffled.before.title !== shuffled.after.title,
      `${shuffled.before.title} → ${shuffled.after.title}`,
    );

    // Landing on the template's *own* document is the part that would silently
    // break: shuffling into someone else's edits would look like a template and
    // reset would refuse to do anything about it.
    record(
      "shuffle arrives unedited, so reset has nothing to discard",
      shuffled.after.resetDisabled,
      `reset disabled after shuffle=${shuffled.after.resetDisabled} (was ${shuffled.before.resetDisabled})`,
    );

    /* ---- search filters the scrollable list ---- */

    // The term comes off the first card rather than being typed here. The library
    // gets renamed, and a hardcoded word turns this into a test of the copy: the
    // one it replaces looked for "blob" long after every look had been renamed, so
    // it failed while the filter worked perfectly. A card's own name is guaranteed
    // to match it, and a name is specific enough that the list has to narrow.
    const searchTerm = (
      await cdp.evaluate(
        `(document.querySelector('[data-slot="template-card"]')?.innerText.split(String.fromCharCode(10))[0] ?? '')`,
      )
    ).trim();

    const search = await cdp.evaluate(`(async () => {
        const input = document.querySelector('[data-slot="template-search"]');
        // React owns the input's value, so assigning input.value directly is
        // invisible to it. The prototype setter plus a bubbling input event is
        // what actually reaches the store.
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, 'value').set;
        const type = async (text) => {
          setter.call(input, text);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 300));
        };
        const cards = () => [...document.querySelectorAll('[data-slot="template-card"]')];
        // A card matches on its name *or* its blurb, and the blurb is only an
        // attribute — so a soundness assertion has to read both.
        const text = (c) => (c.getAttribute('title') ?? '') + ' ' + c.innerText;
        await type(${JSON.stringify(searchTerm)});
        const matched = cards().map((c) => c.dataset.templateId).sort();
        const haystacks = cards().map(text).map((t) => t.toLowerCase());
        const endText = document.querySelector('[data-slot="template-end"]')?.innerText ?? '';
        await type('nothing-matches-this-at-all');
        const empty = !!document.querySelector('[data-slot="template-empty"]');
        await type('');
        return { matched, haystacks, endText, empty, restored: cards().length };
      })()`);

    record(
      "search narrows the library to what it can match",
      search.matched.length > 0 &&
        search.matched.length < scrolled.final &&
        search.haystacks.every((t) => t.includes(searchTerm.toLowerCase())) &&
        search.endText === `All ${search.matched.length} looks shown`,
      `"${searchTerm}" → ${search.matched.length} of ${scrolled.final} looks · "${search.endText}"`,
    );

    record(
      "an empty search says so, and clearing it restores the list",
      search.empty && search.restored === shell.initial && shell.initial > 0,
      `empty state shown=${search.empty} · clearing returned ${search.restored} cards, matching a fresh first screen (${shell.initial})`,
    );

    /* ---- light mode: the switcher in the studio header, not just a class ---- */

    const theme = await cdp.evaluate(`(async () => {
        const radios = [...document.querySelectorAll('[data-slot="studio-theme"] [role="radio"]')];
        const byLabel = (name) => radios.find((r) => r.getAttribute('aria-label') === name);
        // Chrome hands computed colours back as oklch(...) here, and also
        // preserves the function form in a canvas fillStyle, so there is no
        // hex to read. The colour is reduced to a 0-1 lightness instead, which
        // is the one number both serializations agree on.
        const lightness = (color) => {
          const nums = color
            .slice(color.indexOf('(') + 1)
            .split(/[ ,]+/)
            .filter(Boolean)
            .map(Number);
          if (color.startsWith('oklch')) return nums[0];
          if (color.startsWith('rgb'))
            return nums.slice(0, 3).reduce((a, b) => a + b, 0) / 765;
          return -1;
        };
        const read = () => ({
          dark: document.documentElement.classList.contains('dark'),
          scheme: getComputedStyle(document.documentElement).colorScheme,
          /* The --background token is deliberately not read: whatever
             serialization arrives, the assertion below reduces the rendered
             colour to a lightness instead of parsing a token string.
              .getPropertyValue('--background').match(/[\d.]+/)?.[0] ?? 'NaN'),
          */
          bg: getComputedStyle(document.body).backgroundColor,
          lightness: lightness(getComputedStyle(document.body).backgroundColor),
        });
        const pick = async (name) => {
          byLabel(name).click();
          await new Promise((r) => setTimeout(r, 250));
          return read();
        };
        const light = await pick('Light');
        const dark = await pick('Dark');
        const system = await pick('System');
        return {
          labels: radios.map((r) => r.getAttribute('aria-label')),
          checked: radios.filter((r) => r.getAttribute('aria-checked') === 'true')
            .map((r) => r.getAttribute('aria-label')),
          light,
          dark,
          system,
        };
      })()`);

    // A flipped class alone would prove nothing — a theme can toggle a class and
    // render nothing. The channel sums of the real body colour show the page
    // actually changed, in both directions.
    record(
      "the studio theme switcher really changes the studio",
      theme.labels.length === 3 &&
        theme.light.dark === false &&
        theme.light.scheme === "light" &&
        theme.dark.dark === true &&
        theme.dark.scheme === "dark" &&
        theme.light.lightness > 0.8 &&
        theme.dark.lightness < 0.3 &&
        theme.checked.join(",") === "System",
      `light ${theme.light.bg} (l=${theme.light.lightness}) · dark ${theme.dark.bg} (l=${theme.dark.lightness}) · back on ${theme.checked.join(",")}`,
    );

    /* ---- a pick from the wall lands in the studio ---- */

    // A template id that does not exist must be ignored rather than throwing
    // from inside the render — the id comes off a URL anyone can type.
    // Compared against wherever the studio already was rather than against a
    // fixed name: the session record restores the template you were last working
    // from, so which template that is is not this check's business. "Nothing
    // changed" is the invariant, and it holds wherever the studio opens.
    const beforeUnknown = await cdp.evaluate(
      `document.querySelector('[data-slot="studio-title"]')?.innerText ?? ''`,
    );
    await cdp.goto(`${BASE}/studio?template=not-a-template`);
    await sleep(400);
    const unknownPick = JSON.parse(
      await cdp.evaluate(`(() => JSON.stringify({
        title: document.querySelector('[data-slot="studio-title"]')?.innerText ?? '',
        cards: document.querySelectorAll('[data-slot="template-card"]').length,
      }))()`),
    );
    record(
      "an unknown template in the query string is ignored, not crashed on",
      unknownPick.cards > 0 &&
        !!beforeUnknown &&
        unknownPick.title === beforeUnknown,
      `stayed on "${unknownPick.title.replace(/\s+/g, " ").trim()}" with ${unknownPick.cards} cards`,
    );

    // A real pick: the tile is clicked on the landing page rather than its href
    // being typed here, because "the wall opens the look" is a claim about the link
    // a visitor actually presses. The look and its display name are read *off the
    // tile*, so renaming the library cannot make this stale — and comparing the
    // header against the tile's own name is what proves the studio opened the look
    // rather than merely something whose id matched.
    await cdp.goto(`${BASE}/`);
    await sleep(500);
    const wallTile = JSON.parse(
      await cdp.evaluate(`(() => {
        const a = document.querySelector('[data-slot="sample-wall-tile"]');
        return JSON.stringify({
          look: a?.getAttribute('data-look') ?? '',
          name: (a?.getAttribute('aria-label') ?? '')
            .replace(' look, shown with a sample logo', ''),
        });
      })()`),
    );
    await cdp.evaluate(`document.querySelector('[data-slot="sample-wall-tile"]').click()`);
    await sleep(900);
    const pickedAfter = JSON.parse(
      await cdp.evaluate(`(() => {
        const card = document.querySelector(
          '[data-slot="template-card"][data-template-id="${wallTile.look}"]');
        return JSON.stringify({
          // The look's name lives in the header now: the canvas card's title is the
          // static word "Design", so reading the first card-title would have
          // reported "Design" and passed for the wrong reason.
          title: document.querySelector('[data-slot="studio-title"]')?.innerText ?? '',
          active: card ? card.className.includes('ring-ring') : false,
          url: location.search,
        });
      })()`),
    );

    record(
      "a wall pick opens that template in the studio",
      pickedAfter.active &&
        pickedAfter.title.trim() === wallTile.name.trim() &&
        pickedAfter.url.includes(wallTile.look),
      `clicked "${wallTile.name}" → header "${pickedAfter.title.replace(/\s+/g, " ").trim()}" active=${pickedAfter.active}`,
    );

    /* ---- palette colours are editable one at a time ---- */

    // Back to Look: the pickers and the "custom palette" note both live there, and
    // the note is read as text.
    await openTab(cdp, "look");

    // The document is deliberately not persisted (the render is deterministic,
    // and a persisted one could disagree with the server's first paint), so the
    // markup and the controls are the only witnesses to what the store holds.
    const tinted = JSON.parse(
      await cdp.evaluate(`(async () => {
        const field = document.querySelector('[data-slot="editor-color"][data-role="bg"]');
        const setHex = (el, hex) => {
          // React owns the value, so assigning it directly is invisible to the
          // store. The prototype setter plus a bubbling input event is what
          // actually reaches it.
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
            .set.call(el, hex);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const pressed = () => [...document.querySelectorAll('[data-slot="editor-palette"] button')]
          .filter((b) => b.getAttribute('aria-pressed') === 'true').length;
        const before = pressed();
        setHex(field, '#0b1220');
        await new Promise((r) => setTimeout(r, 300));
        const svg = document.querySelector('[data-slot="canvas"] svg').outerHTML;
        return JSON.stringify({
          before,
          after: pressed(),
          kept: field.value,
          inMarkup: svg.toLowerCase().includes('#0b1220'),
          roles: [...document.querySelectorAll('[data-slot="editor-color"]')]
            .map((i) => i.dataset.role),
          note: document.querySelector('[data-slot="editor-colors"]')
            ?.parentElement?.innerText ?? '',
        });
      })()`),
    );

    record(
      "a single palette colour can be overridden",
      tinted.before === 1 &&
        tinted.after === 0 &&
        tinted.kept === "#0b1220" &&
        tinted.inMarkup,
      `swatch row ${tinted.before} pressed → ${tinted.after} · picker=${tinted.kept} · in markup=${tinted.inMarkup}`,
    );

    // Overriding one colour has to leave the other one alone, and the row has to
    // say the palette is now custom rather than silently reporting a match.
    record(
      "overriding one colour leaves the rest, and the row admits it",
      tinted.roles.join(",") === "bg,bg2" &&
        /custom palette/i.test(tinted.note),
      `roles ${tinted.roles.join("/")} · "${tinted.note.replace(/\s+/g, " ").slice(0, 46)}"`,
    );

    /* ---- your own artwork: picked, embedded, and never uploaded ---- */

    // The picker and the artwork's name both live in the Logo tab, and the name is
    // read back as text — so the tab is opened before anything is picked.
    await openTab(cdp, "logo");

    // A real PNG through a real file input. The fixture is generated rather than
    // vendored so it is genuinely opaque and square — square being the worst case
    // for Android's circular safe area, and opaque being what the corner sampling
    // below needs in order to mean anything.
    const { path: uploadPath } = await pngFile({
      width: 96,
      height: 96,
      rgb: [34, 197, 94],
    });

    await cdp.send("DOM.enable");
    const doc = await cdp.send("DOM.getDocument", { depth: 1 });
    const fileInput = await cdp.send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: '[data-slot="artwork-input"]',
    });
    // `setFileInputFiles` is the only way to do this: a synthetic click cannot
    // populate a file input, so a mocked path would prove nothing about whether
    // the app can actually read the bytes.
    await cdp.send("DOM.setFileInputFiles", {
      nodeId: fileInput.nodeId,
      files: [uploadPath],
    });
    await sleep(1200);

    const uploaded = JSON.parse(
      await cdp.evaluate(`(() => {
        const svg = document.querySelector('[data-slot="canvas"] svg');
        const hrefs = [...svg.querySelectorAll('[href]')].map((n) => n.getAttribute('href'));
        const ranges = [...document.querySelectorAll('[data-slot="editor-range"]')];
        return JSON.stringify({
          name: document.querySelector('[data-slot="artwork-name"]')?.innerText ?? '',
          imageHref: svg.querySelector('image')?.getAttribute('href')?.slice(0, 22) ?? null,
          // Anything not internal or inline would be a fetch — an upload that
          // merely looks embedded. This is the whole promise of the control.
          foreign: hrefs.filter((h) => !h.startsWith('#') && !h.startsWith('data:')),
          // Three references: the body that draws the artwork, plus the two
          // shadow passes. Two means it is only being blurred.
          mkUses: svg.querySelectorAll('use[href$="-mk"]').length,
          // The shadow is cast by the artwork, so it is the one row that goes off
          // while the plate is empty and comes back when a file is loaded. Grain
          // was never off: it is a texture on the plate, not on the mark.
          off: ranges.filter((r) => r.dataset.disabled === 'true')
            .map((r) => r.dataset.row),
          live: ranges.filter((r) => r.dataset.disabled === 'false')
            .map((r) => r.dataset.row),
        });
      })()`),
    );

    record(
      "a picked file becomes the mark, embedded as a data URL",
      uploaded.imageHref?.startsWith("data:image/png;base64,") &&
        uploaded.foreign.length === 0 &&
        /upload\.png/.test(uploaded.name),
      `${uploaded.name} · href ${uploaded.imageHref} · foreign refs=[${uploaded.foreign.join(",")}]`,
    );

    // The bug this is here to catch shipped: the image was spliced into the
    // document's definitions and referenced only by the shadow passes, so the
    // artwork rendered as two faint blurs at 0.15 and 0.08 opacity while the
    // markup still looked complete.
    record(
      "the uploaded artwork is drawn, not only blurred",
      uploaded.mkUses === 3,
      `${uploaded.mkUses} references to the mark group (body + 2 shadow passes)`,
    );

    // Only the shadow moves with the artwork — and only the shadow, because grain
    // is a texture on the plate rather than on what sits on it. Both rows must be
    // live once a file is loaded, which is the half that "nothing is off" alone
    // would not catch: an editor that switched everything off would pass that.
    record(
      "the shadow waits for artwork, and grain never does",
      uploaded.off.length === 0 && uploaded.live.join(",") === "shadow,grain",
      `off: ${uploaded.off.join(",") || "none"} · live: ${uploaded.live.join(",")}`,
    );

    // The artwork has to reach the corners of its box, or the export the user
    // downloads is not the one they were shown.
    const uploadInk = JSON.parse(
      await cdp.evaluate(`(async () => {
        ${INK_HELPER}
        const svg = document.querySelector('[data-slot="canvas"] svg');
        const ink = await inkCoverage(svg, 120);
        return JSON.stringify({ ink });
      })()`),
    );
    record(
      "the uploaded artwork really paints onto the canvas",
      uploadInk.ink > 0.02,
      `ink coverage ${uploadInk.ink.toFixed(4)}`,
    );

    /* ---- and where it sits: the pad beside the drag ---- */

    // The drag on the canvas and the pad in the panel write the same offset, so
    // this checks the pad — the half that has numbers. It reads the canvas's own
    // `data-offset-*`, not the SVG, because the point of the pad is that every
    // press is an exact, stated distance rather than however far a pointer moved.
    const nudged = JSON.parse(
      await cdp.evaluate(`(async () => {
        const settle = () => new Promise((r) => setTimeout(r, 150));
        const canvas = () => document.querySelector('[data-slot="canvas"]');
        const readout = () => document.querySelector('[data-slot="position-readout"]').textContent.trim();
        const before = { x: canvas().dataset.offsetX, readout: readout() };

        const press = async (dx) => {
          const b = [...document.querySelectorAll('[data-slot="position-nudge"]')]
            .find((n) => n.dataset.dx === String(dx) && n.dataset.dy === '0');
          b.click();
          await settle();
        };

        await press(8);
        await press(8);
        const moved = { x: canvas().dataset.offsetX, y: canvas().dataset.offsetY, readout: readout() };

        const centre = document.querySelector('[data-slot="position-centre"]');
        const offerredWhileMoved = !centre.disabled;
        centre.click();
        await settle();
        const back = {
          x: canvas().dataset.offsetX,
          y: canvas().dataset.offsetY,
          readout: readout(),
          offeredWhileCentred: !centre.disabled,
        };

        return JSON.stringify({ before, moved, back, offerredWhileMoved });
      })()`),
    );

    record(
      "the position pad nudges in exact steps, and offers the way back",
      nudged.before.readout === "Centred" &&
        nudged.before.x === "0" &&
        nudged.moved.x === "16" &&
        nudged.moved.y === "0" &&
        nudged.moved.readout === "16, 0" &&
        nudged.offerredWhileMoved &&
        nudged.back.x === "0" &&
        nudged.back.y === "0" &&
        nudged.back.readout === "Centred" &&
        !nudged.back.offeredWhileCentred,
      `Centred → ${nudged.moved.readout} (data-offset-x=${nudged.moved.x}) → ${nudged.back.readout}`,
    );

    /* ---- and how big: a corner handle, and the size control ---- */

    // The handle is a pointer gesture, so it is driven as one. `element.click()`
    // would bypass exactly the arithmetic under test. The drag is pushed 1.5×
    // farther from the mark's centre along the same diagonal, so the scale it
    // should produce is 1.5 — a number the geometry predicts rather than one this
    // check reads back and compares to itself.
    const resize = JSON.parse(
      await cdp.evaluate(`(() => {
        const canvas = document.querySelector('[data-slot="canvas"]');
        const c = canvas.getBoundingClientRect();
        const handle = document.querySelector('[data-slot="mark-handle"][data-corner="se"]');
        const h = handle.getBoundingClientRect();
        const from = { x: Math.round(h.left + h.width / 2), y: Math.round(h.top + h.height / 2) };
        const cx = c.left + c.width / 2;
        const cy = c.top + c.height / 2;
        return JSON.stringify({
          from,
          to: {
            x: Math.round(cx + (from.x - cx) * 1.5),
            y: Math.round(cy + (from.y - cy) * 1.5),
          },
          before: canvas.dataset.scale,
          frame: !!document.querySelector('[data-slot="mark-frame"]'),
          handles: document.querySelectorAll('[data-slot="mark-handle"]').length,
        });
      })()`),
    );

    const mouse = (type, x, y) =>
      cdp.send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        buttons: type === "mouseReleased" ? 0 : 1,
        clickCount: 1,
      });

    await mouse("mouseMoved", resize.from.x, resize.from.y);
    await mouse("mousePressed", resize.from.x, resize.from.y);
    // In steps, because a real drag is a path and not a jump: the arithmetic has
    // to hold on every move event, not only at the destination.
    for (const t of [0.34, 0.67, 1]) {
      await mouse(
        "mouseMoved",
        Math.round(resize.from.x + (resize.to.x - resize.from.x) * t),
        Math.round(resize.from.y + (resize.to.y - resize.from.y) * t),
      );
    }
    await mouse("mouseReleased", resize.to.x, resize.to.y);
    await sleep(250);

    const dragged = JSON.parse(
      await cdp.evaluate(`(() => {
        const canvas = document.querySelector('[data-slot="canvas"]');
        const c = canvas.getBoundingClientRect();
        const f = document.querySelector('[data-slot="mark-frame"]').getBoundingClientRect();
        const readout = document.querySelector('[data-slot="size-readout"]').textContent.trim();
        return JSON.stringify({
          scale: canvas.dataset.scale,
          // Where the frame actually landed, as a canvas fraction. The claim is
          // that the frame tracks the artwork, not merely that a number changed.
          half: +(f.width / c.width / 2).toFixed(3),
          centre: +((f.left - c.left + f.width / 2) / c.width).toFixed(3),
          share: (readout.match(/(\\d+)% of canvas/) ?? [])[1] ?? '',
          readout,
        });
      })()`),
    );

    record(
      "a corner handle resizes the logo, and the frame tracks it",
      resize.frame &&
        resize.handles === 4 &&
        Math.abs(Number(dragged.scale) - 1.5) < 0.03 &&
        // MARK_BOX is 0.3, so a 1.5× logo's frame is 45% of the canvas either
        // side of the centre — the absolute value, not a ratio between the two
        // numbers this run happened to produce.
        Math.abs(dragged.half - 0.45) < 0.01 &&
        Math.abs(dragged.centre - 0.5) < 0.005 &&
        dragged.share === "90",
      `${resize.before} → ${dragged.scale}, frame half ${dragged.half} at centre ${dragged.centre} · "${dragged.readout}"`,
    );

    // The recipes are the same write as the drag, so they have to leave no chip
    // pressed once the value moves off them — and the fill scale is where the
    // resize is felt as a *consequence*: a mark that spans the canvas has no room
    // left to move, so the position pad goes off rather than clamping silently.
    const sized = JSON.parse(
      await cdp.evaluate(`(async () => {
        const settle = () => new Promise((r) => setTimeout(r, 130));
        // Matched case-insensitively: the chip carries Tailwind's capitalize
        // utility, and innerText reports the rendered text — so "Fill canvas"
        // comes back as "Fill Canvas" and an exact match would find nothing.
        const chip = (label) =>
          [...document.querySelectorAll('[data-slot="size-recipes"] button')]
            .find((b) => b.innerText.trim().toLowerCase() === label.toLowerCase());
        const read = () => ({
          scale: document.querySelector('[data-slot="canvas"]').dataset.scale,
          readout: document.querySelector('[data-slot="size-readout"]').textContent.trim(),
          position: document.querySelector('[data-slot="position-readout"]').textContent.trim(),
          nudgeOff: [...document.querySelectorAll('[data-slot="position-nudge"]')].every((b) => b.disabled),
        });
        chip('fill canvas').click();
        await settle();
        const filled = read();
        chip('default').click();
        await settle();
        const back = read();
        return JSON.stringify({ filled, back });
      })()`),
    );

    record(
      "the size recipes set the scale, and filling the canvas pins the logo",
      Number(sized.filled.scale) > 1.66 &&
        /100% of canvas/.test(sized.filled.readout) &&
        sized.filled.position === "Pinned" &&
        sized.filled.nudgeOff &&
        sized.back.scale === "1.000" &&
        /60% of canvas/.test(sized.back.readout) &&
        sized.back.position === "Centred" &&
        !sized.back.nudgeOff,
      `Fill → ${sized.filled.scale} "${sized.filled.readout}" (${sized.filled.position}) · ` +
        `Default → ${sized.back.scale} "${sized.back.readout}" (${sized.back.position})`,
    );

    // The size has to survive a reload with the rest of the artwork, or a user who
    // resized and came back would find their logo silently at the authored size.
    const sizedChip = (label) =>
      `[...document.querySelectorAll('[data-slot="size-recipes"] button')].find((b) => b.innerText.trim().toLowerCase() === '${label.toLowerCase()}')`;
    await cdp.evaluate(`(${sizedChip("Wide")}).click()`);
    await sleep(200);
    await cdp.goto(`${BASE}/studio`);
    await sleep(900);
    const keptScale = await cdp.evaluate(
      `document.querySelector('[data-slot="canvas"]')?.dataset.scale ?? ''`,
    );
    record(
      "a resized logo comes back at its size",
      Math.abs(Number(keptScale) - 1.3) < 0.005,
      `"Wide" (1.30) → reload → ${keptScale}`,
    );
    await cdp.evaluate(`(${sizedChip("Default")}).click()`);
    await sleep(200);

    /* ---- refusals cost nothing ---- */

    // Driven through the same file input as the success path. A file input's
    // `accept` list is only a hint — `setFileInputFiles` bypasses it, as does a
    // drag from a file manager — so the app's own validation is the real gate and
    // this is the only way to reach it.
    async function pickFile(file) {
      // The node id is resolved per call rather than cached: a DOM node id is
      // invalidated by a navigation, and these run on both sides of a reload.
      const document_ = await cdp.send("DOM.getDocument", { depth: 1 });
      const input = await cdp.send("DOM.querySelector", {
        nodeId: document_.root.nodeId,
        selector: '[data-slot="artwork-input"]',
      });
      await cdp.send("DOM.setFileInputFiles", {
        nodeId: input.nodeId,
        files: [file.path],
      });
      await sleep(700);
      return JSON.parse(
        await cdp.evaluate(`(() => {
          // Every live toast, joined. Reading only the last one would read the
          // *oldest*: sonner inserts the newest at the top of the list, so the
          // previous success message would be the one under inspection.
          const toasts = [...document.querySelectorAll('[data-sonner-toast]')];
          const svg = document.querySelector('[data-slot="canvas"] svg');
          return JSON.stringify({
            toast: toasts.map((t) => t.innerText).join(' | ').replace(/\\s+/g, ' '),
            name: document.querySelector('[data-slot="artwork-name"]')?.innerText ?? '',
            image: !!svg.querySelector('image'),
          });
        })()`),
      );
    }

    const wrongType = await pickFile(
      await anyFile({ name: "notes.txt", content: "this is not an image" }),
    );
    record(
      "a file that is not an image is refused, by name",
      /not supported/i.test(wrongType.toast) && /text\/plain/.test(wrongType.toast),
      `"${wrongType.toast.slice(0, 72)}"`,
    );

    // The 3MB file is named `.png`, so it arrives as `image/png` and passes the
    // type check — the only thing that can stop it is the size cap, and the
    // message says which one ran. A decode-first implementation would report
    // "could not be decoded" here instead, which is why the assertion is on the
    // size rather than merely on the request failing.
    const tooBig = await pickFile(
      await anyFile({ name: "huge.png", content: Buffer.alloc(3 * 1024 * 1024, 0x20) }),
    );
    record(
      "an oversized file is refused before it is decoded",
      /3\.0MB/.test(tooBig.toast) &&
        /under 2MB/.test(tooBig.toast) &&
        !/decoded/i.test(tooBig.toast),
      `"${tooBig.toast.slice(0, 72)}"`,
    );

    // The failed pick must not have cost the artwork that was already loaded.
    record(
      "a refused file leaves the artwork alone",
      wrongType.image &&
        tooBig.image &&
        wrongType.name === uploaded.name &&
        tooBig.name === uploaded.name,
      `mark still "${tooBig.name}" · image present after both refusals=${tooBig.image}`,
    );

    /* ---- what survives a reload ---- */

    // Reloaded *without* the `?template=` query string, so a restored template is
    // the session record doing the work rather than the URL — and the artwork is
    // one the user had to find on their own disk, which is the part worth keeping.
    await cdp.goto(`${BASE}/studio`);
    await sleep(900);
    // A reload lands on the first tab, so the tab the name is read from is opened
    // again — nothing about the restored record depends on which tab is showing.
    await openTab(cdp, "logo");
    const reloaded = JSON.parse(
      await cdp.evaluate(`(() => {
        const svg = document.querySelector('[data-slot="canvas"] svg');
        return JSON.stringify({
          title: document.querySelector('[data-slot="studio-title"]')?.innerText ?? '',
          name: document.querySelector('[data-slot="artwork-name"]')?.innerText ?? '',
          image: !!svg.querySelector('image'),
          stored: !!localStorage.getItem('puff-nonai-mark'),
        });
      })()`),
    );

    record(
      "your artwork and template come back after a reload",
      reloaded.image &&
        /upload\.png/.test(reloaded.name) &&
        // The same look the wall tile opened, by name: the record stores the id, and
        // this is the check that the restored document is the one the visitor chose.
        reloaded.title.trim() === wallTile.name.trim() &&
        reloaded.stored,
      `"${reloaded.name}" on "${reloaded.title.replace(/\s+/g, " ").trim()}" · image=${reloaded.image}`,
    );

    // A stored record is `localStorage`, which anyone can edit — the same reason
    // the `?template=` id is validated. A remote `href` would be an external
    // reference in every exported SVG, and would taint the canvas the PNG is
    // drawn through, so `toBlob` would fail at export time with nothing to say.
    const tampered = await cdp.evaluate(`(async () => {
        const key = 'puff-nonai-mark';
        const raw = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({
          templateId: 'not-a-template',
          custom: { ...raw.custom, href: 'https://example.com/logo.png' },
        }));
        return true;
      })()`);
    await cdp.goto(`${BASE}/studio`);
    await sleep(900);
    await openTab(cdp, "logo");
    const afterTamper = JSON.parse(
      await cdp.evaluate(`(() => {
        const svg = document.querySelector('[data-slot="canvas"] svg');
        return JSON.stringify({
          title: document.querySelector('[data-slot="studio-title"]')?.innerText ?? '',
          // The fallback is the library's first look, read from the gallery rather
          // than typed here — the names get rewritten, and a hardcoded one made this
          // check fail while the record was being dropped exactly as it should be.
          firstCard: (document.querySelector('[data-slot="template-card"]')
            ?.innerText.split(String.fromCharCode(10))[0] ?? '').trim(),
          image: !!svg.querySelector('image'),
          hrefs: [...svg.querySelectorAll('[href]')]
            .map((n) => n.getAttribute('href'))
            .filter((h) => !h.startsWith('#') && !h.startsWith('data:')),
        });
      })()`),
    );

    record(
      "a hand-edited session record is dropped, not trusted",
      tampered &&
        !afterTamper.image &&
        afterTamper.hrefs.length === 0 &&
        afterTamper.firstCard.length > 0 &&
        afterTamper.title.trim() === afterTamper.firstCard,
      `fell back to "${afterTamper.title.replace(/\s+/g, " ").trim()}" · foreign refs=[${afterTamper.hrefs.join(",")}]`,
    );

    /* ---- a raster is downscaled, and vector is kept as vector ---- */

    const downscaled = await pickFile(
      await pngFile({ width: 1200, height: 1200, rgb: [124, 58, 237] }),
    );
    // The label states the intent; the decoded data URL is the thing that
    // matters. A 1,200px upload re-encoded at 1,200px would be four times the
    // canvas in each direction, and base64 costs another third on top — carried
    // into every render and every exported file forever.
    const embedded = JSON.parse(
      await cdp.evaluate(`(async () => {
        const href = document.querySelector('[data-slot="canvas"] svg image')
          ?.getAttribute('href') ?? '';
        const size = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ w: 0, h: 0 });
          img.src = href;
        });
        return JSON.stringify({
          ...size,
          kb: Math.round(href.length / 1024),
          raster: href.startsWith('data:image/png;base64,'),
        });
      })()`),
    );

    record(
      "a large raster is downscaled to the canvas",
      downscaled.image &&
        embedded.w === 1024 &&
        embedded.h === 1024 &&
        embedded.raster &&
        /1200×1200/.test(downscaled.name),
      `embedded ${embedded.w}×${embedded.h} (${embedded.kb}kB) · label "${downscaled.name}"`,
    );

    const vectored = await pickFile(
      await anyFile({ name: "mark.svg", content: SVG_MARK }),
    );
    const vectorHref = await cdp.evaluate(
      `document.querySelector('[data-slot="canvas"] svg image')?.getAttribute('href')?.slice(0, 26) ?? ''`,
    );
    record(
      "an SVG is kept as vector rather than re-encoded to a bitmap",
      downscaled.image &&
        /vector/.test(vectored.name) &&
        vectorHref.startsWith("data:image/svg+xml"),
      `"${vectored.name}" · href ${vectorHref}…`,
    );

    /* ---- and the way back, which the copy promises ---- */

    // Removing it has to restore the shape it was covering — and it runs *last*
    // on purpose: everything above needs an artwork in hand, and a check that
    // removes the mark has to come after the checks that assert it is there.
    const removed = JSON.parse(
      await cdp.evaluate(`(async () => {
        document.querySelector('[data-slot="artwork-remove"]').click();
        await new Promise((r) => setTimeout(r, 300));
        const svg = document.querySelector('[data-slot="canvas"] svg');
        const ranges = [...document.querySelectorAll('[data-slot="editor-range"]')];
        return JSON.stringify({
          image: !!svg.querySelector('image'),
          // The dashed box is the empty state, and its return is the difference
          // between the plate going back to being empty and merely losing its
          // pixels: an empty plate still exports, and this is what it looks like.
          empty: !!document.querySelector('[data-slot="canvas-empty"]'),
          // ...and the shadow, which the artwork casts, goes off with it.
          off: ranges.filter((r) => r.dataset.disabled === 'true').map((r) => r.dataset.row),
          // Back to centred: the next file arrives centred, so the pad has nothing
          // left to report on.
          position: document.querySelector('[data-slot="position-readout"]').textContent.trim(),
          picker: !!document.querySelector('[data-slot="artwork-input"]'),
        });
      })()`),
    );

    record(
      "removing the artwork empties the plate again",
      !removed.image &&
        removed.empty &&
        removed.off.join(",") === "shadow" &&
        removed.position === "—" &&
        removed.picker,
      `image gone=${!removed.image} · empty state back=${removed.empty} · shadow off=[${removed.off.join(",")}] · position "${removed.position}"`,
    );

    // A removal has to stick, or the next visit resurrects artwork the user
    // deleted — which is the failure mode persistence introduces.
    await cdp.goto(`${BASE}/studio`);
    await sleep(900);
    const afterRemoval = await cdp.evaluate(
      `!!document.querySelector('[data-slot="canvas"] svg image')`,
    );
    record(
      "a removed image stays removed",
      !afterRemoval,
      `image present after reload=${afterRemoval}`,
    );

    /* ---- `pointer-coarse` has to be a real variant, not a dead class ---- */

    // CDP cannot emulate the `pointer` media feature — `matchMedia('(pointer:
    // coarse)')` stays false under `setEmulatedMedia` — so a sizing test would
    // pass no matter what. Read the compiled CSS instead: this is the exact
    // failure mode that shipped once already, where the class was present on the
    // element and compiled to nothing.
    const coarseCss = await cdp.evaluate(`(() => {
      const text = [...document.styleSheets].flatMap((sheet) => {
        try { return [...sheet.cssRules].map((r) => r.cssText); } catch { return []; }
      }).join('\\n');
      const scoped = /@media\\s*\\(pointer:\\s*coarse\\)[^{]*\\{[\\s\\S]*?pointer-coarse/.test(text);
      const bare = [...text.matchAll(/\\.pointer-coarse\\\\:min-h-11\\s*\\{/g)].length;
      return JSON.stringify({ scoped, occurrences: bare });
    })()`);

    const coarse = JSON.parse(coarseCss);
    record(
      "the touch-target variant compiles inside a coarse-pointer query",
      coarse.scoped,
      `coarse-scoped rules=${coarse.scoped} · raw occurrences=${coarse.occurrences}`,
    );

    record(
      "the studio ran without console errors",
      consoleErrors.length === 0,
      consoleErrors.length ? consoleErrors.slice(0, 3).join(" | ") : "none",
    );
  } catch (error) {
    record("runner completed", false, String(error));
  } finally {
    cdp?.close();
    child.kill();
  }
}

await main();

const width = Math.max(...results.map((r) => r.step.length));
console.log("\nBrowser checks\n" + "─".repeat(width + 12));
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.step.padEnd(width)}  ${r.detail}`);
}
console.log("─".repeat(width + 12));
console.log(
  failed ? "FAILED" : `PASSED (${results.length} checks)`,
);
process.exit(failed ? 1 : 0);
