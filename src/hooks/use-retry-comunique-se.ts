import { useMutation, useQueryClient } from "@tanstack/react-query";

interface RetryResponse {
  comuniqueSe: { id: string; numero: number; status: string; pdfOriginalUrl: string | null };
}

interface ApiErrorBody {
  error: string;
}

async function retryComuniqueSeRequest(id: string): Promise<RetryResponse> {
  const response = await fetch(`/api/comunique-se/${id}/retry`, { method: "POST" });
  const data = (await response.json()) as RetryResponse | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return data as RetryResponse;
}

export function useRetryComuniqueSe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retryComuniqueSeRequest,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["permissoes"] }),
  });
}
