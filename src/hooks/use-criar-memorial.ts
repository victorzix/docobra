import { useMutation } from "@tanstack/react-query";

import type { CriarMemorialInput } from "@/lib/validations/memorial/create.schema";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";

interface MemorialResponse {
  memorial: { id: string; status: string; documentoGeradoUrl: string | null };
}

interface ApiErrorBody {
  error: string;
  fields?: Record<string, string[]>;
  id?: string;
}

async function criarMemorialRequest(input: CriarMemorialInput): Promise<MemorialResponse> {
  const response = await fetch("/api/memoriais", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as MemorialResponse | ApiErrorBody;

  if (!response.ok) {
    const erro = data as ApiErrorBody;
    if (erro.id) {
      throw new CriacaoParcialError(erro.error, erro.id);
    }
    throw new Error(erro.error);
  }

  return data as MemorialResponse;
}

export function useCriarMemorial() {
  return useMutation({ mutationFn: criarMemorialRequest });
}
