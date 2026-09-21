"use client";

import { useEffect } from "react";

import { loadSessionMark, saveSessionMark } from "@/lib/mark-session";
import { useStudio } from "@/lib/store";

/**
 * Restores the artwork and the look from the last visit, and keeps them saved as
 * they change. Renders nothing.
 *
 * The restore happens in an effect rather than at store creation on purpose: a
 * store hydrated during module evaluation would run on the server-rendered pass
 * too, and the markup would then depend on state the server cannot see. An effect
 * runs after hydration, so the document is always the same on both sides.
 *
 * Saving is a *subscription* rather than a second effect on the artwork. An effect
 * keyed on the value would fire once on mount with the document still empty —
 * before the restore had been applied — and wipe the very thing being restored.
 * A subscription only hears about changes, so the initial empty state is never
 * written back.
 */
export function MarkRestore() {
  const setTemplate = useStudio((s) => s.setTemplate);
  const setArtwork = useStudio((s) => s.setArtwork);

  useEffect(() => {
    const saved = loadSessionMark();
    if (saved.templateId) setTemplate(saved.templateId);
    if (saved.artwork) setArtwork(saved.artwork);

    return useStudio.subscribe((state, previous) => {
      if (
        state.direction.artwork === previous.direction.artwork &&
        state.templateId === previous.templateId
      ) {
        return;
      }
      saveSessionMark({
        templateId: state.templateId,
        artwork: state.direction.artwork ?? null,
      });
    });
  }, [setTemplate, setArtwork]);

  return null;
}
