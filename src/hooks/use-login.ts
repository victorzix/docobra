import { useMutation } from "@tanstack/react-query";

import type { LoginInput } from "@/lib/validations/auth/login.schema";

interface UsuarioResponse {
  usuario: { id: string; nome: string; email: string; papel: string };
}

interface ApiErrorBody {
  error: string;
  fields?: Record<string, string[]>;
}

async function logar(input: LoginInput): Promise<UsuarioResponse> {
  const response = await fetch("/api/auth/login", {
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

export function useLogin() {
  return useMutation({ mutationFn: logar });
}
