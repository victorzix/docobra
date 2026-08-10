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

  const novoToken = await assinarToken({
    userId: payload.userId,
    empresaId: payload.empresaId,
    papel: payload.papel,
  });

  return { action: "allow", novoToken };
}
