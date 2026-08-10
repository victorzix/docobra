import { useMutation } from "@tanstack/react-query";

async function deslogar(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });

  if (!response.ok) {
    throw new Error("Não foi possível encerrar a sessão.");
  }
}

export function useLogout() {
  return useMutation({ mutationFn: deslogar });
}
