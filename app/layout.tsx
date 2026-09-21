import type { Metadata } from "next";
import { Geist_Mono, Host_Grotesk, Inter } from "next/font/google";

import Providers from "@/components/providers";
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

export const metadata: Metadata = {
  title: {
    default: "Puff Studio — app icons, designed not generated",
    template: "%s · Puff Studio",
  },
  description:
    "Pick a template, edit it by the number, and export pixel-perfect iOS and Android icon sets. No prompts, no generation, no waiting.",
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
