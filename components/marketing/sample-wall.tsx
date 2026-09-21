import Link from "next/link";

import { IconTile } from "@/components/icon-tile";
import { Marquee } from "@/components/marquee";
import { SAMPLE_SHOWCASE, sampleMarkById } from "@/lib/sample-marks";
import { templateById } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * The wall of *finished* plates — the hero's proof, rendered by the shipping
 * engine.
 *
 * This replaced a wall of empty looks. An empty plate is an honest thing to show
 * in a gallery that is choosing a surface, but it is a poor thing to open a page
 * with: a visitor cannot tell from a bare gradient whether a logo will read on it,
 * and the first impression of an icon studio was of a set of coloured squares. The
 * marks are stand-ins and the surface under them is real, so these tiles answer
 * the question the page exists to answer — what comes out — instead of only
 * implying it.
 *
 * Everything is the same object an upload becomes: a `data:` URL drawn through
 * `renderSvg` in the same 1024 user space, so the rim, the haze and the grain here
 * are the exporter's output rather than a mock-up of it. The links open the *look*
 * the tile is standing on; the sample mark is not a starting point and is never
 * offered as one.
 *
 * Two rows, alternating tempo and direction, because the marquee primitive
 * requires every row to carry the whole set — rows are *rotated* rather than
 * sliced, so no two rows show the same tiles side by side and each row is
 * seamless at any width.
 */

const ROWS = [
  { duration: "130s", reverse: false },
  { duration: "170s", reverse: true },
] as const;

export function SampleWall({ className }: { className?: string }) {
  const tiles = SAMPLE_SHOWCASE.map(({ look, mark }) => ({
    look,
    template: templateById(look),
    sample: sampleMarkById(mark),
  }));

  return (
    <div
      data-slot="sample-wall"
      className={cn("flex flex-col gap-4 select-none sm:gap-5", className)}
    >
      {ROWS.map((row, index) => {
        const offset = Math.floor((tiles.length / ROWS.length) * index);
        const ordered = [...tiles.slice(offset), ...tiles.slice(0, offset)];

        return (
          <Marquee
            key={index}
            slot="sample-wall"
            items={ordered}
            duration={row.duration}
            reverse={row.reverse}
            renderItem={(tile, copy) => (
              <Link
                key={`${copy}-${tile.look}`}
                href={`/studio?template=${tile.look}`}
                title={`${tile.sample.label} on ${tile.template.name} — open this look`}
                aria-label={`${tile.template.name} look, shown with a sample logo`}
                tabIndex={copy === 1 ? -1 : undefined}
                data-slot="sample-wall-tile"
                data-look={tile.look}
                className="mr-4 block w-20 shrink-0 sm:mr-5 sm:w-24 lg:w-28"
              >
                <span className="block transition-transform duration-300 hover:-translate-y-1">
                  <IconTile
                    direction={{
                      ...tile.template.direction,
                      artwork: tile.sample.artwork,
                    }}
                    uid={`wall${index}${copy}${tile.look}`}
                    title={tile.sample.label}
                  />
                </span>
              </Link>
            )}
          />
        );
      })}
    </div>
  );
}
