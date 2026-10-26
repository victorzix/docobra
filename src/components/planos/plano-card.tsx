"use client";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarReais, rotuloDoCiclo } from "@/lib/formatar";
import type { PlanoDaTela } from "@/lib/planos/carregar-tela-de-planos";

interface PlanoCardProps {
  plano: PlanoDaTela;
  ocupado: boolean;
  linkSuporte: string | null;
  onEscolher: (plano: PlanoDaTela) => void;
}

export function PlanoCard({ plano, ocupado, linkSuporte, onEscolher }: PlanoCardProps) {
  return (
    <Card className={plano.acao === "atual" ? "border-primary" : undefined}>
      <CardHeader>
        <CardTitle className="text-xl">{plano.nome}</CardTitle>
        <CardDescription>
          <span className="text-2xl font-semibold text-foreground">{formatarReais(plano.precoCentavos)}</span> /{" "}
          {rotuloDoCiclo(plano.cicloDias)}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ul className="grid gap-2 text-sm">
          {plano.limites.map((limite) => (
            <li key={limite} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              {limite}
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="mt-auto">
        {plano.acao === "atual" && <span className="text-sm font-medium text-primary">Plano atual</span>}

        {(plano.acao === "assinar" || plano.acao === "renovar" || plano.acao === "upgrade") && (
          <Button className="w-full" disabled={ocupado} onClick={() => onEscolher(plano)}>
            {plano.acao === "assinar" && "Assinar"}
            {plano.acao === "renovar" && "Renovar"}
            {plano.acao === "upgrade" && `Fazer upgrade — ${formatarReais(plano.valorUpgradeCentavos ?? 0)} agora`}
          </Button>
        )}

        {plano.acao === "suporte" &&
          (linkSuporte ? (
            <Button asChild variant="outline" className="w-full">
              <a href={linkSuporte}>Fale com o suporte</a>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Fale com o suporte para trocar para este plano.</span>
          ))}
      </CardFooter>
    </Card>
  );
}
