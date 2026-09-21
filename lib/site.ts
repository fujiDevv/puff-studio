/**
 * The site's identity, as data.
 *
 * One definition feeding `metadata`, `robots.ts`, `sitemap.ts`, `manifest.ts`,
 * and the brand-asset generator, because the canonical origin appears in all of
 * them. A domain typed out five times is five places for it to be wrong, and the
 * failure is quiet: a sitemap pointing at `example.com` still validates, and a
 * relative `og:image` still renders — it just resolves against whatever host
 * fetched it, including `localhost` on a preview deploy.
 *
 * `SITE.url` is the origin with **no trailing slash**, which matters for the two
 * places that concatenate onto it (`/sitemap.xml`, and every entry in the
 * sitemap). `metadataBase` wants a slash-free base too, and normalises either way.
 */
export const SITE = {
  url: "https://puff-studio.jsar.men",
  name: "Puff Studio",
  /** The full title, for the homepage and for link previews. */
  title: "Puff Studio — app icons, designed not generated",
  /** The H1, reused on the card so the preview and the page agree. */
  tagline: "App icons, designed — not generated.",
  /**
   * One description, reused by every consumer. It ends up in `meta[name=description]`,
   * `og:description`, `twitter:description` and the manifest, and those four being
   * the *same sentence* is the point — a preview that promises something the page
   * does not is worse than a short one.
   */
  description:
    "Pick a look, place and resize your logo, and export pixel-perfect iOS and Android icon sets — 44 looks, free, in the browser. No prompts, no generation, no waiting.",
  /**
   * Deliberately narrow. Generic terms like "app icon" are unwinnable and would
   * only dilute the specific ones a person actually types to find this: the
   * platform files and masks the studio is *about*.
   */
  keywords: [
    "app icon maker",
    "iOS app icon",
    "Android adaptive icon",
    "1024 app icon",
    "squircle app icon",
    "icon design studio",
    "app icon export",
    "adaptive icon foreground",
  ],
  /** The brand plate's own blue, which is also the manifest's toolbar tint. */
  themeColor: "#2B63F6",
  /** The reference plate's near-black field, for the install splash. */
  backgroundColor: "#0F0F13",
} as const;
