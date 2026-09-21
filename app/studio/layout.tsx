import type { Metadata } from "next";

import { SITE } from "@/lib/site";

/**
 * The studio's head.
 *
 * `app/studio/page.tsx` is a client component — it holds the editor's state — and
 * a client page cannot export `metadata`, so the route's head belongs to a layout
 * beside it. Without this, `/studio` shared the homepage's `title.default`
 * verbatim, so a browser tab and a search result both read as the landing page.
 *
 * The document is left **indexable**. It is not a private tool: it is the page
 * that answers "app icon maker", it renders a real (prehydrated) preview, and
 * `SITE.description` is the same promise the landing page makes.
 *
 * The Open Graph block is written out in full rather than inheriting the root's,
 * because nested metadata is *replaced* by a child route, not deep-merged — a
 * `{ url: "/studio" }` here would silently drop the social card and the images
 * with it.
 */
export const metadata: Metadata = {
  title: "Studio",
  description: SITE.description,
  alternates: { canonical: "/studio" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `Studio · ${SITE.name}`,
    description: SITE.description,
    url: "/studio",
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: `${SITE.name} — ${SITE.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Studio · ${SITE.name}`,
    description: SITE.description,
    images: ["/og.png"],
  },
};

export default function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
