"use client";

import { IconAdjustmentsHorizontal } from "@tabler/icons-react";

import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { Finish } from "@/lib/engine/types";
import { useStudio } from "@/lib/store";
import { FINISH_RECIPES } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * The finish values, as data — one row per value, rendered once.
 *
 * Two rows, and that is the whole set. The plate's own light and its rim are not
 * controls: they are what makes it a plate. Inflate, the specular cap, the rim
 * light and the outline width used to sit here and all four read the mark's own
 * geometry, which a bitmap does not have — so there is nothing left to adjust.
 */
interface FinishRow {
  key: keyof Finish;
  label: string;
  /** Why this row is off while the plate is empty, if it is. */
  needsArtwork?: boolean;
}

const FINISH_ROWS: FinishRow[] = [
  // The contact shadow is cast by the artwork, so with an empty plate there is
  // nothing to cast it. Off rather than hidden, and it keeps its value on screen
  // so the document does not look like it lost the setting.
  { key: "shadow", label: "Shadow", needsArtwork: true },
  { key: "grain", label: "Grain" },
];

/**
 * The finish: how much the plate sits up off the page, and how much texture it
 * carries.
 *
 * Both values are shown exactly rather than as a percentage of a range: this is
 * the "by the number" half of the studio, and 0.68 means 0.68 in the file. The
 * recipes above the sliders are the same five the looks are built from, so a look
 * can be walked toward a finish without abandoning a palette or a radius — and
 * because they write both values at once, they are a genuine starting point for
 * the sliders rather than a parallel setting that fights them.
 */
export function FinishPanel({ className }: { className?: string }) {
  const finish = useStudio((s) => s.direction.finish);
  const hasArtwork = useStudio((s) => Boolean(s.direction.artwork));
  const setFinish = useStudio((s) => s.setFinish);

  const activeRecipe =
    FINISH_RECIPES.find(
      (r) =>
        Math.abs(r.finish.shadow - finish.shadow) < 0.005 &&
        Math.abs(r.finish.grain - finish.grain) < 0.005,
    )?.id ?? null;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Label>
        <IconAdjustmentsHorizontal className="size-3.5" />
        Finish
      </Label>

      <div data-slot="editor-finish-recipes" className="flex flex-wrap gap-2">
        {FINISH_RECIPES.map((recipe) => (
          <Chip
            key={recipe.id}
            active={recipe.id === activeRecipe}
            title={`shadow ${recipe.finish.shadow.toFixed(2)} · grain ${recipe.finish.grain.toFixed(2)}`}
            onClick={() => setFinish(recipe.finish)}
          >
            {recipe.label}
          </Chip>
        ))}
      </div>

      {FINISH_ROWS.map((row) => (
        <Range
          key={row.key}
          rowKey={row.key}
          label={row.label}
          value={finish[row.key]}
          disabled={Boolean(row.needsArtwork) && !hasArtwork}
          disabledReason="Add artwork to cast a shadow"
          onChange={(next) => setFinish({ [row.key]: next } as Partial<Finish>)}
        />
      ))}

      <p className="text-[11px] leading-snug text-muted-foreground text-pretty">
        {hasArtwork
          ? "The shadow is the artwork’s own, so it moves and grows with it. Grain is a texture on the plate itself."
          : "Grain still applies on an empty plate: it is a texture on the plate rather than on what sits on it."}
      </p>
    </div>
  );
}

/**
 * A slider that reports its exact value.
 *
 * A disabled slider keeps its value on screen: hiding it would make the document
 * look like it had lost the setting, when it is only not being drawn.
 */
function Range({
  label,
  rowKey,
  value,
  onChange,
  max = 1,
  step = 0.01,
  decimals = 2,
  disabled = false,
  disabledReason,
}: {
  label: string;
  /** The `Finish` key this row drives, so the reason a row is off is machine-readable. */
  rowKey: keyof Finish;
  value: number;
  onChange: (value: number) => void;
  max?: number;
  step?: number;
  decimals?: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div
      data-slot="editor-range"
      data-row={rowKey}
      data-disabled={disabled ? "true" : "false"}
      title={disabled ? disabledReason : undefined}
      className={cn("flex flex-col gap-2", disabled && "opacity-45")}
    >
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="tabular-nums text-xs text-muted-foreground">
          {value.toFixed(decimals)}
          {max > 1 ? " u" : ""}
        </span>
      </div>
      <Slider
        value={value}
        min={0}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : (next as number))}
      />
    </div>
  );
}
