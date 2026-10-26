import { useMutation } from "@tanstack/react-query";

import type { AtualizarDocumentoInput } from "@/lib/validations/empresa/documento.schema";

async function salvarDocumento(input: AtualizarDocumentoInput): Promise<{ documento: string }> {
  const response = await fetch("/api/empresa/documento", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error);
  }

  return data;
}

export function useSalvarDocumento() {
  return useMutation({ mutationFn: salvarDocumento });
}
