import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A looping horizontal track.
 *
 * Two structural facts drive the markup, and neither is visible in the result:
 *
 *  - **The loop travels exactly `-50%`**, so the duplicate copy has to land where
 *    the first began. That makes the spacing a margin on each item rather than a
 *    flex `gap` between copies: a `gap` leaves the track half a gap short of two
 *    copies, and the seam jumps once per lap.
 *  - **One copy must cover the widest viewport** the row will meet, because the
 *    animation loops over a single copy. A row that is sliced to fit a phone is
 *    seamless there and shows a hole just before the restart on a desktop — so
 *    callers pass the whole set and rotate it instead of slicing it.
 *
 * `slot` names the four data attributes the checker drives (`${slot}-row`,
 * `-track`, `-copy`, and whatever `renderItem` puts on each item), so a row's
 * structure can be asserted without the markup being duplicated here.
 *
 * The row clips **sideways only**. The track is two copies wide, so something has
 * to stop it widening the page, but clipping vertically is a different thing
 * entirely: the tiles lift on hover and a plate's shadow wants a little room, and
 * a row that hides those is a row that shears its own items. `clip` is the one
 * value that can be paired with `visible` — with `hidden`, `overflow-y: visible`
 * computes to `auto`, the row becomes a scroll container, and the lift is cut off
 * anyway.
 */
export function Marquee<T>({
  slot,
  items,
  duration,
  reverse = false,
  className,
  renderItem,
}: {
  slot: string;
  items: T[];
  /** Seconds, as a CSS duration. Long on purpose: a fast marquee is unreadable. */
  duration: string;
  reverse?: boolean;
  className?: string;
  /** Must return a keyed element: the two copies render the same items. */
  renderItem: (item: T, copy: number) => ReactNode;
}) {
  return (
    <div
      data-slot={`${slot}-row`}
      className={cn("overflow-x-clip overflow-y-visible", className)}
    >
      <div
        data-slot={`${slot}-track`}
        className={cn(
          "flex w-max",
          reverse ? "animate-marquee-x-reverse" : "animate-marquee-x",
        )}
        style={{ "--marquee-duration": duration } as CSSProperties}
      >
        {[0, 1].map((copy) => (
          <div
            key={copy}
            data-slot={`${slot}-copy`}
            className="flex"
            // The duplicate is a visual device for the loop, not content: it
            // stays out of the accessibility tree so nobody meets every item
            // twice.
            aria-hidden={copy === 1 || undefined}
          >
            {items.map((item) => renderItem(item, copy))}
          </div>
        ))}
      </div>
    </div>
  );
}
