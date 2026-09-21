"use client";

import { IconDownload } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect } from "react";

import { Logo } from "@/components/marketing/logo";
import { Editor } from "@/components/studio/editor";
import { ExportPanel } from "@/components/studio/export-panel";
import { LooksPanel } from "@/components/studio/looks-panel";
import { MarkRestore } from "@/components/studio/mark-restore";
import { Preview } from "@/components/studio/preview";
import { Readouts } from "@/components/studio/readouts";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStudio } from "@/lib/store";
import { TEMPLATES, templateById } from "@/lib/templates";

/**
 * The studio: two columns, and nothing else.
 *
 * It used to be three regions — a 284px look rail, a scrolling middle column where
 * the plate sat in a card above a Design card, and the export panel below that.
 * Three regions for two things: a document, and the controls for it. So there are
 * two now, split the way a design tool splits them:
 *
 *  - **The canvas** takes the whole left side and the whole height. No card, no
 *    mat, no inner scroll: the plate is the largest square that fits and the
 *    surface around it belongs to the canvas. Everything you *look at* is here.
 *  - **The editor** is the right column, and it is complete: the look library, the
 *    three design tabs, the measurements, and the way out. Everything you *change*
 *    is here, in one scrolling panel instead of distributed across the page.
 *
 * The header moved with it. A document title, the export button and the theme
 * switch belong to the editor rather than to the canvas, which is what lets the
 * canvas be full-bleed — a title bar across the top of a stage would be exactly
 * the chrome this is getting rid of.
 *
 * `Looks` is collapsed in `LooksPanel`, not here, and the export panel is a
 * popover: both are surfaces you open rather than regions that are always on
 * screen. Between them the standing chrome is now a header row and three section
 * labels.
 */
export default function StudioPage() {
  const templateId = useStudio((s) => s.templateId);
  const setTemplate = useStudio((s) => s.setTemplate);

  /**
   * Open a look the visitor picked from the landing page's wall.
   *
   * Read from `window.location` in an effect rather than `useSearchParams`: that
   * hook forces a Suspense boundary around the whole page, and a look pick is a
   * client-side nicety — the page is useful without it. An id that is not in the
   * library is ignored rather than resolved, because it comes off a URL anyone can
   * type and `templateById` throws on an unknown one.
   */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("template");
    if (!id || !TEMPLATES.some((t) => t.id === id)) return;
    setTemplate(id);
  }, [setTemplate]);

  const template = templateById(templateId);

  return (
    <div className="page-fade-in flex h-dvh flex-col overflow-hidden md:flex-row">
      {/* Renders nothing. Restores the artwork and the look from the last visit,
          and keeps them saved as they change. */}
      <MarkRestore />

      {/* The canvas column. A fixed share of the height on a phone, where the two
          columns stack; the whole left side from `md` up. */}
      <main className="flex h-[52vh] shrink-0 flex-col md:h-full md:min-h-0 md:flex-1">
        <Preview />
      </main>

      <aside
        data-slot="studio-editor"
        className="flex min-h-0 flex-1 flex-col border-t border-border bg-sidebar md:h-full md:w-[360px] md:flex-none md:border-t-0 md:border-l"
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
          <Link href="/" aria-label="Puff Studio home">
            <Logo />
          </Link>

          <h1
            data-slot="studio-title"
            className="min-w-0 flex-1 truncate font-display text-sm font-medium tracking-tight"
          >
            {template.name}
          </h1>

          {/* The way out of the studio, and the only one. The file set is a
              statement about the whole document rather than about any one lever in
              the editor below it, so it hangs off the header as a popover. */}
          <Popover>
            <PopoverTrigger data-slot="export-trigger" render={<Button size="sm" />}>
              <IconDownload />
              <span className="hidden sm:inline">Export</span>
            </PopoverTrigger>
            <PopoverContent className="w-[min(92vw,25rem)]">
              <ExportPanel />
            </PopoverContent>
          </Popover>

          <ThemeSwitcher data-slot="studio-theme" />
        </header>

        {/* The editor's own scroll, so the canvas never moves while you work. */}
        <div
          data-slot="studio-editor-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <LooksPanel />

          <section
            data-slot="design-section"
            className="flex flex-col gap-3 border-b border-border px-4 py-4"
          >
            <span className="text-sm font-medium">Design</span>
            <Editor />
          </section>

          <Readouts />

          <p className="border-t border-border px-4 py-4 text-[11px] leading-snug text-muted-foreground text-pretty">
            Free, with no account. Everything runs in this browser — your artwork is
            never uploaded, and there is no model in the loop.
          </p>
        </div>
      </aside>
    </div>
  );
}
