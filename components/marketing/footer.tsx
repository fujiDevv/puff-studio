import Link from "next/link";

import { Logo } from "@/components/marketing/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { EXPORT_TARGETS } from "@/lib/engine/targets";
import { TEMPLATES } from "@/lib/templates";

const LINKS = [
  { href: "/studio", label: "Studio" },
  { href: "#templates", label: "Looks" },
  { href: "#pricing", label: "Pricing" },
];

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="max-w-sm text-xs leading-5 text-muted-foreground text-pretty">
            {TEMPLATES.length} looks, {EXPORT_TARGETS.length} export targets, one
            canvas.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:items-end">
          <nav className="flex flex-wrap items-center gap-4">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <ThemeSwitcher />
        </div>
      </div>
    </footer>
  );
}
