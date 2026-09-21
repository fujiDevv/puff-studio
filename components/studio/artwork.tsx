"use client";

import { IconPhoto, IconTrash, IconUpload } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { describeMark, prepareMark } from "@/lib/image";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The artwork control: pick, drop, or paste a file.
 *
 * Three things about this are deliberate, and all three are about the same
 * promise that nothing is uploaded.
 *
 *  - **It says so where a user will read it**, rather than only in a README. A
 *    logo upload is the one place in this app anyone would reasonably assume a
 *    server is involved, so the copy states the opposite and the picker is the
 *    whole mechanism.
 *  - **It refuses before it reads.** The type and the size are checked before
 *    anything is decoded, so a 40MB photo is rejected instead of being pulled
 *    into memory and rejected afterwards.
 *  - **It takes a file, not a link.** Dragging an image out of another tab hands
 *    over a URL with no bytes, which cannot be embedded and would fail later at
 *    export time with nothing to explain it.
 *
 * Pasting is listened for on the window, since there is nothing to focus first,
 * and is ignored while the caret is in a field: a paste that replaced the artwork
 * while someone was typing would be the worst kind of surprise.
 */
export function Artwork({ className }: { className?: string }) {
  const artwork = useStudio((s) => s.direction.artwork);
  const setArtwork = useStudio((s) => s.setArtwork);
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function accept(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareMark(file);
      setArtwork(prepared);
      toast.success("Artwork added", { description: describeMark(prepared) });
    } catch (error) {
      toast.error("Could not use that image", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
      // Cleared so picking the same file twice still fires a change event —
      // otherwise "replace" silently does nothing after a failed attempt.
      if (input.current) input.current.value = "";
    }
  }

  const open = () => input.current?.click();

  // Registered without a dependency list on purpose: it closes over `accept`,
  // which closes over the store, and a stale listener would apply a file to an
  // editor that had already unmounted.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as Element | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const data = event.clipboardData;
      const item = [...(data?.items ?? [])].find((i) => i.kind === "file");
      // `items` is the one that survives a screenshot paste; `files` is the
      // fallback for browsers that fill it and leave the item list empty.
      const file = item?.getAsFile() ?? data?.files?.[0];
      if (!file) return;
      event.preventDefault();
      void accept(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  return (
    <div className={cn("flex flex-col gap-2", className)} data-slot="artwork">
      <Label>
        <IconPhoto className="size-3.5" />
        Your artwork
      </Label>

      <input
        ref={input}
        type="file"
        data-slot="artwork-input"
        accept=".svg,.png,.webp,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/jpeg"
        className="sr-only"
        onChange={(event) => void accept(event.target.files?.[0])}
      />

      <div
        data-slot="artwork-drop"
        data-dragging={dragging ? "true" : "false"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          if (!dropped) {
            toast.error("That was a link, not a file", {
              description: "Save the image and pick it, so the pixels can be embedded.",
            });
            return;
          }
          void accept(dropped);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-3 py-4 text-center transition-colors",
          dragging && "border-ring bg-muted/60",
        )}
      >
        {artwork ? (
          <>
            {/* The artwork itself, not a generic thumbnail: it is rendered by the
                same code path as the canvas, so what you see here is already
                what will be exported. */}
            <span className="block size-12 overflow-hidden rounded-lg bg-muted/60">
              <img src={artwork.href} alt="" className="size-full object-contain" />
            </span>
            <span
              data-slot="artwork-name"
              className="max-w-full truncate text-[11px] text-muted-foreground"
            >
              {describeMark(artwork)}
            </span>
            <span className="flex gap-1.5">
              <Button variant="outline" size="xs" onClick={open} disabled={busy}>
                <IconUpload />
                Replace
              </Button>
              <Button
                variant="ghost"
                size="xs"
                data-slot="artwork-remove"
                onClick={() => setArtwork(null)}
              >
                <IconTrash />
                Remove
              </Button>
            </span>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={open} disabled={busy}>
              <IconUpload />
              {busy ? "Preparing…" : "Choose a file"}
            </Button>
            <span className="text-[11px] leading-snug text-muted-foreground text-pretty">
              SVG, PNG, WebP, or JPEG — up to 2MB. Drop a file, paste one, or
              choose one. It is embedded in the document and never uploaded
              anywhere, and it is kept in this browser for your next visit.
            </span>
          </>
        )}
      </div>

      {/* Where the logo sits is the next control in this tab, not the last
          paragraph of this one: the offset is a `Position` panel now, so a drag
          on the canvas and a nudge here write the same value through one
          component instead of two. */}
    </div>
  );
}
