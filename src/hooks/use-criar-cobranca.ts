import { useMutation } from "@tanstack/react-query";

import type { CriarCobrancaInput } from "@/lib/validations/cobranca/create.schema";
import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

export class CobrancaError extends Error {
  constructor(
    mensagem: string,
    public readonly codigo?: string,
  ) {
    super(mensagem);
    this.name = "CobrancaError";
  }
}

async function criarCobranca(input: CriarCobrancaInput): Promise<CobrancaResponse> {
  const response = await fetch("/api/cobrancas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new CobrancaError(data.error, data.codigo);
  }

  return data.cobranca;
}

export function useCriarCobranca() {
  return useMutation({ mutationFn: criarCobranca });
}
