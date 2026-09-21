import { LandingPage } from "@/components/marketing/landing-page";

/**
 * The homepage carries no metadata of its own.
 *
 * It used to export `title: "Puff Studio — app icons, designed not generated"`,
 * which the root layout's `%s · Puff Studio` template then appended to — so the
 * head read "… designed not generated · Puff Studio" with the brand in it twice.
 * The root's `title.default` is already that exact string, and its
 * `alternates.canonical` is already `/`, so the shortest correct answer here is
 * nothing at all.
 */
export default function Home() {
  return <LandingPage />;
}
