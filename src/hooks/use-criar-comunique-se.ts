import { useMutation } from "@tanstack/react-query";

import type { CriarComuniqueSeInput } from "@/lib/validations/comunique-se/create.schema";

interface ComuniqueSeCriadoResponse {
  comuniqueSe: { id: string; numero: number; status: string; pdfOriginalUrl: string | null };
}

interface ApiErrorBody {
  error: string;
  fields?: Record<string, string[]>;
}

async function criarComuniqueSeRequest(input: CriarComuniqueSeInput): Promise<ComuniqueSeCriadoResponse> {
  const response = await fetch("/api/comunique-se", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as ComuniqueSeCriadoResponse | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return data as ComuniqueSeCriadoResponse;
}

export function useCriarComuniqueSe() {
  return useMutation({ mutationFn: criarComuniqueSeRequest });
}
