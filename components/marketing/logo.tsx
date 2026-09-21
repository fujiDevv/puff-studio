import { IconTile } from "@/components/icon-tile";
import { BRAND, BRAND_UID } from "@/lib/brand";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The Puff mark, drawn by the same renderer as everything else in the product.
 *
 * The document itself lives in `lib/brand.ts`, because the generated favicon and
 * social card are rasterized from it too — see that file.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      data-slot="logo"
      className={cn("inline-flex items-center gap-2", className)}
    >
      <span className="block w-6 shrink-0">
        <IconTile direction={BRAND} uid={BRAND_UID} title={SITE.name} />
      </span>
      <span className="font-display text-sm font-medium tracking-tight">
        {SITE.name}
      </span>
    </span>
  );
}
