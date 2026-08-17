"use client";

import { CalendarDays, FolderKanban, MapPin } from "lucide-react";

import { useProjetos, type PaginaProjetos } from "@/hooks/use-projetos";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function ProjetosGrid({ paginaInicial }: { paginaInicial: PaginaProjetos }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useProjetos(paginaInicial);

  const projetos = data.pages.flatMap((pagina) => pagina.data);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projetos.map((p) => (
          <Card
            key={p.id}
            className="gap-3 border-border/60 p-5 transition-shadow duration-200 hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderKanban className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base">{p.nome}</CardTitle>
              {p.endereco && (
                <CardDescription className="mt-1 flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{p.endereco}</span>
                </CardDescription>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5 shrink-0" />
              Criado em {new Date(p.createdAt).toLocaleDateString("pt-BR")}
            </div>
          </Card>
        ))}
      </div>

      {hasNextPage && (
        <Button
          variant="outline"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? "Carregando..." : "Carregar mais"}
        </Button>
      )}
    </div>
  );
}
