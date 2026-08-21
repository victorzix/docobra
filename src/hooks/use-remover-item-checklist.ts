import { useMutation } from "@tanstack/react-query";

interface ChecklistItem {
  id: string;
  descricao: string;
  concluida: boolean;
}

interface ApiErrorBody {
  error: string;
}

async function removerItemRequest(input: { comuniqueSeId: string; itemId: string }): Promise<ChecklistItem[]> {
  const response = await fetch(`/api/comunique-se/${input.comuniqueSeId}/itens/${input.itemId}`, {
    method: "DELETE",
  });

  const data = (await response.json()) as { itens: ChecklistItem[] } | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return (data as { itens: ChecklistItem[] }).itens;
}

export function useRemoverItemChecklist() {
  return useMutation({ mutationFn: removerItemRequest, scope: { id: "checklist-itens" } });
}
