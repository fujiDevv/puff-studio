import type { Metadata, Viewport } from "next";
import { Geist_Mono, Host_Grotesk, Inter } from "next/font/google";

import Providers from "@/components/providers";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for marketing headings only (via the `font-display` utility
// resolved in globals.css). The studio keeps Inter for everything.
const hostGrotesk = Host_Grotesk({
  variable: "--font-host-grotesk",
  subsets: ["latin"],
});

/**
 * The document head.
 *
 * Two things here are load-bearing rather than decorative:
 *
 *  - **`metadataBase`.** Every URL below is written *relative* (`/og.png`,
 *    `/icon.svg`) so no asset path is spelled out twice, and a relative Open Graph
 *    image that has no base resolves against the fetching host — so a link to a
 *    preview deploy would advertise `localhost` as the image. The base is the one
 *    place the domain is written, and `SITE.url` is the one place it is *defined*.
 *  - **`title.template`.** `%s · Puff Studio` only helps if no page also writes the
 *    brand into its own title. The homepage used to, and rendered
 *    "Puff Studio — app icons… · Puff Studio". Pages now set a bare name (or,
 *    for the homepage, nothing at all, inheriting `title.default`).
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.title,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [...SITE.keywords],
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    url: "/",
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
    title: SITE.title,
    description: SITE.description,
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // The plate is the product, so a large thumbnail is the point of it.
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

/**
 * Tints the browser UI to the brand blue on mobile, and declares both schemes so
 * the `ThemeSwitcher` and the OS preference agree about what is possible.
 */
export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(inter.variable)}>
      <body
        className={cn(
          inter.variable,
          geistMono.variable,
          hostGrotesk.variable,
          "antialiased",
        )}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
