import { formatarData } from "@/lib/formatar";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { CARENCIA_DIAS_PADRAO, type StatusEfetivo } from "@/lib/permissoes/status-assinatura";

export interface AssinaturaDescrita {
  titulo: string;
  detalhe: string;
  tom: "normal" | "alerta" | "erro";
}

const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

export function descreverAssinatura(dados: {
  planoNome: string;
  status: StatusEfetivo;
  venceEm: string;
  diasRestantes: number;
}): AssinaturaDescrita {
  const { planoNome, status, venceEm, diasRestantes } = dados;

  switch (status) {
    case "trial":
      return {
        titulo: "Período de teste",
        detalhe: `${dias(diasRestantes)} ${diasRestantes === 1 ? "restante" : "restantes"}`,
        tom: "normal",
      };
    case "ativa":
      return {
        titulo: `Plano ${planoNome}`,
        detalhe: `Renova em ${formatarData(venceEm)} (${dias(diasRestantes)})`,
        tom: "normal",
      };
    case "carencia": {
      const fim = new Date(new Date(venceEm).getTime() + CARENCIA_DIAS_PADRAO * MS_POR_DIA).toISOString();
      return {
        titulo: `Plano ${planoNome}`,
        detalhe: `Pagamento em atraso: regularize até ${formatarData(fim)} para não perder o acesso`,
        tom: "alerta",
      };
    }
    case "cancelada":
      return {
        titulo: `Plano ${planoNome} (cancelado)`,
        detalhe: `Acesso até ${formatarData(venceEm)}`,
        tom: "alerta",
      };
    case "suspensa":
      return {
        titulo: "Acesso limitado",
        detalhe: "Assine um plano para voltar a gerar documentos.",
        tom: "erro",
      };
  }
}
