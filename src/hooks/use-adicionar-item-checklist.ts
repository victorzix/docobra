import { useMutation } from "@tanstack/react-query";

interface ChecklistItem {
  id: string;
  descricao: string;
  concluida: boolean;
}

interface ApiErrorBody {
  error: string;
}

async function adicionarItemRequest(input: { comuniqueSeId: string; descricao: string }): Promise<ChecklistItem[]> {
  const response = await fetch(`/api/comunique-se/${input.comuniqueSeId}/itens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ descricao: input.descricao }),
  });

  const data = (await response.json()) as { itens: ChecklistItem[] } | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return (data as { itens: ChecklistItem[] }).itens;
}

export function useAdicionarItemChecklist() {
  return useMutation({ mutationFn: adicionarItemRequest, scope: { id: "checklist-itens" } });
}
