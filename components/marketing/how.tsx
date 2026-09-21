import { IconCheck } from "@tabler/icons-react";

import { TEMPLATES } from "@/lib/templates";

/**
 * How it works — three steps, described in the studio's own terms.
 *
 * The bodies and the asides are one line each. They used to be paragraphs
 * explaining *why* the app behaves as it does, which is the README's job: a
 * landing page that argues its case is a landing page nobody finishes.
 */
const STEPS = [
  {
    title: "Add your artwork",
    body: "SVG, PNG, WebP, or JPEG, up to 2MB. Read in your browser and embedded in the file — never uploaded.",
    aside: "Checked before it is decoded.",
  },
  {
    title: "Design the plate",
    body: `Pick one of ${TEMPLATES.length} looks, then set the corner radius by the number.`,
    aside: "The rim is not a control.",
  },
  {
    title: "Check and export",
    body: "Turn on the iOS or Android guide to see the exact fit, then download the whole set.",
    aside: "66/108 is the tightest mask.",
  },
];

export function How() {
  return (
    <section className="border-y border-border/60 bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 className="font-display text-2xl font-[450] tracking-tight sm:text-3xl">
            Three steps. No retrying.
          </h2>
          <p className="text-sm leading-6 text-muted-foreground text-pretty">
            The renderer is deterministic: the same document always draws the same
            icon.
          </p>
        </div>

        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span className="tabular-nums flex size-6 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background">
                {index + 1}
              </span>
              <h3 className="font-display text-base font-[450] tracking-tight">
                {step.title}
              </h3>
              <p className="text-xs leading-5 text-muted-foreground text-pretty">
                {step.body}
              </p>
              <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground/80">
                <IconCheck className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                {step.aside}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
