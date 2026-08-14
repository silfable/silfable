import { Hero } from "@/components/sections/Hero";

import { PageTransition } from "@/components/ui/PageTransition";

export default function Home() {
  return (
    <PageTransition className="homePageTransition">
      <main className="homeOneScreen">
        <Hero />
      </main>
    </PageTransition>
  );
}
