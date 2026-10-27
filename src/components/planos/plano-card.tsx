"use client";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarReais, rotuloDoCiclo } from "@/lib/formatar";
import type { PlanoDaTela } from "@/lib/planos/carregar-tela-de-planos";

interface PlanoCardProps {
  plano: PlanoDaTela;
  ocupado: boolean;
  linkSuporte: string | null;
  onEscolher: (plano: PlanoDaTela) => void;
  situacao?: { selo: string; detalhe: string; tom: "normal" | "alerta" | "erro" };
  // Só o card do plano atual recebe: substitui o botão "Plano atual" ou fica abaixo de "Renovar".
  cancelamento?: React.ReactNode;
}

const COR_DO_SELO = {
  normal: "bg-emerald-500/10 text-emerald-700",
  alerta: "bg-amber-500/10 text-amber-700",
  erro: "bg-destructive/10 text-destructive",
} as const;

export function PlanoCard({ plano, ocupado, linkSuporte, onEscolher, situacao, cancelamento }: PlanoCardProps) {
  const ehAtual = plano.ehAtual;

  return (
    <Card className={ehAtual ? "border-primary ring-1 ring-primary" : undefined}>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xl">{plano.nome}</CardTitle>
          {ehAtual && situacao && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COR_DO_SELO[situacao.tom]}`}>
              {situacao.selo}
            </span>
          )}
        </div>
        <p>
          <span className="text-3xl font-semibold">
            {plano.precoCentavos === 0 ? "Grátis" : formatarReais(plano.precoCentavos)}
          </span>
          {plano.precoCentavos > 0 && (
            <span className="text-sm text-muted-foreground"> / {rotuloDoCiclo(plano.cicloDias)}</span>
          )}
        </p>
        {ehAtual && situacao && <p className="text-sm text-muted-foreground">{situacao.detalhe}</p>}
      </CardHeader>

      <CardContent className="border-t pt-6">
        <ul className="grid gap-2.5 text-sm">
          {plano.limites.map((limite) => (
            <li key={limite} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {limite}
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="mt-auto flex-col items-stretch gap-2">
        {plano.acao === "atual" &&
          (cancelamento ?? (
            <Button variant="outline" className="w-full" disabled>
              Plano atual
            </Button>
          ))}

        {(plano.acao === "assinar" || plano.acao === "renovar" || plano.acao === "reativar" || plano.acao === "upgrade") && (
          <Button className="w-full" disabled={ocupado} onClick={() => onEscolher(plano)}>
            {plano.acao === "assinar" && "Assinar"}
            {plano.acao === "renovar" && "Renovar"}
            {plano.acao === "reativar" && "Reativar assinatura"}
            {plano.acao === "upgrade" && "Fazer upgrade"}
          </Button>
        )}

        {plano.acao === "em_breve" && (
          <Button variant="outline" className="w-full" disabled>
            Em breve no cartão
          </Button>
        )}
        {plano.acao === "upgrade" && (
          <p className="text-center text-xs text-muted-foreground">
            {formatarReais(plano.valorUpgradeCentavos ?? 0)} agora, proporcional ao que falta do ciclo
          </p>
        )}
        {plano.acao !== "atual" && cancelamento}

        {(plano.acao === "downgrade" || plano.acao === "suporte") &&
          (linkSuporte ? (
            <Button asChild variant="outline" className="w-full">
              <a href={linkSuporte}>{plano.acao === "downgrade" ? "Solicitar downgrade" : "Trocar de plano"}</a>
            </Button>
          ) : (
            <span className="text-center text-sm text-muted-foreground">
              Fale com o suporte para trocar para este plano.
            </span>
          ))}
      </CardFooter>
    </Card>
  );
}
