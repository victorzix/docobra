"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { useMemoriais } from "@/hooks/use-memoriais";
import { useRetryMemorial } from "@/hooks/use-retry-memorial";
import { referenciaMemorial } from "@/lib/referencia";
import { cn } from "@/lib/utils";
import type { PaginatedResponse } from "@/lib/pagination";
import type { MemorialResponse } from "@/lib/validations/memorial/response.schema";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface MemoriaisListaProps {
  dadosIniciais: PaginatedResponse<MemorialResponse>;
}

export function MemoriaisLista({ dadosIniciais }: MemoriaisListaProps) {
  const { data } = useMemoriais(dadosIniciais);
  const retry = useRetryMemorial();
  const queryClient = useQueryClient();
  const memoriais = data.data;

  if (memoriais.length === 0) {
    return <p className="text-muted-foreground">Nenhum memorial ainda.</p>;
  }

  function handleRetry(id: string) {
    retry.mutate(id, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memoriais"] }),
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {memoriais.map((m) => {
        const tentandoEsse = retry.isPending && retry.variables === m.id;
        return (
          <Card key={m.id}>
            <CardHeader>
              <span className="font-mono text-xs text-muted-foreground">{referenciaMemorial(m.numero)}</span>
              <CardTitle>{m.projetoNome}</CardTitle>
              <CardDescription>
                {m.status === "gerado" && m.documentoGeradoUrl ? (
                  <a href={m.documentoGeradoUrl} className="underline">
                    Baixar PDF
                  </a>
                ) : (
                  <span className="flex items-center gap-2">
                    Rascunho
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 px-2 text-xs"
                      disabled={tentandoEsse}
                      onClick={() => handleRetry(m.id)}
                    >
                      <RefreshCw className={cn("size-3", tentandoEsse && "animate-spin")} />
                      Tentar novamente
                    </Button>
                  </span>
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
