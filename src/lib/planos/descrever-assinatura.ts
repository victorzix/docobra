import { formatarData } from "@/lib/formatar";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { CARENCIA_DIAS_PADRAO, type StatusEfetivo } from "@/lib/permissoes/status-assinatura";

export interface AssinaturaDescrita {
  titulo: string;
  selo: string;
  detalhe: string;
  tom: "normal" | "alerta" | "erro";
}

const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

export function descreverAssinatura(dados: {
  planoNome: string;
  ehTrial: boolean;
  status: StatusEfetivo;
  venceEm: string;
  diasRestantes: number;
}): AssinaturaDescrita {
  const { planoNome, ehTrial, status, venceEm, diasRestantes } = dados;
  const titulo = ehTrial ? "Teste gratuito" : `Plano ${planoNome}`;

  switch (status) {
    case "trial":
      return {
        titulo,
        selo: "Em teste",
        detalhe: `${dias(diasRestantes)} ${diasRestantes === 1 ? "restante" : "restantes"} · termina em ${formatarData(venceEm)}`,
        tom: "normal",
      };
    case "ativa":
      return {
        titulo,
        selo: "Ativo",
        detalhe: `Renova em ${formatarData(venceEm)} (${dias(diasRestantes)})`,
        tom: "normal",
      };
    case "carencia": {
      const fim = new Date(new Date(venceEm).getTime() + CARENCIA_DIAS_PADRAO * MS_POR_DIA).toISOString();
      return {
        titulo,
        selo: "Pagamento em atraso",
        detalhe: `Regularize até ${formatarData(fim)} para não perder o acesso`,
        tom: "alerta",
      };
    }
    case "cancelada":
      return { titulo, selo: "Cancelado", detalhe: `Acesso até ${formatarData(venceEm)}`, tom: "alerta" };
    case "suspensa":
      return {
        titulo,
        selo: ehTrial ? "Teste encerrado" : "Suspenso",
        detalhe: ehTrial
          ? `O teste terminou em ${formatarData(venceEm)}. Escolha um plano para continuar.`
          : `Venceu em ${formatarData(venceEm)}. Assine de novo para voltar a gerar documentos.`,
        tom: "erro",
      };
  }
}
