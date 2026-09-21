"use client";

import { IconEye, IconPhoto } from "@tabler/icons-react";
import { useRef, useState } from "react";

import { IconTile } from "@/components/icon-tile";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { CANVAS_SIZE } from "@/lib/engine/geometry";
import {
  MARK_BOX,
  clampOffset,
  clampScale,
  fitFor,
  guideBox,
  guideCircle,
  markHalf,
  targetById,
} from "@/lib/engine/targets";
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

/** The four corners of the artwork box, in the order the frame draws them. */
const CORNERS = ["nw", "ne", "sw", "se"] as const;
type Corner = (typeof CORNERS)[number];

/** Home-screen sizes worth checking, in pixels, at 1×. */
const SIZES = [180, 120, 60] as const;

/**
 * The canvas — the studio's left column, and the whole of it.
 *
 * It is a *stage* rather than a card. The old preview was a plate inside a mat
 * inside a Card inside a scrolling column, which spent four layers of chrome on
 * the thing the app is about, and left the plate a fixed 360px wide so a
 * 1024-unit canvas was judged through a keyhole. Here the column itself is the
 * surface: a full-height stage, the plate centred on it and as large as fits, and
 * the frame named above it the way a design tool names an artboard.
 *
 * The three bars are the studio's controls, split by what they are *about*:
 *
 *  - **The view bar** holds how the plate is *shown* — its corners and which
 *    platform's safe area is drawn over it. Neither changes the document, which is
 *    why they are not in the editor.
 *  - **The status bar** says what the gesture you are about to make will do, and
 *    holds the Preview toggle.
 *  - **The samples bar** is what that toggle reveals: the icon at the three sizes
 *    it is actually judged at, which are worth the height only when you ask.
 *
 * The plate's own size is the interesting part of the layout. It has to be the
 * largest square that fits, in *both* axes, and `aspect-ratio` cannot express that
 * on its own — a square capped by `max-height` stops being square. So the stage is
 * a size container and the frame inside it is `min(100%, 100cqh − label)`: one
 * number, correct at every window size, with no measured pixels and no resize
 * listener.
 */
