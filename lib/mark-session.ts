import { clampOffset, clampScale } from "./engine/targets";
import type { MarkArtwork, MarkOffset } from "./engine/types";
import { TEMPLATES } from "./templates";

/**
 * What survives a reload: your artwork, and the look you were working from.
 *
 * Deliberately a small record rather than the whole document. The `Direction` is
 * not persisted because a synchronously hydrated store could disagree with the
 * server's first paint — that reasoning still holds, and this record is applied
 * in an effect *after* hydration, so it never contributes to that mismatch. What
 * is stored is the part that is expensive to lose: an image the user had to find
 * on their own disk, and which look they were working from. Everything else is
 * one click away, and `reset` still means reset.
 *
 * The read path is defensive because this is `localStorage` — anyone can edit it,
 * the same reason the `?template=` query string is validated rather than trusted.
 * A hand-written `http:` URL would become an external reference inside every
 * exported SVG, and an external `href` taints the canvas the PNG is drawn
 * through, so `toBlob` would fail at export time with nothing to explain it.
 */

const KEY = "puff-nonai-mark";

/**
 * A ceiling on the stored data URL, independent of the upload cap.
 *
 * `prepareMark` already refuses a file over 2MB and downscales rasters to 1,024,
 * but nothing stops someone writing megabytes into this key by hand — and the
 * renderer would then carry all of it into every render and every export.
 */
const MAX_HREF = 4 * 1024 * 1024;

export interface SessionMark {
  templateId: string | null;
  artwork: MarkArtwork | null;
}

export const EMPTY_SESSION_MARK: SessionMark = { templateId: null, artwork: null };

function readArtwork(value: unknown): MarkArtwork | null {
  if (!value || typeof value !== "object") return null;
  const mark = value as Record<string, unknown>;
  if (typeof mark.href !== "string" || !mark.href.startsWith("data:image/")) {
    return null;
  }
  if (mark.href.length > MAX_HREF) return null;
  if (typeof mark.name !== "string" || typeof mark.mime !== "string") return null;
  if (typeof mark.width !== "number" || typeof mark.height !== "number") return null;
  if (!Number.isFinite(mark.width) || !Number.isFinite(mark.height)) return null;
  const scale = readScale(mark.scale);
  const offset = readOffset(mark.offset, scale);
  return {
    href: mark.href,
    name: mark.name,
    mime: mark.mime,
    width: mark.width,
    height: mark.height,
    ...(offset ? { offset } : {}),
    ...(scale !== 1 ? { scale } : {}),
  };
}

/**
 * The stored size, or `1` for a mark that was never resized.
 *
 * Clamped rather than trusted, and the clamp is the important half: a stored
 * `scale: 1e6` would be a logo whose box is a thousand canvases wide, so the
 * offset clamp inside the renderer would collapse to zero and the export would be
 * a single colour. Dropping it to the default instead would be worse than
 * clamping — it would silently resize an image the user had deliberately made
 * larger — so the value is brought back into range and kept.
 */
function readScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return clampScale(value);
}

/**
 * The stored offset, or `undefined` for a centred mark.
 *
 * Clamped rather than trusted, for the same reason the href is checked: this is a
 * key anyone can edit, and an offset of `1e9` would put the logo somewhere no
 * export could reach. A pair that is not two finite numbers is dropped whole —
 * a half-read position is worse than a centred one.
 */
function readOffset(value: unknown, scale: number): MarkOffset | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { x, y } = value as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number") return undefined;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  // Clamped against the stored scale, not the default one: a mark that was
  // enlarged and then moved had less room to move, so the scale is read first.
  return clampOffset({ x, y }, scale);
}

export function loadSessionMark(): SessionMark {
  if (typeof localStorage === "undefined") return EMPTY_SESSION_MARK;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_SESSION_MARK;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_SESSION_MARK;
    const record = parsed as Record<string, unknown>;
    // An id that is not in the library is dropped rather than restored: it would
    // have to be resolved by `templateById`, which throws on an unknown id.
    const templateId =
      typeof record.templateId === "string" &&
      TEMPLATES.some((t) => t.id === record.templateId)
        ? record.templateId
        : null;
    return { templateId, artwork: readArtwork(record.artwork) };
  } catch {
    return EMPTY_SESSION_MARK;
  }
}

/**
 * Writes the record, or quietly does nothing.
 *
 * Failure is expected rather than exceptional here — Safari in private mode has
 * refused `setItem` outright, and a large base64 data URL can exceed a quota
 * that is allowed to be as small as 5MB. Neither is worth interrupting a user who
 * is in the middle of designing an icon, so this degrades to "your artwork is not
 * kept for next time" and says so on the console.
 */
export function saveSessionMark(next: SessionMark): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    console.warn(
      "[puff] Could not keep the artwork for the next visit — local storage is full or unavailable.",
    );
  }
}
