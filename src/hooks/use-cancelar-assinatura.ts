import { useMutation } from "@tanstack/react-query";

async function cancelarAssinatura(): Promise<void> {
  const response = await fetch("/api/assinatura/cancelar", { method: "POST" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Não foi possível cancelar a assinatura.");
  }
}

export function useCancelarAssinatura() {
  return useMutation({ mutationFn: cancelarAssinatura });
}
