"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

/**
 * A panel anchored to the control that opens it.
 *
 * The distinction from `dropdown-menu.tsx` is semantic rather than visual: a menu
 * is a list of *commands* and hands its items menu roles and menu keyboard
 * navigation, while this holds a table you read and a couple of buttons. The
 * export panel is the second kind, so it is a popover — the roles stay honest and
 * the arrow keys are not hijacked for something that is not a menu.
 *
 * Anchored rather than centred (`dialog.tsx`) because the trigger *is* the answer
 * to "where did this come from": the header button stays visible behind the panel,
 * so the connection between the lever and the panel survives it being open.
 */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  align = "end",
  side = "bottom",
  sideOffset = 8,
  className,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            // Capped to the height the positioner says is actually free, so a
            // popover under a header on a short viewport scrolls instead of
            // running off the bottom of the screen.
            "z-50 max-h-(--available-height) overflow-y-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-(--custom-shadow) duration-100 outline-none squircle:rounded-2xl corner-squircle data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
