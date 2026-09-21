import type { MarkArtwork } from "./engine/types";

/**
 * Sample logos, for the marketing page only.
 *
 * The studio's whole premise is that the artwork is yours — the app ships no
 * marks, no shapes and no generator — which leaves the landing page with a
 * problem: plates on their own show the surface but not what a finished icon
 * looks like, and an empty plate is the one thing a visitor cannot judge.
 *
 * So these exist. They are ordinary `MarkArtwork` values, embedded exactly the
 * way an upload is (a `data:` URL, read by the same renderer, fitted into the
 * same box), so the tiles on the page are the shipping engine's output rather
 * than a designer's mock-up. Nothing here is reachable from the studio: the
 * studio starts empty, and these are never offered as a starting point.
 *
 * Drawn as vectors through a `viewBox`, so one file is correct at every size the
 * page displays it at — the same reason the studio accepts SVG uploads.
 */

const svg = (body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`,
  )}`;

/** White, because every look is a saturated or dark field. */
const INK = "#FFFFFF";

export interface SampleMark {
  id: string;
  /** What the mark is, for the caption. */
  label: string;
  artwork: MarkArtwork;
}

const mark = (id: string, label: string, body: string): SampleMark => ({
  id,
  label,
  artwork: {
    href: svg(body),
    name: `${id}.svg`,
    mime: "image/svg+xml",
    // A vector has no natural size, which is what the field's own comment says
    // `0` means.
    width: 0,
    height: 0,
  },
});

/**
 * Six silhouettes chosen to be told apart at 64px, which is the size that
 * matters: a mark that only reads at 512 is not an app icon.
 */
export const SAMPLE_MARKS: SampleMark[] = [
  mark(
    "aperture",
    "Aperture",
    `<circle cx="32" cy="32" r="19" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-dasharray="78 42" transform="rotate(-115 32 32)"/>`,
  ),
  mark(
    "chevron",
    "Chevron",
    `<path d="M21 13 L45 32 L21 51" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  mark(
    "orbit",
    "Orbit",
    `<ellipse cx="32" cy="32" rx="24" ry="10" fill="none" stroke="${INK}" stroke-width="6" transform="rotate(-30 32 32)"/><circle cx="32" cy="32" r="6.5" fill="${INK}"/>`,
  ),
  mark(
    "stack",
    "Stack",
    `<rect x="8" y="14" width="48" height="10" rx="5" fill="${INK}"/><rect x="8" y="27" width="33" height="10" rx="5" fill="${INK}"/><rect x="8" y="40" width="43" height="10" rx="5" fill="${INK}"/>`,
  ),
  mark(
    "peak",
    "Peak",
    `<path d="M7 52 L26 19 L36 35 L44 23 L57 52 Z" fill="${INK}"/>`,
  ),
  mark(
    "spark",
    "Spark",
    `<path d="M32 5 C34.6 20.6 43.4 29.4 59 32 C43.4 34.6 34.6 43.4 32 59 C29.4 43.4 20.6 34.6 5 32 C20.6 29.4 29.4 20.6 32 5 Z" fill="${INK}"/>`,
  ),
  mark(
    "bolt",
    "Bolt",
    `<path d="M37 5 L15 35 H29 L26 59 L49 27 H34 Z" fill="${INK}"/>`,
  ),
  mark(
    "pulse",
    "Pulse",
    `<path d="M7 32 H19 L25 15 L34 49 L40 32 H57" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  mark(
    "crescent",
    "Crescent",
    // The inner arc is *wider* than the outer one, which is what makes this a
    // crescent: a shallower curve back across the same two points leaves the band
    // between them. It was 20 — smaller than the 26 the 52-unit chord already needs
    // — and that is a silent failure rather than a visible one: the spec scales an
    // arc's radii up until they can span the chord, so 20 became 26, the two arcs
    // traced the same circle in opposite directions, and the non-zero fill
    // cancelled to nothing. The mark painted no pixels at all and every check that
    // looked at the markup still passed.
    `<path d="M40 6 A26 26 0 1 0 40 58 A30 30 0 0 1 40 6 Z" fill="${INK}"/>`,
  ),
  mark(
    "grid",
    "Grid",
    `<rect x="9" y="9" width="19" height="19" rx="6" fill="${INK}"/><rect x="36" y="9" width="19" height="19" rx="6" fill="${INK}"/><rect x="9" y="36" width="19" height="19" rx="6" fill="${INK}"/><circle cx="45.5" cy="45.5" r="9.5" fill="${INK}"/>`,
  ),
  mark(
    "shield",
    "Shield",
    `<path d="M32 5 L55 16 V34 C55 46.5 45 55.5 32 59 C19 55.5 9 46.5 9 34 V16 Z" fill="${INK}"/>`,
  ),
  mark(
    "drop",
    "Drop",
    `<path d="M32 5 C42 19.5 52 30 52 40 A20 20 0 0 1 12 40 C12 30 22 19.5 32 5 Z" fill="${INK}"/>`,
  ),
];

export function sampleMarkById(id: string): SampleMark {
  const found = SAMPLE_MARKS.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown sample mark: ${id}`);
  return found;
}

/**
 * Which sample sits on which look.
 *
 * Kept here rather than in the component so the pairing is testable: every id
 * below has to resolve to a real look and a real mark, and a caption that names
 * a look which no longer exists is the failure mode worth catching. The radii
 * are deliberately mixed — the point of the row is that the same logo reads on a
 * crisp corner and on a pill.
 */
export const SAMPLE_SHOWCASE: { look: string; mark: string }[] = [
  { look: "slate", mark: "aperture" },
  { look: "sky", mark: "chevron" },
  { look: "candy", mark: "orbit" },
  { look: "jade", mark: "stack" },
  { look: "violet", mark: "peak" },
  { look: "amber", mark: "spark" },
  { look: "electric", mark: "bolt" },
  { look: "coral", mark: "pulse" },
  { look: "moss", mark: "crescent" },
  { look: "orchid", mark: "grid" },
  { look: "cobalt", mark: "shield" },
  { look: "ember", mark: "drop" },
];
