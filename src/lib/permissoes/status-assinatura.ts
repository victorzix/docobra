import type { StatusAssinatura } from "@/db/schema/assinatura";
import { MS_POR_DIA } from "./janela";

export type StatusEfetivo = StatusAssinatura | "carencia" | "suspensa";

export const CARENCIA_DIAS_PADRAO = 5;

export function derivarStatus(
  assinatura: { status: StatusAssinatura; venceEm: Date },
  agora: Date,
  carenciaDias: number = CARENCIA_DIAS_PADRAO,
): StatusEfetivo {
  if (agora < assinatura.venceEm) return assinatura.status;

  const fimDaCarencia = assinatura.venceEm.getTime() + carenciaDias * MS_POR_DIA;
  if (assinatura.status === "ativa" && agora.getTime() < fimDaCarencia) return "carencia";

  return "suspensa";
}
