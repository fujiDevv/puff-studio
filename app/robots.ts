import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

/**
 * `/robots.txt`.
 *
 * Nothing is disallowed, which is the whole content of this file: the app has no
 * private area, no account, and no per-user route, so there is no path a crawler
 * could reach that a human should not. A `Disallow` list here would be cargo
 * cult — the reason not to index something is that it is *private*, not that it
 * is dynamic, and the studio is the opposite: it is the page that answers "app
 * icon maker".
 *
 * The `sitemap` line is the part that earns the file. Without it a crawler finds
 * `/studio` only by following a link, and it is one route with no inbound links
 * from anywhere else on the web.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
