import { IconArrowNarrowDown, IconSparkles } from "@tabler/icons-react";
import Link from "next/link";

import { SampleWall } from "@/components/marketing/sample-wall";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SAMPLE_MARKS, SAMPLE_SHOWCASE } from "@/lib/sample-marks";
import { TEMPLATES } from "@/lib/templates";

/**
 * The hero.
 *
 * The wall is full-bleed rather than boxed, which is the point: the tiles are
 * meant to run off both edges so the library reads as larger than the viewport.
 * `overflow-x-clip` on the section does that without handing the page a
 * horizontal scrollbar, and — unlike `overflow-hidden` — it leaves vertical
 * spill alone, so the tiles' hover lift and their shadows are not guillotined
 * at the section's edge.
 *
 * The wall shows sample *logos* on the looks, not the bare looks: a plate is a
 * surface, and a surface with nothing on it cannot say whether a mark will read
 * on it. The caption states that they are stand-ins rather than implying it,
 * because the page's promise is that the studio ships no marks at all.
 */
export function Hero() {
  return (
    <section className="relative overflow-x-clip">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-6 pt-16 text-center sm:pt-24">
        <Badge variant="outline">
          <IconSparkles className="size-3 text-amber-500" />
          No prompts, no model, no waiting
        </Badge>

        <h1 className="font-display text-4xl leading-[1.05] font-[450] tracking-tight text-balance sm:text-5xl">
          App icons, designed &mdash; not generated.
        </h1>

        <p className="max-w-xl text-base leading-7 text-muted-foreground text-pretty">
          Your logo on a plate you can edit by the number. Pick a look, set the
          radius, export every size.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button size="lg" render={<Link href="/studio" />}>
            Open the studio
          </Button>
          <Button
            size="lg"
            variant="outline"
            render={<a href="#templates" />}
          >
            See the looks
            <IconArrowNarrowDown />
          </Button>
        </div>

        <p className="pt-1 text-xs text-muted-foreground">
          All {TEMPLATES.length} looks are free. No account, and your artwork never
          leaves your browser.
        </p>
      </div>

      <div className="relative mt-12 sm:mt-16" id="templates">
        <SampleWall />
        {/* Edge fades, so the tiles read as running off the page rather than
            being sliced at a hard line. Drawn from the page background so they
            track the theme. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent sm:w-28" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent sm:w-28" />
      </div>

      <p className="mx-auto mt-8 max-w-xl px-6 text-center text-xs leading-5 text-muted-foreground text-pretty">
        {SAMPLE_MARKS.length} sample logos on {SAMPLE_SHOWCASE.length} of the looks.
        Your own file replaces one in a drop.
      </p>

      <dl className="mx-auto mt-12 grid max-w-lg grid-cols-3 gap-4 px-6 text-center sm:mt-14">
        {[
          { value: "1,024", label: "user space" },
          { value: "4", label: "export targets" },
          { value: "0", label: "network calls" },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col">
            <dt className="sr-only">{stat.label}</dt>
            <dd className="tabular-nums font-display text-xl font-[450]">
              {stat.value}
            </dd>
            <dd className="text-xs text-muted-foreground">{stat.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
