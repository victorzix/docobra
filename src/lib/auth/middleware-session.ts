import { assinarToken, verificarToken, type SessionPayload } from "./jwt";

export type SessionAction = { action: "redirect" } | { action: "allow"; novoToken: string };

export async function resolveSessionAction(token: string | undefined): Promise<SessionAction> {
  if (!token) {
    return { action: "redirect" };
  }

  let payload: SessionPayload;
  try {
    payload = await verificarToken(token);
  } catch {
    return { action: "redirect" };
  }

  // Aguarda 1 segundo para garantir que a token renovada tem um iat diferente
  // (jose usa precisão de segundos para iat)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const novoToken = await assinarToken({
    userId: payload.userId,
    empresaId: payload.empresaId,
    papel: payload.papel,
  });

  return { action: "allow", novoToken };
}
