"use client";

import { IconResize } from "@tabler/icons-react";

import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  MAX_MARK_SCALE,
  MIN_MARK_SCALE,
  clampScale,
  markHalf,
  maxOffsetUnits,
} from "@/lib/engine/targets";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * How big the logo is drawn, as a multiple of the default box.
 *
 * This is the sliders-not-handles half of resizing. The canvas has corner handles,
 * and a handle is the gesture; but a gesture on its own has no readout, no way to
 * type a value, and no way to get back to exactly where you were. So the same
 * number is offered here — and this is the control that actually states the trade
 * the resize makes, which the canvas cannot: **a bigger logo has less room to
 * move**, because the box has to stay on the canvas.
 *
 * The percentages are of the *canvas*, not of the range, which is the number a
 * designer is actually deciding: "how much of the icon does the logo claim". At
 * `1.00` that is 60%, and `Fill canvas` is the point at which it is 100% — the
 * scale at which a square image touches all four edges and `meet` has no margin
 * left to give.
 */
const RECIPES = [
  { id: "compact", label: "Compact", value: 0.5 },
  { id: "default", label: "Default", value: 1 },
  { id: "wide", label: "Wide", value: 1.3 },
  { id: "fill", label: "Fill canvas", value: MAX_MARK_SCALE },
] as const;

export function Size({ className }: { className?: string }) {
  const artwork = useStudio((s) => s.direction.artwork);
  const setArtworkScale = useStudio((s) => s.setArtworkScale);

  const scale = clampScale(artwork?.scale);
  const share = Math.round(markHalf(scale) * 200);
  const travel = Math.round(maxOffsetUnits(scale));
  const disabled = !artwork;
  const active = RECIPES.find((r) => Math.abs(r.value - scale) < 0.005)?.id ?? null;

  return (
    <div className={cn("flex flex-col gap-2", className)} data-slot="size">
      <div className="flex items-center justify-between gap-2">
        <Label>
          <IconResize className="size-3.5" />
          Logo size
        </Label>
        <span
          data-slot="size-readout"
          className="tabular-nums text-xs text-muted-foreground"
        >
          {disabled ? "—" : `${scale.toFixed(2)}× · ${share}% of canvas`}
        </span>
      </div>

      <div data-slot="size-recipes" className="flex flex-wrap gap-2">
        {RECIPES.map((recipe) => (
          <Chip
            key={recipe.id}
            active={recipe.id === active}
            disabled={disabled}
            title={`${Math.round(markHalf(recipe.value) * 200)}% of the canvas`}
            onClick={() => setArtworkScale(recipe.value)}
          >
            {recipe.label}
          </Chip>
        ))}
      </div>

      <Slider
        data-slot="size-slider"
        value={scale}
        min={MIN_MARK_SCALE}
        max={MAX_MARK_SCALE}
        step={0.01}
        disabled={disabled}
        onValueChange={(next) =>
          setArtworkScale(Array.isArray(next) ? next[0] : (next as number))
        }
      />

      <p className="text-[11px] leading-snug text-muted-foreground text-pretty">
        {disabled
          ? "Add a file first — there is nothing to size yet."
          : travel === 0
            ? "At this size the logo spans the whole canvas, so it is locked to the middle: a mark that fills the plate has nowhere to go without leaving it."
            : `The logo keeps its own proportions at every size, and can still travel ${travel} units from the centre at this one — a larger logo has less room to move, because its box has to stay on the canvas.`}
      </p>
    </div>
  );
}
