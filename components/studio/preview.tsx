"use client";

import { IconPhoto } from "@tabler/icons-react";
import { useRef } from "react";

import { IconTile } from "@/components/icon-tile";
import { Chip } from "@/components/ui/chip";
import { CANVAS_SIZE } from "@/lib/engine/geometry";
import { MARK_BOX, artworkExtent, clampOffset, fitFor, guideBox, guideCircle, targetById } from "@/lib/engine/targets";
import { useStudio, type PreviewShape } from "@/lib/store";
import { cn } from "@/lib/utils";

/** How far one arrow key nudges the mark, in canvas units. */
const NUDGE = 8;

const GUIDES = [
  { id: null, label: "Off" },
  { id: "ios", label: "iOS" },
  { id: "android-fg", label: "Android" },
] as const;

const SHAPES: { id: PreviewShape; label: string; hint: string }[] = [
  {
    id: "square",
    label: "Canvas",
    hint: "The plate as the platform files are exported — full-bleed, nothing clipped",
  },
  {
    id: "rounded",
    label: "Rounded",
    hint: "The same plate wearing the radius you set, which is the shape a home screen gives it",
  },
];

/** Home-screen sizes worth checking, in pixels, at 1×. */
const SIZES = [
  { px: 180, label: "App Store" },
  { px: 120, label: "Home screen" },
  { px: 60, label: "Settings" },
] as const;

/**
 * The preview.
 *
 * The canvas is shown **uncropped and on a mat**, which is the whole point of a
 * studio: an earlier version clipped the plate into a rounded box, so four corners
 * of whatever you were designing were invisible while the file quietly contained
 * them. A hairline marks where the canvas ends, so the edges you are designing to
 * are visible even when the plate's own field stops short of them.
 *
 * The one thing drawn on top of an empty plate is a dashed box at the artwork's
 * own size and position. It is not decoration: it says where a logo will land and
 * how much of the canvas it will occupy before anything is uploaded, which is the
 * question the empty state would otherwise leave unanswered.
 *
 * With a guide on, the preview is fitted exactly as the export will be. That is
 * the difference between a guide that means something and a box the artwork
 * visibly ignores while the downloaded file quietly obeys it — and it is why the
 * fit is reported numerically beside it rather than left invisible.
 */
