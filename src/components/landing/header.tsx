import Link from "next/link";

import { Button } from "@/components/ui/button";

const LINKS_NAV = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader({ logado }: { logado: boolean }) {
  return (
    <header className="sticky top-0 z-50 bg-[#0a2c4d]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0a2c4d]/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-lg font-semibold tracking-tight text-white"
        >
          <span className="marca-gradiente size-2.5 rounded-full shadow-[0_0_12px_rgba(168,85,247,0.8)]" />
          DocObra
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS_NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group relative text-sm text-slate-300 transition-colors hover:text-white"
            >
              {link.label}
              <span className="marca-gradiente absolute -bottom-1.5 left-0 h-0.5 w-0 rounded-full transition-[width] duration-300 group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {logado ? (
            <Button
              asChild
              size="sm"
              className="marca-gradiente-escuro text-white shadow-lg shadow-violet-900/40 transition-transform hover:scale-[1.03]"
            >
              <Link href="/dashboard">Ir pro dashboard</Link>
            </Button>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-sm text-slate-300 transition-colors hover:text-white sm:inline"
              >
                Entrar
              </Link>
              <Button
                asChild
                size="sm"
                className="marca-gradiente-escuro text-white shadow-lg shadow-violet-900/40 transition-transform hover:scale-[1.03]"
              >
                <Link href="/register">Cadastre-se</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Fio de luz no lugar do border-b chapado. */}
      <div className="marca-gradiente h-px w-full opacity-60" />
    </header>
  );
}
