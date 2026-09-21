import { IconCheck } from "@tabler/icons-react";

import { TEMPLATES } from "@/lib/templates";

/**
 * How it works — three steps, described in the studio's own terms.
 *
 * Step 2 is deliberately specific about the numbers, because "exact readouts" is
 * the claim this app is built on and a vague step would undersell it.
 */
const STEPS = [
  {
    title: "Add your artwork",
    body: "SVG, PNG, WebP, or JPEG — dropped, pasted, or picked, up to 2MB. The file is read in your browser and embedded in the document, so there is no upload step, no endpoint, and nothing to retain. It is kept for your next visit and never sent anywhere.",
    aside: "The type and the size are checked before anything is decoded.",
  },
  {
    title: "Design the plate",
    body: `Choose one of ${TEMPLATES.length} looks — a field palette, a gradient mode, and a finish — then set the corner radius by the number. 218.18 is the reference frame's own radius, so the default plate is that shape unit for unit, and every value reads exactly as it lands in the file.`,
    aside: "The rim, the haze, and the gleams are not controls: they are what makes it a plate.",
  },
  {
    title: "Check the safe area, then export",
    body: "Turn on the iOS or Android guide and the preview is fitted exactly as the export will be, with the scale printed beside it. Then download the set: two opaque squares, both adaptive layers, and the SVG master — which is the one file that keeps your corners.",
    aside: "The 66/108 adaptive circle is the tightest mask of the four.",
  },
];

export function How() {
  return (
    <section className="border-y border-border/60 bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 className="font-display text-2xl font-[450] tracking-tight sm:text-3xl">
            Three steps, and none of them is a retry.
          </h2>
          <p className="text-sm leading-6 text-muted-foreground text-pretty">
            The renderer is deterministic, so the same document always produces
            the same artwork. That is what makes an editor possible at all: if the
            output moved on its own, no slider could be trusted.
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
