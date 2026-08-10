import { useMutation } from "@tanstack/react-query";

import type { RegisterInput } from "@/lib/validations/auth/register.schema";

interface UsuarioResponse {
  usuario: { id: string; nome: string; email: string; papel: string };
}

interface ApiErrorBody {
  error: string;
  fields?: Record<string, string[]>;
}

async function registrar(input: RegisterInput): Promise<UsuarioResponse> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as UsuarioResponse | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return data as UsuarioResponse;
}

export function useRegister() {
  return useMutation({ mutationFn: registrar });
}
