"use client";

import { IconPaletteFilled, IconRadiusTopRight } from "@tabler/icons-react";

import { Separator } from "@/components/ui/separator";
import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { PALETTES } from "@/lib/engine/palettes";
import { BG_MODES, MAX_RADIUS } from "@/lib/engine/types";
import { PALETTE_ROLES, useStudio, type PaletteColorRole } from "@/lib/store";
import { RADIUS_RECIPES } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * The look: what the plate is made of, independent of what sits on it.
 *
 * The three groups are the plate's whole appearance — its colours, the shape of
 * its field's light, and its corners — so they are one tab rather than three
 * accordions. Nothing here touches the artwork, which is the point: the Look tab
 * can be rearranged under a logo without disturbing it.
 *
 * The radius is offered twice on purpose. The slider is the continuous control, in
 * the 1024 user space like every other measurement in this studio; the recipes are
 * the four other values worth having, each one named. They are the same
 * `setRadius` call, so a chip is a shortcut and not a mode — moving the slider
 * afterwards leaves none of them pressed, which is exactly how a shortcut should
 * behave.
 */
export function Look({ className }: { className?: string }) {
  const direction = useStudio((s) => s.direction);
  const setPaletteId = useStudio((s) => s.setPaletteId);
  const setPaletteColor = useStudio((s) => s.setPaletteColor);
  const setBgMode = useStudio((s) => s.setBgMode);
  const setRadius = useStudio((s) => s.setRadius);

  // Which shipped palette, if any, the document still sits on. The field colour
  // identifies it: no two of them share one, so a match means the palette has not
  // been touched.
  const namedPaletteId =
    PALETTES.find(
      (p) => p.palette.bg.toLowerCase() === direction.palette.bg.toLowerCase(),
    )?.id ?? null;

  const activeRadius =
    RADIUS_RECIPES.find((r) => Math.abs(r.value - direction.radius) < 0.01)?.id ?? null;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="flex flex-col gap-2">
        <Label>
          <IconPaletteFilled className="size-3.5" />
          Palette
        </Label>
        <div data-slot="editor-palette" className="flex flex-wrap gap-2">
          {PALETTES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={entry.label}
              aria-label={entry.label}
              aria-pressed={entry.id === namedPaletteId}
              onClick={() => setPaletteId(entry.id)}
              className={cn(
                "size-7 cursor-pointer rounded-full transition-transform pointer-coarse:size-11",
                entry.id === namedPaletteId
                  ? "ring-2 ring-ring ring-offset-2 ring-offset-card"
                  : "hover:scale-105",
              )}
              style={{
                background: `linear-gradient(135deg, ${entry.palette.bg} 38%, ${entry.palette.bg2} 100%)`,
              }}
            />
          ))}
        </div>

        {/* The colour pickers sit below the swatches rather than behind a
            "custom" mode: a colour you can only reach after a second click is a
            colour most people never find. Editing either one is what makes the
            palette custom, and the swatch row reports that by no longer matching
            a named palette. */}
        <div data-slot="editor-colors" className="mt-1 grid grid-cols-2 gap-1.5">
          {PALETTE_ROLES.map(({ role, label, hint }) => (
            <label key={role} title={hint} className="flex flex-col items-center gap-1">
              <span className="sr-only">{label}</span>
              <input
                type="color"
                data-slot="editor-color"
                data-role={role}
                aria-label={label}
                value={toHex(direction.palette[role])}
                onChange={(event) =>
                  setPaletteColor(role as PaletteColorRole, event.target.value)
                }
                className="h-7 w-full cursor-pointer rounded-md border border-border bg-transparent p-0 pointer-coarse:h-11 [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0"
              />
              <span className="truncate text-[10px] text-muted-foreground">{label}</span>
            </label>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground text-pretty">
          {namedPaletteId
            ? "Pick any colour to make this palette your own; the swatch row clears when you do."
            : "A custom palette. Only the field is coloured here — your artwork brings its own."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Field</Label>
        <div data-slot="editor-field" className="flex flex-wrap gap-2">
          {BG_MODES.map((mode) => (
            <Chip
              key={mode}
              active={direction.palette.bgMode === mode}
              onClick={() => setBgMode(mode)}
            >
              {mode}
            </Chip>
          ))}
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label>
            <IconRadiusTopRight className="size-3.5" />
            Corner radius
          </Label>
          <span
            data-slot="radius-readout"
            className="tabular-nums text-xs text-muted-foreground"
          >
            {direction.radius.toFixed(2)} u
          </span>
        </div>

        <div data-slot="editor-radius-recipes" className="flex flex-wrap gap-2">
          {RADIUS_RECIPES.map((recipe) => (
            <Chip
              key={recipe.id}
              active={recipe.id === activeRadius}
              title={`${recipe.value.toFixed(2)} units`}
              onClick={() => setRadius(recipe.value)}
            >
              {recipe.label}
            </Chip>
          ))}
        </div>

        <Slider
          value={direction.radius}
          min={0}
          max={MAX_RADIUS}
          step={1}
          onValueChange={(next) => setRadius(Array.isArray(next) ? next[0] : (next as number))}
        />
        <p
          data-slot="editor-radius-note"
          className="text-[11px] leading-snug text-muted-foreground text-pretty"
        >
          {activeRadius === "reference"
            ? "218.18 is the reference frame’s own radius, so this plate is that shape exactly."
            : `${activeRadius ? `“${RADIUS_RECIPES.find((r) => r.id === activeRadius)?.label}” ` : ""}The four platform masters keep square corners on purpose — iOS and Play apply their own — so this shapes the preview and the SVG you download.`}
        </p>
      </div>
    </div>
  );
}

/**
 * `<input type="color">` only accepts a six-digit hex. The palettes already are
 * hex, but a widened value would render the picker black instead of failing, so
 * it is normalised rather than assumed.
 */
function toHex(value: string) {
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
  }
  return "#000000";
}
