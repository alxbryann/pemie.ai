// Landing pública de pemie.ai. Compone secciones independientes (una por
// bloque del diseño) sobre el mismo design system del dashboard — sin
// dependencias nuevas, sin markup de negocio: solo transporte visual.

import { api } from "../../lib/api.js";
import { LandingNav } from "./sections/LandingNav.js";
import { Hero } from "./sections/Hero.js";
import { ProblemSection } from "./sections/ProblemSection.js";
import { HowItWorks } from "./sections/HowItWorks.js";
import { DualSurface } from "./sections/DualSurface.js";
import { CommitsDomains } from "./sections/CommitsDomains.js";
import { ReportsSection } from "./sections/ReportsSection.js";
import { StoriesKanban } from "./sections/StoriesKanban.js";
import { McpSection } from "./sections/McpSection.js";
import { TelegramSection } from "./sections/TelegramSection.js";
import { FinalCta } from "./sections/FinalCta.js";
import { LandingFooter } from "./sections/LandingFooter.js";

export default function Landing() {
  const githubUrl = api.auth.githubUrl("/app");

  return (
    <div>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-white"
      >
        Saltar al contenido
      </a>
      <LandingNav githubUrl={githubUrl} />
      <main id="contenido">
        <Hero githubUrl={githubUrl} />
        <ProblemSection />
        <HowItWorks />
        <DualSurface />
        <CommitsDomains />
        <ReportsSection />
        <StoriesKanban />
        <McpSection />
        <TelegramSection />
        <FinalCta githubUrl={githubUrl} />
      </main>
      <LandingFooter />
    </div>
  );
}
