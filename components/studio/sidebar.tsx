"use client";

import Link from "next/link";

import { Logo } from "@/components/marketing/logo";
import { TemplateGallery } from "@/components/studio/gallery";
import { Button } from "@/components/ui/button";

/**
 * The studio's sidebar.
 *
 * The look library *is* the navigation here — there is one screen, and the only
 * thing you navigate is which surface you are working on — so the sidebar holds
 * the gallery rather than a list of routes. It scrolls independently of the
 * canvas, which is what makes an infinite list workable: the thing you are
 * designing never scrolls away while you browse.
 *
 * On a phone there is no room for a fixed rail, so the same element becomes a
 * capped-height block above the canvas. It is one instance at every width rather
 * than two behind a breakpoint — two copies would double every `data-slot` the
 * checks count.
 *
 * The footer used to hold a plan button. There is no plan any more: with the
 * built-in marks gone, the premium set had nothing left to be premium *about*,
 * and every look is free. What replaces it is the one fact worth stating, since
 * it is the reason there is nothing to sign up for.
 */
export function StudioSidebar() {
  return (
    <aside
      data-slot="studio-sidebar"
      className="flex max-h-[52vh] shrink-0 flex-col border-b border-border bg-sidebar md:h-full md:max-h-none md:w-[284px] md:border-b-0 md:border-r"
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
        <Link href="/" aria-label="Puff Studio home">
          <Logo />
        </Link>
        <Button variant="ghost" size="sm" render={<Link href="/" />}>
          Home
        </Button>
      </div>

      <TemplateGallery className="flex-1 pt-1" />

      <p className="shrink-0 border-t border-border p-3 text-[11px] leading-snug text-muted-foreground text-pretty">
        Free, with no account. Everything runs in this browser — your artwork is
        never uploaded, and there is no model in the loop.
      </p>
    </aside>
  );
}
