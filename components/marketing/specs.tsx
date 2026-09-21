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
 *
 * The bodies are one line each. The detail that used to be here — how `meet`
 * fits a wide logo, why the corner is an arc and not a superellipse — is real, but
 * it is the README's job, and a visitor deciding whether to open the studio is not
 * reading a spec sheet.
 */
const CARDS = [
  {
    icon: IconPhoto,
    title: "Artwork",
    value: `${Math.round(MARK_BOX * 200)}%`,
    unit: "of canvas",
    body: "Your file, centred and never distorted.",
  },
  {
    icon: IconPaletteFilled,
    title: "Palette",
    value: `${PALETTES.length}`,
    unit: "fields",
    // The count stays interpolated, because this file's rule is that the copy
    // cannot drift from the engine's tables. The mode *names* are dropped: they
    // are one tab away in the studio, where they are clickable rather than read.
    body: `${BG_MODES.length} field modes, and both colours are yours to pick.`,
  },
  {
    icon: IconRadiusTopRight,
    title: "Radius",
    value: `${DEFAULT_RADIUS}`,
    unit: "canvas units",
    body: "A plain circular arc, in canvas units. The default is the reference frame's own.",
  },
  {
    icon: IconArrowsMaximize,
    title: "Export",
    value: `${EXPORT_TARGETS.length}`,
    unit: "targets",
    body: "Each PNG fitted to its platform's safe area, plus the SVG master.",
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
          Every control writes straight into the document you export.
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
