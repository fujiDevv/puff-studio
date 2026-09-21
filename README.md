# Puff Studio (non-AI)

A pixel-exact app-icon studio with **no generation in it at all**. You pick a
template, edit it by the number, and export the whole platform set. There is no
prompt box, no model, no network round trip — and therefore nothing to wait for.

Same stack as the sibling `puff-app`: vinext + Cloudflare Workers, React 19,
Tailwind v4, zustand.

## Why this app exists

`puff-app` generates four options from a sentence. Only one piece of that was
ever AI-shaped: the *director*, which turned prose into a `Direction`. Everything
downstream — the parametric renderer, the palettes, the finish, the platform maths
— was already deterministic and editable by hand.

So this app removes the director, and the generator with it, and replaces them with
a **hand-authored library of looks** plus your own artwork. A look *is* a
`Direction`, which means:

- every look routes through the exact renderer that exports the files, so the
  gallery cannot promise anything the export will not deliver;
- the whole app works offline, in one frame, with no API key and no cost per icon;
- "regenerate until it looks right" becomes "move the slider that controls it".

## The shell

One screen, **two columns**, split the way a design tool splits them: everything
you *look at* on the left, everything you *change* on the right.

| | |
| --- | --- |
| **Canvas** (left) | The whole side, the whole height. No card, no mat, no inner scroll — the plate is the largest square that fits, and the surface around it belongs to the canvas |
| **Editor** (right) | It is *complete*: the look library, the three design tabs, the measurements, and the way out. One scrolling panel rather than three regions |

It used to be three regions — a 284px look rail, a scrolling middle column with the
plate in a card above a Design card, and the export panel below that. Three regions
for two things. The header went with them, because a title bar across the top of a
stage is exactly the chrome a full-bleed canvas is trying to get rid of; the title,
the export button and the theme switch now belong to the editor.

Below `md` the two columns **stack**: the canvas keeps a fixed share of the height
and the editor takes the rest, so a phone gets the same two surfaces one above the
other rather than a shrunken desktop.

**Looks is a collapsible section**, not a rail, and it is open by default —
collapsing is the opt-in, not the resting state, because a library nobody can find
is worse than one that takes a row of height. The summary keeps saying *which look
you are working from* while the list is closed, so collapsing hides the scrolling
and nothing else.

- **Infinite scroll.** The list starts with a screenful and appends another batch
  each time a sentinel at the bottom comes into view, then stops honestly at the
  end with a count. The library is finite, so this is paging rather than a true
  loop — looping it would show the same template twice under two scroll
  positions, which for a picker is a bug dressed as a feature.
- **Search.** A term matches a look's name or its blurb. A new filter resets the
  paging and the scroll position, so a narrower result set cannot open already
  "finished".
- **Shuffle** loads a different look at random and never repeats the current one.
  **Reset** reloads the current look, discarding your edits, and is offered only
  while there is something to discard. Both live in the Looks section rather than
  the header: they are statements about the look, not about the document.

## The canvas

It is a **stage**, not a card. A 1024-unit canvas is what this app is about, and it
used to be shown at a fixed 360px wide inside four layers of chrome — a plate in a
mat in a card in a column — so the design was judged through a keyhole. The stage
fills the column instead, and the plate is as large as fits: **732×732** in a
1280×900 window, from 360 before.

Being the largest square that fits *both* axes is the whole layout problem, and
`aspect-ratio` cannot express it on its own — a square capped by `max-height` stops
being square. The stage is a size container and the frame inside it is
`min(100%, 100cqh − label)`: one declaration, correct at every window size, with no
measured pixels and no resize listener. `check:browser` asserts the result as
*geometry* — square, inside the stage on every edge, below the view bar and above
the status bar — because a plate that fits and a plate that merely did not overflow
look the same in a screenshot.

