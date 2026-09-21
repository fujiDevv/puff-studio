"use client";

import {
  IconDeviceDesktopFilled,
  IconMoonFilled,
  IconSunFilled,
} from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: IconSunFilled },
  { value: "dark", label: "Dark", icon: IconMoonFilled },
  { value: "system", label: "System", icon: IconDeviceDesktopFilled },
] as const;

export function ThemeSwitcher({
  className,
  ...props
}: ComponentProps<"div">) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      className={cn(
        "inline-flex w-fit items-center gap-0.5 rounded-full bg-muted p-[3px] pointer-coarse:p-1",
        className,
      )}
      role="radiogroup"
      aria-label="Theme"
      {...props}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = mounted && theme === value;
        return (
          <Button
            key={value}
            variant={active ? "outline" : "ghost"}
            size="icon-xs"
            // 24px is fine under a mouse and under half the 44pt/48dp minimum
            // under a thumb, so it only grows for a coarse pointer.
            className="pointer-coarse:size-11"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
          >
            <Icon />
          </Button>
        );
      })}
    </div>
  );
}
