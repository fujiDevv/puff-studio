"use client";

import { IconCheck } from "@tabler/icons-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EXPORT_TARGETS } from "@/lib/engine/targets";
import { BG_MODES, DEFAULT_RADIUS } from "@/lib/engine/types";
import { PALETTES } from "@/lib/engine/palettes";
import { TEMPLATES } from "@/lib/templates";

/**
 * There is one tier now, and this section exists to say so plainly.
 *
 * It used to be a two-column comparison, because twelve of the twenty-eight
 * templates were premium. Those twelve were premium *shapes* — an outlined
 * monogram, a glossier burst — and with the built-in marks gone there is nothing
 * left for a paid tier to be about. Rather than inventing a new one, the paywall
 * is removed: every look is free, and so is every export.
 *
 * The counts come from the tables the studio reads, so this copy cannot drift
 * into over- or under-claiming.
 */
const FEATURES = [
  `${TEMPLATES.length} looks, all free — ${PALETTES.length} field palettes, ${BG_MODES.length} modes`,
  "Your own artwork as the plate's logo — brought in as a file, never uploaded",
  `Every palette colour and the ${DEFAULT_RADIUS} corner radius, editable by the number`,
  `The full export set — ${EXPORT_TARGETS.length} targets plus the SVG master`,
  "iOS and Android safe-area guides with exact fits",
];

export function Pricing() {
  return (
    <section id="free" className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
      <div className="flex max-w-2xl flex-col gap-3">
        <h2 className="font-display text-2xl font-[450] tracking-tight sm:text-3xl">
          Free, and there is nothing to sign up for.
        </h2>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          The whole studio runs in your browser. There is no account, no upload,
          and no model behind it — which also means there is no per-use cost that
          would make a paywall make sense. Your artwork stays on your machine, and
          the files are yours either way.
        </p>
      </div>

      <div className="mt-10 rounded-2xl bg-card p-6 shadow-(--custom-shadow-lifted) ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Everything, included</h3>
          <span className="flex items-baseline gap-1">
            <span className="tabular-nums font-display text-xl font-[450]">$0</span>
            <span className="text-xs text-muted-foreground">forever</span>
          </span>
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-xs leading-5">
              <IconCheck className="mt-0.5 size-3 shrink-0 text-emerald-500" />
              <span className="text-muted-foreground text-pretty">{feature}</span>
            </li>
          ))}
        </ul>

        <Button
          className="mt-6 w-full pointer-coarse:min-h-11"
          render={<Link href="/studio" />}
        >
          Open the studio
        </Button>
      </div>
    </section>
  );
}