The plate is shown **uncropped, with a shadow and a hairline boundary**, and the
frame is named above it the way a design tool names an artboard: the title, and
`1024 × 1024`. That last part matters more than it sounds — a full-bleed plate has
no visible edge of its own, so without the boundary you cannot tell whether the
artwork stops short of the canvas or the canvas stops at the artwork.

Three bars, split by what they are *about*:

| Bar | What it holds |
| --- | --- |
| **View** (top) | How the plate is *shown*: its corners, and which platform's safe area is drawn over it. Nothing here is saved, exported, or part of the file |
| **Status** (bottom) | What the gesture you are about to make will do, and the **Preview** toggle |
| **Preview** | The icon at 180 / 120 / 60px, docked above the status bar — the sizes it is actually judged at |

| Control | What it does |
| --- | --- |
| **Canvas** | The plate exactly as it is exported — full-bleed, square, nothing clipped |
| **Rounded** | The same plate wearing the radius you set, which is the shape a home screen gives it |
| **Safe area** | Draws a target's mask *and* applies the fit the export will |
| **Export** (header) | Opens the export panel — the file set, and the SVG copy |
| **Logo frame** | The logo's own box, with a corner handle on each corner. Drag the box to move the logo, drag a handle to resize it |
| **Preview** | Toggles the 180 / 120 / 60px samples. Off until asked for: three rendered plates are worth the height when you are judging legibility and are clutter when you are placing a logo |

## The editor

Four sections stacked in one scrolling column: **Looks** (collapsible), **Design**,
**Measurements**, and the one-line statement of what the app is.

`Design` is three tabs over one document, and the tabs are the split a `Direction`
already has — a *plate* with an *artwork* on it:

| Tab | What it holds |
| --- | --- |
| **Look** | 12 palettes, 2 colour pickers (field and field 2), 4 field modes — solid, linear, radial, glow — and the corner radius with its five recipes |
| **Logo** | Your own artwork, how big it is, and where it sits |
| **Finish** | Five finish recipes, then shadow and grain as exact values |

Each trigger carries the one number worth seeing without opening it — the radius,
or whether a logo is loaded and how big it is — which is the question the tab bar
can answer for free. The panels are all **kept mounted**: they hold live inputs, and unmounting
the one you just left would throw away its scroll position for no gain when the
values live in the store anyway.

It was a single scrolling column before, which had two problems that only appear
once there are enough controls. The order was the order they happened to be written
in rather than anything meaningful, and everything was always on screen, so nothing
was emphasised.

**Measurements** is the document's five numbers — the canvas, the radius, how big
the logo is drawn, how far the artwork reaches, and the scale the export will
apply. They used to sit under the plate, where they competed with it for height and
were most useful exactly when the plate was smallest; they belong with the rest of
the document's state rather than with the view.

Every readout states a real number rather than a position on a slider. The radius
is measured in the 1,024-unit canvas like every other measurement here, so it reads
in whole units — and 218.18, the default, is `docs/Frame.svg`'s own corner radius
rather than a round number somebody liked. `0.696` is a fact where "slightly
reduced" is not, which is why the fit is highlighted and explained only when it is
actually doing something: a readout that shouts at 1.000 is noise.

The recipes are the same numbers the looks are built from, offered as individual
moves: five corners from `Tight` to `Pill`, five finishes from `Flat` to `Heavy`.
They write through `setRadius` and `setFinish` exactly as the sliders do, so a
recipe is a shortcut and not a mode — move the slider afterwards and no chip is
pressed, which is how a shortcut should behave.

**Your own artwork** is the mark: SVG, PNG, WebP, or JPEG, up to 2MB, picked,
dropped, or pasted. The paste listener is on the window and ignores a paste while
the caret is in a field. The file is read in the browser and embedded as a data
URL — there is no upload step, no endpoint, and nothing to retain. Rasters are
downscaled to 1,024 through a canvas (base64 costs another third on top, and a
4,096px photo is detail no platform will ever display); an SVG is passed through as
vector.

