import { useMutation } from "@tanstack/react-query";

interface ChecklistItem {
  id: string;
  descricao: string;
  concluida: boolean;
}

interface ApiErrorBody {
  error: string;
}

async function alternarItemRequest(input: {
  comuniqueSeId: string;
  itemId: string;
  concluida: boolean;
}): Promise<ChecklistItem[]> {
  const response = await fetch(`/api/comunique-se/${input.comuniqueSeId}/itens`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: input.itemId, concluida: input.concluida }),
  });

  const data = (await response.json()) as { itens: ChecklistItem[] } | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return (data as { itens: ChecklistItem[] }).itens;
}

export function useAlternarItemChecklist() {
  return useMutation({ mutationFn: alternarItemRequest, scope: { id: "checklist-itens" } });
}