export function Preview({ className }: { className?: string }) {
  const direction = useStudio((s) => s.direction);
  const guide = useStudio((s) => s.guide);
  const setGuide = useStudio((s) => s.setGuide);
  const shape = useStudio((s) => s.previewShape);
  const setShape = useStudio((s) => s.setPreviewShape);

  const setArtworkOffset = useStudio((s) => s.setArtworkOffset);

  const target = guide ? targetById(guide) : null;
  const offset = clampOffset(direction.artwork?.offset);
  const fit = target ? fitFor(target, direction.finish, offset) : 1;
  const extent = artworkExtent(target?.safeBox ? "box" : "circle", offset);
  const box = target ? guideBox(target) : null;
  const circle = target ? guideCircle(target) : null;
  const hasArtwork = Boolean(direction.artwork);
  const moved = offset.x !== 0 || offset.y !== 0;

  /**
   * Dragging, in canvas units.
   *
   * Two conversions, and both matter:
   *
   *  - **Pixels to canvas units**, from the canvas's own measured width. The
   *    preview is responsive, so a fixed ratio would make the same drag move the
   *    logo by different amounts at different window sizes.
   *  - **Divided by the fit.** The fit is a scale about the centre, so a mark
   *    offset by `o` renders at `o × fit`. Moving the *rendered* mark by a drag of
   *    `d` therefore means writing `d / fit`, which is what keeps the logo under
   *    the cursor while a safe-area guide is shrunk to the platform's mask.
   */
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    from: { x: number; y: number };
    unit: number;
  } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!hasArtwork) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    if (!width) return;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      from: offset,
      unit: CANVAS_SIZE / width / (fit || 1),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    setArtworkOffset({
      x: state.from.x + (event.clientX - state.x) * state.unit,
      y: state.from.y + (event.clientY - state.y) * state.unit,
    });
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  // The keyboard path: the same offsets, reachable without a pointer. Precision
  // beyond a mouse is the reason it is worth having at all — 8 units is a fifth of
  // a percent of the canvas.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!hasArtwork) return;
    const step = event.shiftKey ? NUDGE * 4 : NUDGE;
    const delta =
      event.key === "ArrowLeft"
        ? { x: -step, y: 0 }
        : event.key === "ArrowRight"
          ? { x: step, y: 0 }
          : event.key === "ArrowUp"
            ? { x: 0, y: -step }
            : event.key === "ArrowDown"
              ? { x: 0, y: step }
              : null;
    if (!delta) return;
    event.preventDefault();
    setArtworkOffset({ x: offset.x + delta.x, y: offset.y + delta.y });
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} data-slot="preview">
      {/* The mat. It exists so the canvas boundary is legible: without it a
          full-bleed plate has no visible edge at all, and you cannot tell
          whether the artwork stops short of the canvas or the canvas stops at
          the artwork. */}
      <div data-slot="canvas-mat" className="rounded-2xl bg-muted/50 p-4 sm:p-6">
        <div
          data-slot="canvas"
          data-shape={shape}
          data-radius={direction.radius}
          data-draggable={hasArtwork ? "true" : "false"}
          data-offset-x={Math.round(offset.x)}
          data-offset-y={Math.round(offset.y)}
          role={hasArtwork ? "application" : undefined}
          aria-label={hasArtwork ? "Canvas — drag the logo to position it" : undefined}
          tabIndex={hasArtwork ? 0 : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className={cn(
            "relative mx-auto aspect-square w-full max-w-[360px] rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
            hasArtwork && "cursor-grab touch-none active:cursor-grabbing",
          )}
        >
          <div className="absolute inset-0">
            <IconTile
              direction={direction}
              uid="studio-preview"
              fit={fit}
              corners={shape === "rounded" ? "rounded" : "square"}
              title={direction.title}
            />
          </div>

          {/* Where artwork lands, and how big. Only while the plate is empty:
              once there is a logo the dashed box would be noise. */}
          {!hasArtwork && (
            <div
              data-slot="canvas-empty"
              className="pointer-events-none absolute flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-foreground/25 px-3 text-center"
              style={{
                left: `${50 - MARK_BOX * 100}%`,
                top: `${50 - MARK_BOX * 100}%`,
                width: `${MARK_BOX * 200}%`,
                height: `${MARK_BOX * 200}%`,
              }}
            >
              <IconPhoto className="size-5 text-foreground/40" />
              <span className="text-[11px] leading-snug text-foreground/55 text-pretty">
                Your logo goes here. Add a file in the Design panel.
              </span>
            </div>
          )}

          {(box || circle) && (
            <span
              aria-hidden
              data-slot="safe-area"
              className={cn(
                "pointer-events-none absolute border border-dashed border-white mix-blend-difference",
                circle && "rounded-full",
              )}
              style={
                circle
                  ? {
                      left: "50%",
                      top: "50%",
                      width: circle,
                      height: circle,
                      transform: "translate(-50%, -50%)",
                    }
                  : { inset: box ?? "0" }
              }
            />
          )}
        </div>
      </div>

      {hasArtwork && (
        <p
          data-slot="canvas-hint"
          className="text-center text-[11px] leading-snug text-muted-foreground text-pretty"
        >
          {moved
            ? `Moved ${Math.round(offset.x)}, ${Math.round(offset.y)} units from centre — drag to reposition, or arrow keys to nudge.`
            : "Drag the logo on the canvas to position it. Arrow keys nudge; shift nudges further."}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Corners</span>
          {SHAPES.map((s) => (
            <Chip
              key={s.id}
              title={s.hint}
              active={shape === s.id}
              onClick={() => setShape(s.id)}
            >
              {s.id === "rounded" ? `Rounded ${direction.radius.toFixed(0)}` : s.label}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Safe area</span>
          {GUIDES.map((g) => (
            <Chip
              key={g.label}
              active={guide === g.id}
              onClick={() => setGuide(g.id)}
            >
              {g.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Legibility at real size. An icon is judged on a home screen, not at
          360px, and this is the cheapest way to catch a logo that only reads when
          it is large. Drawn at the document's own corners — no platform guide —
          because this is about the design, not a mask. */}
      <div
        data-slot="size-strip"
        className="flex flex-wrap items-end justify-center gap-5 rounded-xl bg-muted/40 px-4 py-3"
      >
        {SIZES.map((size) => (
          <div key={size.px} className="flex flex-col items-center gap-1.5">
            <div
              data-slot="size-sample"
              data-size={size.px}
              style={{ width: size.px, height: size.px }}
            >
              <IconTile direction={direction} uid={`preview-size-${size.px}`} title={`${size.px}px`} />
            </div>
            <span className="tabular-nums text-[10px] text-muted-foreground">
              {size.px}px
            </span>
          </div>
        ))}
      </div>

      {/* Exact numbers, not adjectives: the extent is the artwork box's reach from
          the centre in the 1024 canvas, and the fit is what the export applies. */}
      <dl
        data-slot="preview-readout"
        className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-3 text-center sm:grid-cols-4"
      >
        <Readout label="Canvas" value={`${CANVAS_SIZE}`} unit="u" />
        <Readout label="Radius" value={direction.radius.toFixed(2)} unit="u" />
        <Readout label="Artwork" value={extent.toFixed(3)} unit="of canvas" />
        <Readout
          label="Export fit"
          value={fit === 1 ? "1.00" : fit.toFixed(3)}
          unit="scale"
          highlight={fit < 1}
        />
      </dl>
      {fit < 1 && (
        <p className="text-[11px] text-muted-foreground text-pretty">
          Scaled to {Math.round(fit * 100)}% so the artwork survives this
          platform&rsquo;s mask. Leading, trailing, and centred all stay exact —
          the scale is applied about the canvas centre.
        </p>
      )}
    </div>
  );
}

function Readout({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums text-sm font-medium",
          highlight && "text-foreground",
        )}
      >
        {value}
      </dd>
      <dd className="text-[10px] text-muted-foreground">{unit}</dd>
    </div>
  );
}