The type and the size are checked **before** anything is decoded, so an oversized
file is refused rather than read into memory and refused afterwards. A file input's
`accept` list is only a hint — a drag from a file manager ignores it — so the
check inside `prepareMark` is the real gate.

**Only the shadow waits for artwork**, and the panel says why rather than just
dimming the slider: the shadow is the mark's own, cast by it. Grain never waits,
because it is a texture on the plate rather than on what sits on it. Inflate, the
specular cap, the rim light and the outline width used to sit here, and all four
read the mark's *own geometry* — a clip against its silhouette, a stroke along its
edges — which an `<image>` does not have.

**Position** is one offset with three ways in: drag the logo on the canvas, nudge
it with the pad, or press the centre button to undo all of it. The drag and the pad
write the same value, and the pad states its step — 8 units a press, 32 with shift
— because "nudge" without a number is exactly the kind of control this studio does
not have. A logo pushed toward an edge is not cropped: every export is fitted so
the whole mark survives that platform's mask, which means moving it outward shrinks
the fitted export rather than clipping it.

**Resizing** works the way a design canvas does, and then states the number. The
logo's box is drawn on the plate with a handle on each corner; dragging one
resizes about the logo's *own* centre, so a mark grows in place rather than sliding
as it grows. The arithmetic behind that is short — the distance from the logo's
centre to the handle **is** half the box diagonal, and `half = MARK_BOX × scale`
turns it back into a size — so there is no ratio against the drag's starting state
and therefore no drift: a corner dragged back to where it began returns the exact
scale it began at. All four corners share one handler, because a square box's
corners are equidistant from its middle.

The gesture is paired with `Logo size` in the panel, for the same reason the drag
is paired with the nudge pad: a gesture has no readout and no way to type a value.
There the size is stated as a share of the canvas — `1.00×` is 60% of it, `Fill
canvas` is 100% — because that is the number a designer is actually deciding. The
recipes (`Compact` · `Default` · `Wide` · `Fill canvas`) are the same
`setArtworkScale` write the slider and the handles use, so none of them stays
pressed once the value moves off it.

Resizing has one consequence, and the panel says it rather than letting it be
discovered: **a bigger logo has less room to move.** The box has to stay on the
canvas, so the travel limit is `½ − MARK_BOX × scale` — at the default size 204.8
units, at `Fill canvas` **zero**. There the mark is pinned to the middle and the
position pad goes off with a reason rather than clamping every press to nothing.
The scale is clamped on the way in and again in the renderer, because a document
can also arrive from `localStorage`, which anyone can edit.

**The artwork survives a reload** — including its size — along with the look you
were working from
(`lib/mark-session.ts`). Only those two things: a `Direction` hydrated during
module evaluation would run on the server-rendered pass, and the markup would then
depend on state the server cannot see. This record is applied in an effect *after*
hydration, so it never contributes to that mismatch. The read path validates what it
finds, because this is `localStorage`, which anyone can edit: a stored `http:` href
would become an external reference in every exported SVG and would taint the canvas
the PNG is drawn through. Saving can fail outright (Safari in private mode, or a
quota that is allowed to be as small as 5MB), and degrades to a console warning
rather than interrupting the edit.

Picking a look carries the artwork across, since it is not part of any look; a
`reset` deliberately does not, which is what reset means.

**Every colour is editable.** The two pickers write into the document one role at a
time, so the other survives. Editing either makes the palette custom, which the
swatch row reports by simply no longer matching a named palette — and
`check:targets` measures both the custom mark and every re-tinted look, because a
palette that reached the swatch but not the SVG would look like a broken picker in
the exported file.

The theme switcher sits in the studio header, so the studio has a real light mode
rather than only a landing-page toggle.

## Looks

