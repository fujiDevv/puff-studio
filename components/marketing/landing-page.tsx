import { Footer } from "@/components/marketing/footer";
import { Hero } from "@/components/marketing/hero";
import { How } from "@/components/marketing/how";
import { Pricing } from "@/components/marketing/pricing";
import { SiteHeader } from "@/components/marketing/site-header";
import { Specs } from "@/components/marketing/specs";

export function LandingPage() {
  return (
    <div className="page-fade-in flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Hero />
        <Specs />
        <How />
        <div id="pricing">
          <Pricing />
        </div>
      </main>
      <Footer />
    </div>
  );
}
