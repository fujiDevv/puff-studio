"use client";

import { IconRulerMeasure } from "@tabler/icons-react";

import { Label } from "@/components/ui/label";
import { CANVAS_SIZE } from "@/lib/engine/geometry";
import {
  artworkExtent,
  clampOffset,
  clampScale,
  fitFor,
  markHalf,
  targetById,
} from "@/lib/engine/targets";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The document's numbers, as an inspector.
 *
 * These used to sit under the plate, where they competed with it for height and
 * were most useful exactly when the plate was smallest. They are the same
 * measurements either way — the canvas, the radius, how big the logo is drawn, how
 * far the artwork reaches, and the scale the export will apply — so they belong
 * with the rest of the document's state rather than with the view.
 *
 * Five numbers and no adjectives on purpose: this is the "by the number" half of
 * the studio, and `0.696` is a fact where "slightly reduced" is not. The fit is
 * highlighted and explained only when it is actually doing something, because a
 * readout that shouts at 1.000 is noise.
 */
export function Readouts({ className }: { className?: string }) {
  const direction = useStudio((s) => s.direction);
  const guide = useStudio((s) => s.guide);

  const artwork = direction.artwork;
  const target = guide ? targetById(guide) : null;
  const scale = clampScale(artwork?.scale);
  const offset = clampOffset(artwork?.offset, scale);
  const fit = target ? fitFor(target, direction.finish, offset, scale) : 1;
  const extent = artworkExtent(target?.safeBox ? "box" : "circle", offset, scale);
  const half = markHalf(scale);

  return (
    <section
      data-slot="readouts"
      className={cn("flex flex-col gap-2 px-4 py-4", className)}
    >
      <Label>
        <IconRulerMeasure className="size-3.5" />
        Measurements
      </Label>

      <dl
        data-slot="preview-readout"
        className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-muted/60 p-3"
      >
        <Readout label="Canvas" value={`${CANVAS_SIZE}`} unit="u" />
        <Readout label="Radius" value={direction.radius.toFixed(2)} unit="u" />
        <Readout
          label="Logo size"
          value={scale === 1 ? "1.00" : scale.toFixed(2)}
          unit={`× · ${Math.round(half * 200)}% of canvas`}
          highlight={scale !== 1}
        />
        <Readout label="Artwork" value={extent.toFixed(3)} unit="of canvas" />
        <Readout
          label="Export fit"
          value={fit === 1 ? "1.00" : fit.toFixed(3)}
          unit="scale"
          highlight={fit < 1}
          className="col-span-2"
        />
      </dl>

      {fit < 1 && (
        <p className="text-[11px] leading-snug text-muted-foreground text-pretty">
          Scaled to {Math.round(fit * 100)}% so the artwork survives this
          platform&rsquo;s mask. Leading, trailing, and centred all stay exact — the
          scale is applied about the canvas centre. Resizing the logo changes how
          much of the canvas it claims, not this number: the fit is what the mask
          allows, so only making the artwork smaller stops it being clamped.
        </p>
      )}
    </section>
  );
}

function Readout({
  label,
  value,
  unit,
  highlight,
  className,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("tabular-nums text-sm font-medium", highlight && "text-foreground")}>
        {value}
      </dd>
      <dd className="text-[10px] text-muted-foreground">{unit}</dd>
    </div>
  );
}
