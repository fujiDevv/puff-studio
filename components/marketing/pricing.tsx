"use client";

import { IconCheck } from "@tabler/icons-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EXPORT_TARGETS } from "@/lib/engine/targets";
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
 * into over- or under-claiming. The feature list is three lines rather than five:
 * the palette count and the radius each have a card in Specs above, and repeating
 * them here was the same claim twice on one page.
 */
const FEATURES = [
  `${TEMPLATES.length} looks, all free`,
  "Your artwork stays on your machine",
  `The full export set — ${EXPORT_TARGETS.length} targets plus the SVG master`,
];

export function Pricing() {
  return (
    <section id="free" className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
      <div className="flex max-w-2xl flex-col gap-3">
        <h2 className="font-display text-2xl font-[450] tracking-tight sm:text-3xl">
          Free. There is nothing to sign up for.
        </h2>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          The whole studio runs in your browser — no account, no upload, no model.
        </p>
      </div>

      <div className="mt-10 rounded-2xl bg-card p-6 shadow-(--custom-shadow-lifted) ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Everything</h3>
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
