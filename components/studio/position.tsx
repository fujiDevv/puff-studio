"use client";

import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconFocusCentered,
} from "@tabler/icons-react";
import type { MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { clampOffset, clampScale, markTravel, maxOffsetUnits } from "@/lib/engine/targets";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Where the logo sits.
 *
 * Dragging on the canvas is the gesture, but a gesture is not an editing
 * interface on its own: it has no readout, no repeat, and no way to say "back to
 * the middle". So the same offset is offered here three ways — a nudge pad, the
 * exact value, and one button that undoes all of it — and all three write the
 * same `MarkOffset` the drag writes.
 *
 * The step is stated rather than implied, and shift multiplies it, because
 * "nudge" without a number is exactly the kind of control this studio does not
 * have: every other readout in the panel is a real value in the 1024 space.
 *
 * How far the logo can travel is not a constant, so it is not quoted as one: it is
 * the canvas half-width minus the box's own half-extent, and the Logo size
 * control moves that term. A mark scaled up to fill the canvas has nowhere to go
 * at all, which is why this panel disables itself rather than silently clamping
 * every press to nothing.
 */
const STEP = 8;
const COARSE = 4;

const PAD: { dx: number; dy: number; icon: typeof IconArrowUp; label: string }[] = [
  { dx: 0, dy: -STEP, icon: IconArrowUp, label: "Up" },
  { dx: -STEP, dy: 0, icon: IconArrowLeft, label: "Left" },
  { dx: STEP, dy: 0, icon: IconArrowRight, label: "Right" },
  { dx: 0, dy: STEP, icon: IconArrowDown, label: "Down" },
];

export function Position({ className }: { className?: string }) {
  const artwork = useStudio((s) => s.direction.artwork);
  const setArtworkOffset = useStudio((s) => s.setArtworkOffset);
  const scale = clampScale(artwork?.scale);
  const offset = clampOffset(artwork?.offset, scale);
  const moved = offset.x !== 0 || offset.y !== 0;
  // How far this mark can actually go, which the size decides: the box has to
  // stay on the canvas, so enlarging it takes the movement away. At the fill
  // scale there is none left, and a nudge button that does nothing would read as
  // broken rather than as a consequence.
  const travel = Math.round(maxOffsetUnits(scale));
  const pinned = markTravel(scale) === 0;
  const disabled = !artwork || pinned;

  const nudge =
    ({ dx, dy }: { dx: number; dy: number }) =>
    (event: MouseEvent) => {
      const step = event.shiftKey ? COARSE : 1;
      setArtworkOffset({ x: offset.x + dx * step, y: offset.y + dy * step });
    };

  return (
    <div className={cn("flex flex-col gap-2", className)} data-slot="position">
      <div className="flex items-center justify-between gap-2">
        <Label>Position</Label>
        <span
          data-slot="position-readout"
          className="tabular-nums text-xs text-muted-foreground"
        >
          {!artwork
            ? "—"
            : moved
              ? `${Math.round(offset.x)}, ${Math.round(offset.y)}`
              : pinned
                ? "Pinned"
                : "Centred"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div
          data-slot="position-pad"
          role="group"
          aria-label="Nudge the logo"
          className="grid grid-cols-3 grid-rows-3 gap-1"
        >
          {PAD.map(({ dx, dy, icon: Icon, label }) => (
            <Button
              key={label}
              variant="outline"
              size="icon-xs"
              data-slot="position-nudge"
              data-dx={dx}
              data-dy={dy}
              aria-label={`Nudge ${label.toLowerCase()}`}
              disabled={disabled}
              onClick={nudge({ dx, dy })}
              className={cn(
                // A plus shape: the middle cell is the recentre button below.
                label === "Up" && "col-start-2 row-start-1",
                label === "Left" && "col-start-1 row-start-2",
                label === "Right" && "col-start-3 row-start-2",
                label === "Down" && "col-start-2 row-start-3",
              )}
            >
              <Icon />
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon-xs"
            data-slot="position-centre"
            aria-label="Back to the centre"
            disabled={disabled || !moved}
            onClick={() => setArtworkOffset({ x: 0, y: 0 })}
            className="col-start-2 row-start-2"
          >
            <IconFocusCentered />
          </Button>
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground text-pretty">
          {!artwork
            ? "Add a file first — there is nothing to place yet."
            : pinned
              ? "The logo fills the canvas, so it is pinned to the middle. Make it smaller to give it somewhere to go."
              : `Drag the logo on the canvas, or nudge it here — ${STEP} units a press, shift for ${STEP * COARSE}. At this size it can travel ${travel} units from the centre before its box would leave the canvas.`}
        </p>
      </div>
    </div>
  );
}
