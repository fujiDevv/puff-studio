import type { Metadata } from "next";

import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "Puff Studio — app icons, designed not generated",
};

export default function Home() {
  return <LandingPage />;
}
