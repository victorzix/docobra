import { getSessionUser } from "@/lib/auth/session";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { ComoFunciona } from "@/components/landing/como-funciona";
import { Planos } from "@/components/landing/planos";
import { Faq } from "@/components/landing/faq";
import { CtaFooter } from "@/components/landing/cta-footer";

export default async function Home() {
  const sessao = await getSessionUser();

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader logado={!!sessao} />
      <Hero />
      <ComoFunciona />
      <Planos />
      <Faq />
      <CtaFooter />
    </div>
  );
}