44 looks — a palette, a field mode, a finish and a radius each — and **all of them
are free**. There is no Pro tier, no account, and no checkout. With the built-in
marks gone, a premium look would have had nothing left to be premium *about*, and
what remained to sell would have been the export files themselves, which is a
strange thing to charge for after someone has designed the icon.

A look *is* a `Direction`, hand-authored and then edited parametrically, which is
what makes "start from a look" and "make it yours" the same object rather than two
modes to reconcile. Nothing about the export is gated.

## Export

Four targets plus the vector master, each fitted to its own safe area:

| File | Size | Why |
| --- | --- | --- |
| `-ios-1024.png` | 1024² | **Opaque square.** The App Store rejects a master that carries an alpha channel, and iOS applies its own squircle mask — a pre-rounded asset gets masked twice and leaves dead corners |
| `-play-512.png` | 512² | Opaque square, same 80% margin |
| `-android-fg-432.png` | 432² | Transparent artwork layer, inside the guaranteed central 66dp circle |
| `-android-bg-432.png` | 432² | Opaque full-bleed field layer, no rim (the launcher's mask is not knowable) |
| `-icon.svg` | vector | The **design** master, corners included — it goes to a designer or a build, not to a platform |

It lives in the **header**, behind one button, rather than as a card under the
Design panel. A download is a statement about the whole document rather than
about any one lever beside it, and "where do I get the files" should not be
answered by scrolling to the bottom of a column. The panel is portaled out of the
page, so the Design column is left to the Design card alone.

The whole set downloads at once, **or one target at a time** from the arrow on
its row — a browser asked for five downloads at once will often prompt about it,
and a developer who only wants the vector should not have to take the PNGs too.
**Copy SVG** puts the vector master on the clipboard for the same reason.

### The copy is written for importers, not only for browsers

The SVG is emitted with **both** forms of every reference — `href` and the older
`xlink:href` — and declares `xmlns:xlink` on the root.

That looks like a belt-and-braces no-op, and it was: SVG 2 made the plain `href`
correct, so Chrome, Safari and Firefox all render a file that has only that, and
the preview, every PNG and `check:targets` were all perfectly happy. **Importers
are not caught up.** Paste it into a design tool that resolves `xlink:href` only,
and there is no error to read: an `<image>` with an unresolvable reference draws
*nothing*, so the plate arrived with the logo simply missing from it. A valid SVG,
complete-looking markup, and a hole where the artwork was — which is why it took
a paste into another tool to find, and why nothing here caught it for as long as
it shipped.

The namespace is declared unconditionally. An unused declaration costs a few
bytes, and a condition that has to stay in step with every `<use>` in
`render.ts` is a bug waiting to happen.

**Copy SVG and the SVG download are one function** (`svgMaster` in
`lib/engine/client.ts`). They had been spelling the same render out twice, which
is how the copied file and the downloaded one can drift apart without either
looking wrong on its own.

Selecting a guide (iOS / Android) draws that platform's safe area over the
canvas **and** applies the same fit the export uses, with the scale printed
beside it — the difference between a guide that means something and a box the
artwork visibly ignores.

## What the tests hold down

```
pnpm typecheck        tsc --noEmit
pnpm test             50 engine, look and sample tests
pnpm check:targets    10 checks: the reference edge, alpha and safe areas
pnpm check:browser    69 checks in headless Chrome (needs: pnpm dev)
pnpm build            Worker output
```

`check:browser` finds the dev server itself. That is deliberate: this app takes
port 3000 when its sibling `puff-app` is down and 3001 when it is up, and
picking wrong used to fail as a navigation timeout — which reads like a broken
page rather than a wrong address. Detection probes the usual ports and confirms
the server is *this* app by a marker only its landing page carries, because the
sibling answers on `/` with a page about Puff as well. Override with `PUFF_URL`.

A few that exist because the failure they catch is invisible in source:

- **`no paint server reference dangles, and no id is reused`** (browser). SVG
  resolves a `fill="url(#missing)"` to *no fill*, so a broken tile still looks
  like complete markup. Two tiles sharing an id would make one paint with the
  other's gradient.
- **`the marquee's -50% lands exactly on the duplicate copy`** (browser). The
  loop travels half the track, so the duplicate must land where the first copy
  began — a measured geometry fact, and the reason the spacing is a margin on
  each tile rather than a flex `gap` between copies.
- **`the marquee clips sideways and leaves the tiles' lift visible`** (browser).
  The track is two copies wide, so it has to be clipped — but only sideways. A row
  of `overflow: hidden` also cuts the tiles' hover lift and the shadow's room, and
  `clip` is the one value that can be paired with `visible`: with `hidden` the
  other axis computes to `auto`, the row becomes a scroll container, and the lift
  is sheared off anyway. Asserted on the *computed* value, not the class, because a
  utility that compiles to nothing is a trap this codebase has already hit.
- **`the corner is the reference's arc, and the rim follows it`** (targets). The
  plate's corner and its bevel are measured out of a real raster against
  `docs/Frame.svg`'s own numbers — 218.182, and a 7-wide band whose visible half is
  3.5 units — because "looks premium" is not something a test can assert and a
  radius is.
- **`the library covers every palette and every radius recipe`** (engine). Every
  field and every corner the panel offers is reachable from at least one look — the
  claim the library is built on, as an assertion.
- **`the canvas is shown uncropped, to all four edges`** (browser). Samples the
  four corners out of a real rasterization, because "is anything hidden?" is a
  question about pixels. A transparent corner in Canvas mode would mean the
  preview was cropping artwork the export keeps. Its companion,
  **`the corner toggle rounds the plate itself rather than clipping it`**, asserts
  *where* the rounding happens — inside the plate's own path, at the document's
  radius — because a CSS radius would cut a corner the exported SVG would not.
- **`every arc in a sample mark can span its own chord`** (engine). The spec
  silently scales up an arc whose radii cannot reach across its chord, and that is
  how the crescent mark became a hole: an inner arc of radius 20 drawn over a
  52-unit chord was scaled to 26 — exactly the outer radius — so the two arcs traced
  the same circle in opposite directions and the non-zero fill cancelled to nothing.
  The mark painted zero pixels while its markup looked perfect. Asserting on the
  arcs catches the whole class, and catches it in a unit test rather than in a
  screenshot of the homepage.
- **`the sample marks cover real pixels when drawn on their own`** (browser). The
  mark is rasterised through its own `href` rather than by re-rasterising the tile
  with the mark group removed: a tile's SVG text goes through
  `encodeURIComponent`, and these marks are themselves percent-encoded
  `data:image/svg+xml` URLs — so every `%` inside one would be encoded a second
  time, the nested image would fail to load, and the diff would report exactly zero
  for a mark that is in fact painted.
- **`the look library scrolls in place inside the editor`** and
  **`scrolling the list pages the whole library in`** (browser). The list has to own
  its scrolling — if it overflowed the editor instead, the observer would be
  watching the wrong root and the list would never grow — so the check drives the
  **real** scroll, because that is the only thing that proves the observer is
  attached to the right element. The first is what remains of "the studio is a
  sidebar shell": the section moved into the editor, and the claim about the scroll
  container did not.
- **`the studio theme switcher really changes the studio`** (browser). A flipped
  class proves nothing; the check compares the rendered colour's own lightness in
  both directions.
- **`the design panel is three tabs, and each opens onto its own controls`** and
  **`a corner recipe writes the document, not just the chip`** (browser). The panels
  are kept mounted, so a hidden one still yields its controls to a query and a chip
  that lit up without writing anything would look identical in a screenshot. The
  recipe is clicked and the canvas's own `data-radius` is read — the document rather
  than the label beside it.
- **`the studio is two columns: the canvas, and the editor beside it`** (browser).
  Asserted as a *relationship* between the two rects rather than as two presences —
  the point of the change is that they no longer sit above one another — plus the
  editor's height against its parent, because "full height" is the claim a `flex-1`
  in the wrong place quietly voids.
- **`below the breakpoint the two columns stack instead`** (browser). The same two
  rects at an emulated 414px, where a two-column layout actually breaks. Worth its
  own check because a Tailwind breakpoint that compiles to nothing looks exactly
  like one that works — and it caught a real one: `clearDeviceMetricsOverride`
  *removes* an override rather than restoring the previous one, so "undoing" the
  emulation dropped the run to headless Chrome's real 756×469 window and every
  check after it measured the mobile layout while claiming to measure the desktop
  one. The suite's viewport is a named constant now, and both callers use it.
- **`the canvas is the largest square that fits the whole column`** (browser).
  Geometry, not style: the plate's width against its height, its gaps to the stage
  on all four edges, and its position between the two bars. A plate inside a Card
  would still measure square, so the claim being tested is specifically "as large as
  fits", which `aspect-ratio` cannot express on its own — a square capped by
  `max-height` stops being square.
- **`the Preview toggle shows the icon at real home-screen sizes`** (browser).
  Three shapes of the same claim in one check: nothing before the click (the strip
  is off until asked for), three samples at 180/120/60px with their measured widths
  agreeing with their declared ones, docked above the status bar rather than
  floating over the plate — and *nothing again* after a second click, because a
  toggle that only opens is a button.
- **`the position pad nudges in exact steps, and offers the way back`** (browser).
  The pad exists beside the drag because each press is an exact, stated distance, so
  the check reads the canvas's `data-offset-*` rather than however far a pointer
  happened to move.
- **`a corner handle resizes the logo, and the frame tracks it`** (browser). Driven
  with real mouse events, in steps — `element.click()` would bypass exactly the
  arithmetic under test, and a single jump is one move event where a real drag is a
  path. The drag is pushed 1.5× farther from the logo's centre, so the scale it must
  produce is 1.5: a number the geometry predicts rather than one the check reads
  back and compares against itself. It also asserts where the frame *landed* — half
  the box at 45% of the canvas, still centred — and the readout it implies, so a
  frame that merely tracked a changed number would fail. Its companion,
  **`the size recipes set the scale, and filling the canvas pins the logo`**, is the
  one that covers the consequence: at the fill scale the position pad is off and
  reads `Pinned`.
- **`an enlarged mark is fitted harder, so the export still contains it`** (engine)
  and **`every document survives every export target`** (engine + targets). The
  three terms the fit cannot shrink away are the shadow, the offset, and now the
  size — so `check:targets` measures every look at *both ends of the resize range*,
  at the worst offset, with the heaviest shadow. The fill scale is the single most
  demanding document the studio can produce, and it is measured against the real
  pixels of every platform mask.
- **`the scale is clamped, and at the fill scale the mark is pinned to the middle`**
  (engine). It asserts the defining property rather than a number — a square image
  at `MAX_MARK_SCALE` touches all four edges, so travel is exactly zero — and then
  renders a hand-edited `scale: 500` to prove the *renderer* clamps too, not only
  the studio.
- **`search narrows the library to what it can match`** (browser). The term is read
  off the first card rather than typed into the check: the assertion it replaces
  kept looking for `blob` long after every look had been renamed, so it failed while
  the filter worked perfectly.
- **`the touch-target variant compiles inside a coarse-pointer query`** (browser).
  CDP **cannot** emulate the `pointer` media feature, so a size-based test passes
  no matter what; the check reads the compiled CSS instead. A Tailwind variant
  this version cannot parse compiles to nothing *silently*, which is a trap that
  has already bitten this codebase once.
- **`Copy SVG puts the design master, logo included, on the clipboard`** (browser).
  Clicked with a real mouse event, not `element.click()`: a clipboard write needs
  transient user activation, and a synthetic click is not trusted input — so the
  lazy version would have proved only that the browser refuses untrusted callers.
  It loads an artwork **first**, because the check it replaces ran on an empty
  plate — where a clipboard that dropped the logo and one that was correctly empty
  look exactly alike — and it asserts the copied bytes contain the very href the
  canvas is drawing, plus that the corners survived.
- **`the copied SVG is readable by an importer, not only by a browser`** (browser)
  and **`every reference is readable by an importer, not only by a browser`**
  (engine). Both count the `xlink:href` forms, because emitting *one* form is
  exactly what shipped. The unit test also asserts the namespace is declared: an
  unprefixed `href` is merely old, but a prefixed attribute with no declaration is
  invalid XML — the file would be rejected outright rather than rendering without
  its logo.
- **`the export panel hangs off a button in the header`** (browser). A closed
  popover is *unmounted* rather than hidden, so this asserts the panel is absent
  before the click and present after it, that the trigger reports `aria-expanded`,
  and that the panel is no longer inside `main` — the three ways "it moved to the
  header" could be only half true.
- **`the artwork is painted, not merely defined`** (engine) and **`the uploaded
  artwork is drawn, not only blurred`** (browser). The mark group lives in the
  document's definitions so its shadow passes can reuse it, and the custom-mark
  version shipped with the body reference missing: an upload rendered as two
  faint blurs at 0.15 and 0.08 opacity and never as the artwork, while the markup
  still looked complete. Both counts are asserted, not just the presence of a
  reference — the shadow passes supply those on their own.
- **`a square upload survives every export target`** (engine + targets). A square
  upload is the worst case for Android's circular mask: `meet` inside a square box
  means the artwork reaches the corner, which is why the `image` key's circular
  extent is the corner rather than a measurement. `check:targets` diff-paints the
  real render, which doubles as proof that the embedded data URL rasterizes at all
  — a corrupt one paints nothing.
- **`a picked file becomes the mark, embedded as a data URL`** (browser). Driven
  through CDP's `DOM.setFileInputFiles`, because a synthetic click cannot populate
  a file input — a mocked path would prove nothing about reading real bytes. It
  asserts no `href` is anything but internal or inline, which is the difference
  between artwork that is embedded and artwork that is merely fetched later.
- **`a single palette colour can be overridden`** (browser). Written through the
  input's prototype value setter, since React owns the value and assigning it
  directly never reaches the store.
- **`an oversized file is refused before it is decoded`** (browser). The fixture
  is 3MB of spaces named `huge.png`, so the browser reports it as `image/png` and
  the type check passes — leaving the size cap as the only thing that can stop it.
  The assertion is on the size in the message, not on the request failing: a
  decode-first implementation would answer "could not be decoded" here, and a
  check that only proved "it did not load" would pass either way.
- **`a refused file leaves the artwork alone`** (browser). A failed pick must not
  cost the artwork already loaded.
- **`a removed image stays removed`** (browser). The failure mode persistence
  introduces: reload and the artwork you deleted is back.
- **`a hand-edited session record is dropped, not trusted`** (browser). Writes a
  remote `href` and an unknown template id straight into `localStorage` — where
  anyone can put them — and asserts the studio falls back rather than embedding a
  fetch into every future export.
- **`a large raster is downscaled to the canvas`** (browser). Decodes the data URL
  that was actually stored and reads its natural size, because the label stating
  "→ 1024×1024" is the intent and the embedded pixels are the fact.
- **`an SVG is kept as vector rather than re-encoded to a bitmap`** (browser). The
  one format that stays crisp at every size, so it is passed through untouched.

## Layout

```
app/page.tsx                 landing
app/studio/page.tsx          the two-column studio (?template=<id> preselects)
components/marquee.tsx       the looping track, shared by the wall and the hero
components/marketing/        landing sections, incl. the wall of finished plates
components/studio/preview.tsx the canvas: stage, artboard, view/status/Preview bars
components/studio/looks-panel.tsx the collapsible look library + shuffle/reset
components/studio/gallery.tsx the paging look list
components/studio/readouts.tsx  the document's five numbers
components/studio/editor.tsx the three-tab design panel (Look · Logo · Finish)
components/studio/look.tsx   palettes, field modes, the radius and its recipes
components/studio/finish.tsx finish recipes, shadow and grain
components/studio/artwork.tsx  the upload control (drops a file, never a URL)
components/studio/size.tsx     the logo's size: readout, recipes, slider
components/studio/position.tsx the offset: readout, nudge pad, recentre
components/studio/export-panel.tsx the file set, inside the header's popover
components/ui/popover.tsx    the anchored panel primitive (export)
lib/templates.ts             the look library — this app's "Stage A"
lib/sample-marks.ts          the landing page's sample logos, as embedded vectors
lib/store.ts                 the editing document
lib/image.ts                 file → embedded data URL, in the browser, whole
lib/mark-session.ts          the validated localStorage record: artwork + look
lib/engine/                  vendored renderer, from puff-app
scripts/                     cdp client + the verification scripts
scripts/test-image.mjs       generated PNG fixtures for the checks
```

`lib/engine/` is a **vendored copy** of `puff-app`'s renderer — geometry,
palettes, the renderer, and the export targets — with the director and the shape
families left out. It is copied rather than shared so the two apps can diverge
without a package boundary between them; `pnpm test` covers the copy directly.

## Platform rules the engine encodes

- **Design in logical units.** The canvas stays 1,024 at every render size;
  `size` moves the rendered box, never the geometry. The plate is vector and a
  raster upload is downscaled to the canvas once, so the entire `@1x/@2x/@3x` and
  `mdpi→xxxhdpi` density table is free — the same master at different sizes, with
  no slices to maintain.
- **Fit the mask, not the canvas.** `fitFor` shrinks what a platform's mask would
  crop and leaves what already fits exactly as authored. The reach is a table
  rather than a measurement: `MARK_BOX` is where the artwork box sits, `MARK_CIRCLE`
  its corner, and an offset mark is measured to its *farthest* corner — so a
  centred logo and one pushed to an edge each fit the way the export will. The
  size is the third term, and it multiplies the box: `markHalf` is `MARK_BOX ×
  scale`, and everything else — the reach, the travel, the fit — is derived from
  that one number rather than recomputed by hand in each place.
- **Resizing cannot push a logo off the canvas, by construction.** The travel limit
  is `½ − markHalf`, so it shrinks to exactly zero at the fill scale, where the box
  reaches the edge. That is why a full-bleed logo is pinned to the middle instead of
  being allowed to hang off: the limit is a statement about the file, not a slider
  end point.
- **The corner is in the plate's own path, not a CSS box.** Rounding the preview
  with `border-radius` would cut a corner the exported file keeps; `roundRectPath`
  draws it instead, and the four platform masters stay square — iOS and Play apply
  their own masks, and a pre-rounded asset gets masked twice.
- **The contact shadow does not scale with the fit.** It is a blurred copy of the
  mark, so scaling the mark shrinks the silhouette, but the blur radius, offset,
  and filter region live in canvas units the inner transform never touches. It is
  subtracted from the budget *before* the division, and `pnpm check:targets`
  caught the first version of `fitFor` getting this wrong.
- **An upload is measured as an image, and nothing else.** There is no stroke term
  to count: an `<image>` has no silhouette to widen, and counting an outline that is
  never drawn would shrink the artwork to make room for a stroke that does not
  exist. That is also why the outline, the specular cap and the rim light are gone
  from the panel rather than merely dimmed.
- **`data:` URLs, not links.** The exported SVG has to rasterize, and an external
  `href` taints the canvas `toBlob` draws through — so the file would fail at
  export time with nothing to explain it. A data URL also means the artwork never
  leaves the machine, which is a claim worth being able to check.
