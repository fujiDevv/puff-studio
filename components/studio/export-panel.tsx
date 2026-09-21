"use client";

import { IconCopy, IconDownload } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  downloadExportSet,
  rasterizeTarget,
  slugify,
  svgMaster,
  targetFilename,
} from "@/lib/engine/client";
import { artworkExtent, EXPORT_TARGETS, fitFor } from "@/lib/engine/targets";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The export panel — the contents of the header's popover.
 *
 * Every target is listed with the numbers that decide whether it survives its
 * platform's mask — the raster size, the safe area, and the fit this document
 * resolves to — because "pixel-perfect" is a claim you should be able to check
 * before spending a download on it.
 *
 * Each row can also be downloaded on its own, and the SVG can be copied to the
 * clipboard: a browser asked for five downloads at once will often prompt about
 * it, and a developer who only wants the vector should not have to take the
 * PNGs as well.
 *
 * Nothing here is gated, and nothing is withheld until the artwork is loaded —
 * an empty plate exports perfectly well. What the table cannot hide is the one
 * asymmetry worth being loud about: the four PNGs are square on purpose, because
 * each platform masks the master itself, while the SVG carries your corners.
 *
 * It sits behind a button in the header because the file set is a statement about
 * the whole document, not about any one lever in the Design panel beside it — and
 * because "where do I get the files" should not be answered by scrolling.
 */
export function ExportPanel({ className }: { className?: string }) {
  const direction = useStudio((s) => s.direction);
  const guide = useStudio((s) => s.guide);
  const setGuide = useStudio((s) => s.setGuide);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const slug = slugify(direction.title);

  async function onExportAll() {
    setExporting(true);
    try {
      const written = await downloadExportSet(direction, slug);
      toast.success(`Exported ${written.length} files`, {
        description: written.join(", "),
      });
    } catch (error) {
      toast.error("Export failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  }

  async function onExportOne(target: (typeof EXPORT_TARGETS)[number]) {
    setBusy(target.id);
    try {
      const blob = await rasterizeTarget(target, direction);
      const filename = targetFilename(target, slug);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(filename, { description: target.label });
    } catch (error) {
      toast.error("Export failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function onCopySvg() {
    try {
      // The *same* function the SVG download uses, rather than the same options
      // written out a second time: a copy that differed from the download would
      // be the kind of bug nobody reports, because both files look fine alone.
      // `clipboard` is undefined outside a secure context, which is a real way
      // for this to fail — a LAN preview over plain http, for instance. Checked
      // rather than left to throw, so the message says what to do about it.
      if (!navigator.clipboard?.writeText) {
        throw new Error(
          "This browser blocks clipboard access here. Open the studio over https or localhost.",
        );
      }
      await navigator.clipboard.writeText(svgMaster(direction));
      toast.success("SVG copied", {
        description: `${slug}-icon.svg — 1024 units, your logo embedded, radius ${direction.radius.toFixed(2)}`,
      });
    } catch (error) {
      toast.error("Could not copy", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} data-slot="export-panel">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Export</span>
        <span className="text-xs text-muted-foreground">
          {EXPORT_TARGETS.length} files + SVG
        </span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="pb-1 font-medium">Target</th>
            <th className="pb-1 text-right font-medium">px</th>
            <th className="pb-1 text-right font-medium">Safe</th>
            <th className="pb-1 text-right font-medium">Fit</th>
            <th className="pb-1" />
          </tr>
        </thead>
        <tbody className="align-baseline">
          {EXPORT_TARGETS.map((target) => {
            const fit = fitFor(target, direction.finish, direction.artwork?.offset);
            const shape = target.safeBox ? "box" : target.safeCircle ? "circle" : null;
            const limit = target.safeBox ?? target.safeCircle;
            const extent = shape ? artworkExtent(shape) : null;
            return (
              <tr
                key={target.id}
                data-slot="export-target"
                data-target-id={target.id}
                className={cn(
                  "cursor-pointer border-t border-border/60",
                  guide === target.id && "bg-muted/50",
                )}
                onClick={() => setGuide(guide === target.id ? null : target.id)}
                title={target.note}
              >
                <td className="py-1.5 text-xs">{target.label}</td>
                <td className="py-1.5 text-right tabular-nums text-xs">
                  {target.size}
                </td>
                <td className="py-1.5 text-right tabular-nums text-xs text-muted-foreground">
                  {limit ? `${(limit * 2 * 100).toFixed(1)}%` : "bleed"}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right tabular-nums text-xs",
                    fit < 1 ? "text-foreground" : "text-muted-foreground",
                  )}
                  title={
                    extent
                      ? `Artwork reaches ${extent.toFixed(3)} of the canvas; fits at ${fit.toFixed(3)}`
                      : "Background layer only"
                  }
                >
                  {fit.toFixed(2)}
                </td>
                <td className="py-1.5 pl-1 text-right">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Download ${target.label}`}
                    disabled={busy === target.id}
                    onClick={(event) => {
                      // The row's own click selects the safe-area guide; this
                      // button must not also do that.
                      event.stopPropagation();
                      void onExportOne(target);
                    }}
                  >
                    <IconDownload />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-col gap-2">
        <Button
          onClick={onExportAll}
          disabled={exporting}
          className="w-full pointer-coarse:min-h-11"
        >
          <IconDownload />
          {exporting ? "Writing files…" : "Download the set"}
        </Button>
        <Button
          variant="outline"
          data-slot="export-copy"
          onClick={onCopySvg}
          className="w-full pointer-coarse:min-h-11"
        >
          <IconCopy />
          Copy SVG
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground text-pretty">
        Opaque 1024 for the App Store, a 512 for Play, both Android adaptive
        layers, and the SVG master. Click a row to see its safe area on the
        canvas, or the arrow to take just that file. The four PNGs keep square
        corners because the platform applies its own; the SVG keeps yours.
      </p>
    </div>
  );
}
