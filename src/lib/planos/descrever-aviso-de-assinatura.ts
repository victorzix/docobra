import { ANTECEDENCIA_RENOVACAO_DIAS_PADRAO } from "@/core/billing/renovacao";
import { formatarData } from "@/lib/formatar";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { CARENCIA_DIAS_PADRAO, type StatusEfetivo } from "@/lib/permissoes/status-assinatura";

export interface AvisoDeAssinatura {
  tom: "normal" | "alerta";
  texto: string;
  acao: string;
}

export function descreverAvisoDeAssinatura(dados: {
  status: StatusEfetivo;
  venceEm: string;
  diasRestantes: number;
}): AvisoDeAssinatura | null {
  const { status, venceEm, diasRestantes } = dados;

  if (status === "ativa" && diasRestantes <= ANTECEDENCIA_RENOVACAO_DIAS_PADRAO) {
    const dias = `${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"}`;
    return { tom: "normal", texto: `Sua assinatura vence em ${dias} (${formatarData(venceEm)}).`, acao: "Renovar" };
  }

  if (status === "carencia") {
    const fim = new Date(new Date(venceEm).getTime() + CARENCIA_DIAS_PADRAO * MS_POR_DIA).toISOString();
    return {
      tom: "alerta",
      texto: `Pagamento em atraso: regularize até ${formatarData(fim)} para não perder o acesso.`,
      acao: "Regularizar",
    };
  }

  if (status === "cancelada") {
    return {
      tom: "alerta",
      texto: `Assinatura cancelada: você tem acesso até ${formatarData(venceEm)}.`,
      acao: "Reativar",
    };
  }

  return null;
}
