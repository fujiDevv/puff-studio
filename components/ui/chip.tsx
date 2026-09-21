"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A pill toggle, for wherever the UI offers a small closed set of options — the
 * brief's vibes, shapes, and finishes, and the inspector's safe-area guide.
 *
 * The `pointer-coarse:` sizing is deliberate rather than decoration. The compact
 * `xs` control is right under a mouse and well under Apple's 44pt / Material's
 * 48dp minimum under a thumb, so it grows only where the pointer is coarse.
 * Faking that with an expanded pseudo-element hit area instead would make
 * neighbouring chips overlap and steal each other's taps — and on a wrapped row
 * of nine shape chips they would overlap in both axes.
 */
export function Chip({
  active,
  onClick,
  children,
  className,
  title,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
  /**
   * A disabled chip is used to say "this control cannot act right now, and here
   * is why" — the caller passes the reason through `title`. Selecting a shape
   * while a custom image is loaded is the case it exists for.
   */
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "capitalize ring-0 pointer-coarse:min-h-11 pointer-coarse:px-4",
        disabled && "opacity-40",
        className,
      )}
    >
      {children}
    </Button>
  );
}
