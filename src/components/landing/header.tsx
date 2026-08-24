import Link from "next/link";

import { Button } from "@/components/ui/button";

const LINKS_NAV = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader({ logado }: { logado: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a2c4d]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0a2c4d]/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-mono text-lg font-semibold tracking-tight text-white">
          DocObra
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS_NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-slate-300 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {logado ? (
            <Button asChild size="sm" className="bg-cyan-600 text-white hover:bg-cyan-500">
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
              <Button asChild size="sm" className="bg-cyan-600 text-white hover:bg-cyan-500">
                <Link href="/register">Cadastre-se</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
