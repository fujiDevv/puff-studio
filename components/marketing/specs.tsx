import {
  IconArrowsMaximize,
  IconPaletteFilled,
  IconPhoto,
  IconRadiusTopRight,
} from "@tabler/icons-react";

import { EXPORT_TARGETS, MARK_BOX } from "@/lib/engine/targets";
import { BG_MODES, DEFAULT_RADIUS } from "@/lib/engine/types";
import { PALETTES } from "@/lib/engine/palettes";
import { TEMPLATES } from "@/lib/templates";

/**
 * "By the number" — the levers, with the values the studio actually exposes
 * rather than adjectives. The counts are read from the engine's own tables, so a
 * palette added tomorrow changes this copy instead of leaving it claiming eight.
 */
const CARDS = [
  {
    icon: IconPhoto,
    title: "Artwork",
    value: `${Math.round(MARK_BOX * 200)}%`,
    unit: "of canvas",
    body: `Your own file, centred in a fixed box and never distorted: it is fitted with \`meet\`, so a wide logo touches the sides and a square one touches the corners. Every export is scaled so it survives that platform's mask.`,
  },
  {
    icon: IconPaletteFilled,
    title: "Palette",
    value: `${PALETTES.length}`,
    unit: "fields",
    body: `Saturated fields, each with a second colour and a haze that reads as air over the plate rather than a second gradient. ${BG_MODES.length} field modes — solid, linear, radial, glow — and both colours are yours to pick.`,
  },
  {
    icon: IconRadiusTopRight,
    title: "Radius",
    value: `${DEFAULT_RADIUS}`,
    unit: "canvas units",
    body: "The plate's corner, in the same 1,024-unit space as everything else, and a plain circular arc rather than a superellipse. The default is the reference frame's own radius, so the plate is that shape exactly.",
  },
  {
    icon: IconArrowsMaximize,
    title: "Export",
    value: `${EXPORT_TARGETS.length}`,
    unit: "targets",
    body: "An opaque 1,024 square for the App Store, a 512 for Play, both Android adaptive layers, and the SVG master — each PNG fitted to its own safe area, each square because the platform masks it.",
  },
];

export function Specs() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
      <div className="flex max-w-2xl flex-col gap-3">
        <h2 className="font-display text-2xl font-[450] tracking-tight sm:text-3xl">
          {TEMPLATES.length} looks, {EXPORT_TARGETS.length} files, one canvas.
        </h2>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          There is no prompt field here, because a prompt would only be a
          roundabout way of setting these values. Every control writes straight
          into the document that gets exported, and every readout states a real
          number rather than a position on a slider.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(({ icon: Icon, title, value, unit, body }) => (
          <div
            key={title}
            className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-(--custom-shadow)"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-3.5" />
              </span>
              <span className="flex items-baseline gap-1">
                <span className="tabular-nums font-display text-lg font-[450]">
                  {value}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {unit}
                </span>
              </span>
            </div>
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="text-xs leading-5 text-muted-foreground text-pretty">
              {body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
