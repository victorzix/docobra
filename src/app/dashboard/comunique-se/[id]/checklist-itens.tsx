"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { useAlternarItemChecklist } from "@/hooks/use-alternar-item-checklist";
import { useAdicionarItemChecklist } from "@/hooks/use-adicionar-item-checklist";
import { useRemoverItemChecklist } from "@/hooks/use-remover-item-checklist";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

interface ChecklistItem {
  id: string;
  descricao: string;
  concluida: boolean;
}

interface ChecklistItensProps {
  comuniqueSeId: string;
  itensIniciais: ChecklistItem[];
}

export function ChecklistItens({ comuniqueSeId, itensIniciais }: ChecklistItensProps) {
  const [itens, setItens] = useState(itensIniciais);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [novoItemTexto, setNovoItemTexto] = useState("");
  const alternar = useAlternarItemChecklist();
  const adicionar = useAdicionarItemChecklist();
  const remover = useRemoverItemChecklist();

  function handleToggle(itemId: string, concluida: boolean) {
    setItens((atual) => atual.map((item) => (item.id === itemId ? { ...item, concluida } : item)));

    alternar.mutate(
      { comuniqueSeId, itemId, concluida },
      {
        onError: () => {
          setItens((atual) => atual.map((item) => (item.id === itemId ? { ...item, concluida: !concluida } : item)));
        },
      },
    );
  }

  function iniciarEdicao(item: ChecklistItem) {
    setEditandoId(item.id);
    setTextoEdicao(item.descricao);
  }

  function confirmarEdicao(itemId: string) {
    const textoAntigo = itens.find((item) => item.id === itemId)?.descricao ?? "";
    const textoNovo = textoEdicao.trim();

    if (!textoNovo || textoNovo === textoAntigo) {
      setEditandoId(null);
      return;
    }

    setItens((atual) => atual.map((item) => (item.id === itemId ? { ...item, descricao: textoNovo } : item)));
    setEditandoId(null);

    alternar.mutate(
      { comuniqueSeId, itemId, descricao: textoNovo },
      {
        onError: () => {
          setItens((atual) => atual.map((item) => (item.id === itemId ? { ...item, descricao: textoAntigo } : item)));
        },
      },
    );
  }

  function handleRemover(itemId: string) {
    const itensAntes = itens;
    setItens((atual) => atual.filter((item) => item.id !== itemId));

    remover.mutate(
      { comuniqueSeId, itemId },
      {
        onError: () => setItens(itensAntes),
      },
    );
  }

  function handleAdicionar() {
    const descricao = novoItemTexto.trim();
    if (!descricao) return;

    setNovoItemTexto("");

    adicionar.mutate(
      { comuniqueSeId, descricao },
      {
        onSuccess: (itensAtualizados) => setItens(itensAtualizados),
      },
    );
  }

  return (
    <div className="grid gap-4">
      {itens.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma exigência ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {itens.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <Checkbox
                checked={item.concluida}
                onCheckedChange={(valor) => handleToggle(item.id, valor === true)}
              />
              {editandoId === item.id ? (
                <Input
                  autoFocus
                  value={textoEdicao}
                  onChange={(event) => setTextoEdicao(event.target.value)}
                  onBlur={() => confirmarEdicao(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") confirmarEdicao(item.id);
                    if (event.key === "Escape") setEditandoId(null);
                  }}
                  className="h-7 flex-1 text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => iniciarEdicao(item)}
                  className={cn(
                    "flex-1 text-left text-sm",
                    item.concluida && "text-muted-foreground line-through",
                  )}
                >
                  {item.descricao}
                </button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemover(item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={novoItemTexto}
          onChange={(event) => setNovoItemTexto(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleAdicionar();
          }}
          placeholder="Adicionar item"
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={handleAdicionar}>
          + Adicionar
        </Button>
      </div>
    </div>
  );
}
