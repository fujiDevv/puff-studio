import Link from "next/link";

import { Logo } from "@/components/marketing/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link href="/" aria-label="Puff Studio home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1">
          {/* The switcher lives here as well as in the footer: the studio is
              behind a click, so the header is the last place a visitor can
              change their mind about the theme before they land somewhere that
              really needs the right one. */}
          <ThemeSwitcher className="mr-1 hidden sm:inline-flex" />
          <Button variant="ghost" size="sm" render={<a href="#templates" />}>
            Looks
          </Button>
          <Button variant="ghost" size="sm" render={<a href="#free" />}>
            Free
          </Button>
          <Button size="sm" render={<Link href="/studio" />}>
            Open the studio
          </Button>
        </nav>
      </div>
    </header>
  );
}
