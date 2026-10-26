"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ehItemAtivo } from "@/components/dashboard/sidebar";
import { cn } from "@/lib/utils";

const ITENS = [{ href: "/dashboard/configuracoes/assinatura", label: "Assinatura" }];

export function MenuConfiguracoes() {
  const pathname = usePathname();

  return (
    <nav aria-label="Configurações" className="flex shrink-0 flex-col gap-1 md:w-48">
      <h2 className="mb-2 px-3 text-sm font-semibold text-muted-foreground">Configurações</h2>
      {ITENS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={ehItemAtivo(pathname, item.href) ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
            ehItemAtivo(pathname, item.href) && "bg-muted font-medium",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