export function Preview({ className }: { className?: string }) {
  const direction = useStudio((s) => s.direction);
  const guide = useStudio((s) => s.guide);
  const setGuide = useStudio((s) => s.setGuide);
  const shape = useStudio((s) => s.previewShape);
  const setShape = useStudio((s) => s.setPreviewShape);
  const setArtworkOffset = useStudio((s) => s.setArtworkOffset);
  const setArtworkScale = useStudio((s) => s.setArtworkScale);

  const [samples, setSamples] = useState(false);

  const artwork = direction.artwork;
  const target = guide ? targetById(guide) : null;
  const scale = clampScale(artwork?.scale);
  const offset = clampOffset(artwork?.offset, scale);
  const fit = target ? fitFor(target, direction.finish, offset, scale) : 1;
  // The fit is a scale about the canvas centre, so every on-canvas measurement —
  // the box, its handles, the drag — is the authored one times the fit. The
  // artwork's *reach* is not needed here: it is one of the readouts, and those
  // live in the editor, so this component reads the fit rather than the extent.
  const half = markHalf(scale);
  const box = target ? guideBox(target) : null;
  const circle = target ? guideCircle(target) : null;
  const hasArtwork = Boolean(artwork);
  const moved = offset.x !== 0 || offset.y !== 0;
  const resized = scale !== 1;
  const pinned = markHalf(scale) >= 0.5 - 1e-9;
  const clamped = fit < 1;

  // The mark's box, in canvas fractions: where its centre sits, and how far it
  // reaches. Both are the rendered values, so the frame lands on the artwork
  // rather than beside it while a guide has the export scaled down.
  const centreX = 0.5 + (offset.x / CANVAS_SIZE) * fit;
  const centreY = 0.5 + (offset.y / CANVAS_SIZE) * fit;
  const renderedHalf = half * fit;

  const canvas = useRef<HTMLDivElement | null>(null);

  /**
   * Dragging, in canvas units.
   *
   * Two conversions, and both matter:
   *
   *  - **Pixels to canvas units**, from the canvas's own measured width. The
   *    stage is responsive, so a fixed ratio would make the same drag move the
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

  /**
   * Where a client position lands in the **authored** 1024 space.
   *
   * The stage can be showing the mark at `fit`, so a point on screen is only the
   * authored one after the fit is undone about the canvas centre. Everything the
   * pointer does — moving, resizing — is derived from this one conversion, which
   * is why the two gestures cannot drift apart while a guide is on.
   */
  function toCanvasUnits(clientX: number, clientY: number) {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect || !rect.width) return null;
    const fractionX = (clientX - rect.left) / rect.width;
    const fractionY = (clientY - rect.top) / rect.height;
    const undoFit = (fraction: number) =>
      CANVAS_SIZE / 2 + (((fraction - 0.5) * CANVAS_SIZE) / (fit || 1));
    return { x: undoFit(fractionX), y: undoFit(fractionY) };
  }

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

  /**
   * Resizing, from a corner handle.
   *
   * The handle is the artwork box's corner, so the arithmetic is short: the
   * distance from the mark's own centre to the pointer *is* half the box diagonal,
   * and `half = MARK_BOX × scale` turns that back into a scale. No ratio against
   * the drag's starting state, which means no drift — a corner dragged back to
   * where it started returns the exact scale it started at.
   *
   * It is measured in authored units, so the handle keeps up with the pointer even
   * while a guide is scaling the export down; and it is one gesture for all four
   * corners, because a square box's corners are equidistant from its centre.
   */
  const resizing = useRef<number | null>(null);

  function onHandleDown(event: React.PointerEvent<HTMLSpanElement>) {
    if (!hasArtwork) return;
    // Without this the canvas would also start a move, and the mark would slide
    // while it grew.
    event.stopPropagation();
    event.preventDefault();
    resizing.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onHandleMove(event: React.PointerEvent<HTMLSpanElement>) {
    if (resizing.current !== event.pointerId) return;
    const point = toCanvasUnits(event.clientX, event.clientY);
    if (!point) return;
    // The mark's centre in canvas units: the offset is measured from the middle.
    const dx = point.x - (CANVAS_SIZE / 2 + offset.x);
    const dy = point.y - (CANVAS_SIZE / 2 + offset.y);
    const reach = Math.hypot(dx, dy);
    setArtworkScale(reach / (MARK_BOX * CANVAS_SIZE * Math.SQRT2));
  }

  function onHandleUp(event: React.PointerEvent<HTMLSpanElement>) {
    if (resizing.current !== event.pointerId) return;
    resizing.current = null;
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
    <div
      className={cn("flex h-full min-h-0 flex-col bg-muted/45", className)}
      data-slot="preview"
    >
      {/* The view bar. Not the document: nothing here is saved, exported, or part
          of the file — it is how you are looking at the plate. */}
      <div
        data-slot="canvas-viewbar"
        className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-1"
      >
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
            <Chip key={g.label} active={guide === g.id} onClick={() => setGuide(g.id)}>
              {g.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* The stage. A size container, so the plate can be sized against the
          available *height* as well as the width — see the note on `Preview`. */}
      <div
        data-slot="canvas-stage"
        className="[container-type:size] flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6"
      >
        <div className="flex w-[min(100%,calc(100cqh_-_2rem))] flex-col gap-2">
          {/* A design tool names its artboard, and the name is the one thing that
              says the plate is the *document* rather than a picture of one. */}
          <span
            data-slot="canvas-label"
            className="flex items-baseline gap-2 text-[11px] text-muted-foreground"
          >
            <span className="truncate font-medium text-foreground/80">
              {direction.title}
            </span>
            <span className="tabular-nums">
              {CANVAS_SIZE} × {CANVAS_SIZE}
            </span>
          </span>

          <div
            ref={canvas}
            data-slot="canvas"
            data-shape={shape}
            data-radius={direction.radius}
            data-draggable={hasArtwork ? "true" : "false"}
            data-offset-x={Math.round(offset.x)}
            data-offset-y={Math.round(offset.y)}
            data-scale={scale.toFixed(3)}
            role={hasArtwork ? "application" : undefined}
            aria-label={
              hasArtwork
                ? "Canvas — drag the logo to position it, or a corner handle to resize it"
                : undefined
            }
            tabIndex={hasArtwork ? 0 : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className={cn(
              // The artboard's own shadow, which is what makes it read as a sheet
              // lying on the surface rather than a hole cut in it.
              "relative aspect-square w-full shadow-xl shadow-black/10 outline outline-1 outline-black/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:outline-white/10",
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
                once there is a logo its own frame says both, and a second box would
                be a second answer to the same question. */}
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

            {hasArtwork && (
              <div
                data-slot="mark-frame"
                data-scale={scale.toFixed(3)}
                className="pointer-events-none absolute border border-primary/70"
                style={{
                  left: `${(centreX - renderedHalf) * 100}%`,
                  top: `${(centreY - renderedHalf) * 100}%`,
                  width: `${renderedHalf * 200}%`,
                  height: `${renderedHalf * 200}%`,
                }}
              >
                {CORNERS.map((corner) => (
                  <span
                    key={corner}
                    aria-hidden
                    data-slot="mark-handle"
                    data-corner={corner}
                    onPointerDown={onHandleDown}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onPointerCancel={onHandleUp}
                    className={cn(
                      // 12px of handle for a 6px mark: the visible square is the
                      // affordance, the padding is what makes it catchable.
                      "pointer-events-auto absolute size-3 -m-1.5 touch-none rounded-[3px] border border-primary bg-background",
                      corner === "nw" && "-top-px -left-px cursor-nwse-resize",
                      corner === "ne" && "-top-px -right-px cursor-nesw-resize",
                      corner === "sw" && "-bottom-px -left-px cursor-nesw-resize",
                      corner === "se" && "-right-px -bottom-px cursor-nwse-resize",
                    )}
                  />
                ))}
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
      </div>

      {/* The samples, docked above the status bar. Only while asked for: three
          rendered plates are worth the height when you are judging legibility and
          are pure clutter when you are placing a logo. */}
      {samples && (
        <div
          data-slot="size-strip"
          className="flex shrink-0 animate-in flex-wrap items-end justify-center gap-5 border-t border-border bg-background/70 px-4 py-3 duration-150 fade-in slide-in-from-bottom-2"
        >
          {SIZES.map((px) => (
            <div key={px} className="flex flex-col items-center gap-1.5">
              <div data-slot="size-sample" data-size={px} style={{ width: px, height: px }}>
                <IconTile direction={direction} uid={`preview-size-${px}`} title={`${px}px`} />
              </div>
              <span className="tabular-nums text-[10px] text-muted-foreground">{px}px</span>
            </div>
          ))}
        </div>
      )}

      {/* The status bar: what the next gesture will do, plus the way to the sizes.
          A gesture with no readout is the thing this replaces — the offset, the
          scale, and the fit are all real numbers, and they live in the editor's
          readouts rather than competing with the plate for space here. */}
      <div
        data-slot="canvas-status"
        className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-border px-3"
      >
        <p
          data-slot="canvas-hint"
          className="truncate text-[11px] leading-snug text-muted-foreground"
        >
          {!hasArtwork
            ? "An empty plate exports perfectly well — add a logo in the Design panel when you want one."
            : pinned
              ? "The logo fills the canvas, so it is pinned to the middle. Drag a corner in to make room again."
              : moved || resized
                ? `${moved ? `${Math.round(offset.x)}, ${Math.round(offset.y)} units` : "Centred"} · drawn at ${Math.round(scale * 100)}%${clamped ? ` · export fitted to ${Math.round(fit * 100)}%` : ""}`
                : "Drag the logo to position it, and a corner handle to resize it. Arrow keys nudge; shift nudges further."}
        </p>
        <Button
          variant={samples ? "default" : "outline"}
          size="sm"
          data-slot="preview-toggle"
          aria-expanded={samples}
          title="Show the icon at the sizes it is judged at"
          onClick={() => setSamples((open) => !open)}
          className="shrink-0"
        >
          <IconEye />
          Preview
        </Button>
      </div>
    </div>
  );
}
