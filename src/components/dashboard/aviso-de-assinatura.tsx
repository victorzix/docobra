import Link from "next/link";

import type { AvisoDeAssinatura as Aviso } from "@/lib/planos/descrever-aviso-de-assinatura";

const COR_DO_TOM = {
  normal: "border-primary/30 bg-primary/10 text-foreground",
  alerta: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
} as const;

export function AvisoDeAssinatura({ aviso }: { aviso: Aviso }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-sm ${COR_DO_TOM[aviso.tom]}`}>
      <span>{aviso.texto}</span>
      <Link href="/dashboard/configuracoes/assinatura" className="font-medium underline-offset-4 hover:underline">
        {aviso.acao}
      </Link>
    </div>
  );
}
