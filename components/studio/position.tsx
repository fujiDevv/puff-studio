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
import { MAX_OFFSET_UNITS, clampOffset } from "@/lib/engine/targets";
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
  const offset = clampOffset(artwork?.offset);
  const moved = offset.x !== 0 || offset.y !== 0;
  const disabled = !artwork;

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
          {disabled
            ? "—"
            : moved
              ? `${Math.round(offset.x)}, ${Math.round(offset.y)}`
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
          Drag the logo on the canvas, or nudge it here — {STEP} units a press,
          shift for {STEP * COARSE}. It can travel{" "}
          {Math.round(MAX_OFFSET_UNITS)} units from the centre before its box
          would leave the canvas.
        </p>
      </div>
    </div>
  );
}
