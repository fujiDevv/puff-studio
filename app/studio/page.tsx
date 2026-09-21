"use client";

import { IconArrowsShuffle, IconRefresh } from "@tabler/icons-react";
import { useEffect } from "react";

import { Editor } from "@/components/studio/editor";
import { ExportPanel } from "@/components/studio/export-panel";
import { MarkRestore } from "@/components/studio/mark-restore";
import { Preview } from "@/components/studio/preview";
import { StudioSidebar } from "@/components/studio/sidebar";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStudio } from "@/lib/store";
import { TEMPLATES, templateById } from "@/lib/templates";

export default function StudioPage() {
  const templateId = useStudio((s) => s.templateId);
  const direction = useStudio((s) => s.direction);
  const setTemplate = useStudio((s) => s.setTemplate);
  const shuffle = useStudio((s) => s.shuffle);

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
  // The document drifts from its look the moment anyone touches a control, which
  // is the point of an editor — so "reset" is offered explicitly, and only while
  // it would actually do something.
  const edited = JSON.stringify(template.direction) !== JSON.stringify(direction);

  return (
    <div className="page-fade-in flex h-dvh flex-col overflow-hidden md:flex-row">
      {/* Renders nothing. Restores the artwork and the look from the last visit,
          and keeps them saved as they change. */}
      <MarkRestore />

      <StudioSidebar />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate font-display text-sm font-medium tracking-tight">
              {template.name}
            </h1>
            {edited && (
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                edited
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeSwitcher data-slot="studio-theme" />
            <Button
              variant="outline"
              size="sm"
              onClick={shuffle}
              title="Load a different look at random"
            >
              <IconArrowsShuffle />
              Shuffle
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!edited}
              onClick={() => setTemplate(templateId)}
              title={
                edited
                  ? "Discard your edits and reload this look"
                  : "This look has not been edited yet"
              }
            >
              <IconRefresh />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid items-start gap-4 p-3 sm:p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="py-5">
              <CardContent className="px-4 sm:px-5">
                <Preview />
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card className="py-5">
                <CardHeader className="px-5">
                  <CardTitle>Design</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <Editor />
                </CardContent>
              </Card>

              <Card className="py-5">
                <CardContent className="px-5">
                  <ExportPanel />
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
