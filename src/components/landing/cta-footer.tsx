import Link from "next/link";

import { Button } from "@/components/ui/button";

export function CtaFooter() {
  const ano = new Date().getFullYear();

  return (
    <>
      <section className="bg-[#0a2c4d] px-6 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            Pronto pra parar de perder tempo com documentação?
          </h2>
          <p className="mt-4 text-slate-300">
            Crie sua conta e gere seu primeiro Memorial Descritivo ainda hoje.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 bg-cyan-600 text-white shadow-lg shadow-cyan-900/30 hover:bg-cyan-500"
          >
            <Link href="/register">Comece agora</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#081f38] px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-slate-400 sm:flex-row">
          <span>© {ano} DocObra.</span>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-white">
              Entrar
            </Link>
            <Link href="/register" className="hover:text-white">
              Cadastre-se
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
