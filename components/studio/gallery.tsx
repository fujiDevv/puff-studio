"use client";

import { IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconTile } from "@/components/icon-tile";
import { Input } from "@/components/ui/input";
import { useStudio } from "@/lib/store";
import { TEMPLATES } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * How many cards to add per reach of the bottom.
 *
 * Eight is four rows of the sidebar's two-column grid. The size is a deliberate
 * trade: large enough that the list never looks sparse while scrolling, small
 * enough that the list has to page more than once. A batch that filled the
 * sidebar in a single go would leave the scrolling mechanism never exercised —
 * the observer would fire once on mount and the list would already be done.
 */
const BATCH = 8;

/** The fields a search term is matched against. */
function matches(template: (typeof TEMPLATES)[number], term: string) {
  return (
    template.name.toLowerCase().includes(term) ||
    template.blurb.toLowerCase().includes(term) ||
    template.tags.some((tag) => tag.includes(term))
  );
}

/**
 * The look gallery.
 *
 * Every tile is drawn by the same deterministic engine that will export the
 * files, so what you pick is what you get — and because a look carries no mark,
 * each tile is the plate itself: the field, its atmosphere, the rim, and the
 * radius. The default tile is the honest preview of an empty studio.
 *
 * ## Why the list pages itself in
 *
 * The library is finite, so this cannot be infinitely long, and it is worth being
 * exact about what "infinite scroll" can mean here: the list starts with a
 * screenful and appends another batch whenever the sentinel at the bottom comes
 * into view. It gives the browsing feel a grid was missing — one continuous
 * column you scroll rather than a wall that ends after four rows — and it stops
 * honestly at the end with a count instead of looping the library back on itself.
 * A loop would mean the same look appearing twice under two scroll positions,
 * which for a picker is a bug dressed as a feature.
 *
 * The scroll container is the list itself, not the page, which matters for two
 * reasons: the sidebar stays put while you browse, and `root` can be handed to
 * the observer explicitly instead of relying on the viewport.
 */
export function TemplateGallery({ className }: { className?: string }) {
  const templateId = useStudio((s) => s.templateId);
  const setTemplate = useStudio((s) => s.setTemplate);
  const query = useStudio((s) => s.query);
  const setQuery = useStudio((s) => s.setQuery);

  const [count, setCount] = useState(BATCH);

  const scroller = useRef<HTMLDivElement | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => !term || matches(t, term));
  }, [query]);

  // A new filter is a new list: reset the page count, or a narrower result set
  // would inherit a page count from a wider one and open already "finished".
  // Scroll position goes back to the top for the same reason.
  useEffect(() => {
    setCount(BATCH);
    scroller.current?.scrollTo({ top: 0 });
  }, [query]);

  const hasMore = count < filtered.length;

  useEffect(() => {
    const node = sentinel.current;
    const root = scroller.current;
    if (!node || !root || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCount((c) => Math.min(c + BATCH, filtered.length));
        }
      },
      // The margin starts the next batch slightly before the sentinel is on
      // screen, so the list is already longer by the time you reach the end and
      // the scroll never visibly stalls.
      { root, rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

  return (
    <section
      data-slot="template-gallery"
      className={cn("flex min-h-0 flex-col gap-3", className)}
    >
      {/* No header row of its own. The section that holds this gallery already
          shows the library's name and its count, and two rows saying "Looks" in
          one column is one row too many. */}
      <div className="relative px-3">
        <IconSearch className="pointer-events-none absolute left-5.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a look, colour, or mood"
          aria-label="Search looks"
          data-slot="template-search"
          className="pl-8 pointer-coarse:min-h-11"
        />
      </div>

      <div
        ref={scroller}
        data-slot="template-list"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3"
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-2">
          {filtered.slice(0, count).map((template) => {
            const active = template.id === templateId;
            return (
              <button
                key={template.id}
                type="button"
                data-slot="template-card"
                data-template-id={template.id}
                title={template.blurb}
                onClick={() => setTemplate(template.id)}
                className={cn(
                  "group cursor-pointer rounded-2xl p-1.5 text-left transition-shadow pointer-coarse:min-h-11",
                  active
                    ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                    : "hover:ring-2 hover:ring-ring/25 hover:ring-offset-2 hover:ring-offset-background",
                )}
              >
                <IconTile
                  direction={template.direction}
                  uid={`tmpl${template.id.replace(/[^a-z0-9]/gi, "")}`}
                  title={template.name}
                />
                <span className="mt-1.5 block text-[11px] leading-tight font-medium">
                  {template.name}
                </span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p
            data-slot="template-empty"
            className="px-1 py-6 text-center text-xs text-muted-foreground"
          >
            Nothing matches “{query}”. Try a colour like <em>ink</em> or a mood
            like <em>calm</em>.
          </p>
        )}

        {/* The sentinel. Kept out of the accessibility tree — it is a scroll
            mechanism, not content — and rendered even when exhausted, where it
            becomes the end marker instead. */}
        <div ref={sentinel} aria-hidden className="h-px w-full" />
        {filtered.length > 0 && !hasMore && (
          <p
            data-slot="template-end"
            className="py-3 text-center text-[11px] text-muted-foreground"
          >
            All {filtered.length} looks shown
          </p>
        )}
      </div>
    </section>
  );
}
