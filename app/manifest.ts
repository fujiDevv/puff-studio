import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

/**
 * `/manifest.webmanifest`.
 *
 * `start_url` is `/studio`, not `/`: someone who installs this wants the editor,
 * and opening on the marketing page every time makes the install a bookmark
 * rather than an app. The landing page is one link away, inside the studio's own
 * header.
 *
 * `display: "standalone"` because the editor is a full-bleed two-column surface —
 * a browser toolbar on top of it is chrome the layout was specifically built to
 * get rid of.
 *
 * Two icon entries describe one plate, and the distinction is not pedantry:
 * `purpose: "any"` is the icon as designed, with its rounded corners and
 * transparent outside them; `maskable` is the square, fully opaque master, because
 * an Android launcher crops a maskable icon to its own shape (circle, squircle,
 * rounded square) and a pre-rounded one would show transparent corners inside that
 * crop. That is the same square-vs-rounded split the exporter makes for iOS, in a
 * different place.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/studio",
    scope: "/",
    display: "standalone",
    background_color: SITE.backgroundColor,
    theme_color: SITE.themeColor,
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
