"use client";

import { useState } from "react";

import { useAlternarItemChecklist } from "@/hooks/use-alternar-item-checklist";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

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
  const alternar = useAlternarItemChecklist();

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

  return (
    <ul className="flex flex-col gap-3">
      {itens.map((item) => (
        <li key={item.id} className="flex items-start gap-3">
          <Checkbox
            checked={item.concluida}
            onCheckedChange={(valor) => handleToggle(item.id, valor === true)}
          />
          <span className={cn("text-sm", item.concluida && "text-muted-foreground line-through")}>
            {item.descricao}
          </span>
        </li>
      ))}
    </ul>
  );
}
