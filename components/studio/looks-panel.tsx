"use client";

import {
  IconArrowsShuffle,
  IconChevronRight,
  IconRefresh,
} from "@tabler/icons-react";
import { useState } from "react";

import { TemplateGallery } from "@/components/studio/gallery";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/store";
import { TEMPLATES, templateById } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * The look library, as a section of the editor rather than a column of its own.
 *
 * It used to be a 284px rail down the side, which cost the page a third region
 * for something you use once, at the start, and then leave. As a collapsible
 * section it costs one row when you are done with it — and the row keeps saying
 * what the collapsed state would otherwise hide, which is *which look you are
 * working from*.
 *
 * Shuffle and Reset live here rather than in the header for the same reason: both
 * are statements about the look, not about the document as a whole. Shuffle picks
 * another one; Reset throws away your edits and reloads this one, which is why it
 * is offered only while there is something to discard.
 *
 * Open by default. Collapsing is the opt-in, not the resting state — a library
 * nobody can find is worse than one that takes a row of height.
 */
export function LooksPanel({ className }: { className?: string }) {
  const templateId = useStudio((s) => s.templateId);
  const direction = useStudio((s) => s.direction);
  const setTemplate = useStudio((s) => s.setTemplate);
  const shuffle = useStudio((s) => s.shuffle);

  const [open, setOpen] = useState(true);

  const template = templateById(templateId);
  // The document drifts from its look the moment anyone touches a control, which
  // is the point of an editor — so "reset" is offered explicitly, and only while
  // it would actually do something.
  const edited = JSON.stringify(template.direction) !== JSON.stringify(direction);

  return (
    <section
      data-slot="looks-panel"
      data-open={open ? "true" : "false"}
      className={cn("flex min-h-0 flex-col border-b border-border", className)}
    >
      <div className="flex items-center gap-0.5 px-3 py-2">
        <button
          type="button"
          data-slot="looks-toggle"
          aria-expanded={open}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="text-sm font-medium">Looks</span>
          <span data-slot="looks-current" className="truncate text-[11px] text-muted-foreground">
            {template.name} · {TEMPLATES.length} · all free
          </span>
        </button>

        <Button
          variant="ghost"
          size="icon-sm"
          data-slot="looks-shuffle"
          aria-label="Load a different look at random"
          title="Load a different look at random"
          onClick={shuffle}
        >
          <IconArrowsShuffle />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          data-slot="looks-reset"
          aria-label="Discard your edits and reload this look"
          title={
            edited
              ? "Discard your edits and reload this look"
              : "This look has not been edited yet"
          }
          disabled={!edited}
          onClick={() => setTemplate(templateId)}
        >
          <IconRefresh />
        </Button>
      </div>

      {open && (
        <div id="looks-body" className="min-h-0">
          {/* Capped rather than unbounded: the editor below it has to stay
              reachable, and the list pages itself in as you scroll, so a shorter
              window costs nothing but the scroll. */}
          <TemplateGallery className="max-h-[min(44vh,24rem)] pb-3" />
        </div>
      )}
    </section>
  );
}
