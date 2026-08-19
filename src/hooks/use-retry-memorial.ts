import { useMutation } from "@tanstack/react-query";

interface RetryResponse {
  memorial: { id: string; numero: number; status: string; documentoGeradoUrl: string | null };
}

interface ApiErrorBody {
  error: string;
}

async function retryMemorialRequest(id: string): Promise<RetryResponse> {
  const response = await fetch(`/api/memoriais/${id}/retry`, { method: "POST" });
  const data = (await response.json()) as RetryResponse | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return data as RetryResponse;
}

export function useRetryMemorial() {
  return useMutation({ mutationFn: retryMemorialRequest });
}
