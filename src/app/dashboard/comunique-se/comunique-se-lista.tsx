"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { useComuniqueSes } from "@/hooks/use-comunique-ses";
import { useRetryComuniqueSe } from "@/hooks/use-retry-comunique-se";
import { referenciaComuniqueSe } from "@/lib/referencia";
import { cn } from "@/lib/utils";
import type { PaginatedResponse } from "@/lib/pagination";
import type { ComuniqueSeResponse } from "@/lib/validations/comunique-se/response.schema";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface ComuniqueSeListaProps {
  dadosIniciais: PaginatedResponse<ComuniqueSeResponse>;
}

export function ComuniqueSeLista({ dadosIniciais }: ComuniqueSeListaProps) {
  const { data } = useComuniqueSes(dadosIniciais);
  const retry = useRetryComuniqueSe();
  const queryClient = useQueryClient();
  const itens = data.data;

  if (itens.length === 0) {
    return <p className="text-muted-foreground">Nenhum Comunique-se ainda.</p>;
  }

  function handleRetry(id: string) {
    retry.mutate(id, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comunique-se"] }),
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {itens.map((item) => {
        const tentandoEsse = retry.isPending && retry.variables === item.id;
        return (
          <Card key={item.id}>
            <CardHeader>
              <span className="font-mono text-xs text-muted-foreground">{referenciaComuniqueSe(item.numero)}</span>
              <CardTitle>{item.projetoNome}</CardTitle>
              <CardDescription>
                {item.status === "pronto" ? (
                  <Link href={`/dashboard/comunique-se/${item.id}`} className="underline">
                    Ver checklist
                  </Link>
                ) : item.status === "erro" ? (
                  <span className="flex items-center gap-2">
                    Erro ao processar
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 px-2 text-xs"
                      disabled={tentandoEsse}
                      onClick={() => handleRetry(item.id)}
                    >
                      <RefreshCw className={cn("size-3", tentandoEsse && "animate-spin")} />
                      Tentar novamente
                    </Button>
                  </span>
                ) : (
                  "Processando..."
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
