import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

/**
 * `/sitemap.xml`.
 *
 * Two URLs, and the second is the reason to have a sitemap at all: the landing
 * page is reachable from search, but the studio is reachable only by clicking
 * through, so it is exactly the kind of page a sitemap exists to surface.
 *
 * **No `lastModified`, deliberately.** The obvious implementation is
 * `new Date()`, which is worse than nothing: it claims every page changed at
 * every build, and a crawler that learns a date is meaningless stops using it —
 * including for the day something genuinely did change. A hardcoded date rots the
 * same way, just more slowly. Omit the field and the claim is simply absent;
 * Google treats `lastmod` as untrustworthy anyway unless it is derived from a
 * real content revision, which this app does not track.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE.url,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE.url}/studio`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
}
