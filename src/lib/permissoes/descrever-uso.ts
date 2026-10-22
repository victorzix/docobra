import { MS_POR_DIA } from "./janela";
import type { PermissaoSerializada } from "./permissoes-da-empresa";

export type EstadoUso = "ilimitado" | "normal" | "perto" | "estourado" | "negado";

export interface DescricaoUso {
  estado: EstadoUso;
  texto: string;
  percentual: number | null;
}

const LIMIAR_PERTO = 0.2;

function textoRenovacao(renovaEm: string | null, agora: Date): string {
  if (!renovaEm) return "";
  const dias = Math.max(1, Math.ceil((new Date(renovaEm).getTime() - agora.getTime()) / MS_POR_DIA));
  return ` · renova em ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function descreverUso(
  permissao: PermissaoSerializada,
  unidade: string,
  agora: Date = new Date(),
): DescricaoUso {
  if (!permissao.permitido && permissao.limite === null) {
    return { estado: "negado", texto: "Não incluído no seu plano", percentual: null };
  }
  if (permissao.limite === null) {
    return { estado: "ilimitado", texto: "Sem limite no seu plano", percentual: null };
  }

  const texto = `${permissao.usado} de ${permissao.limite} ${unidade}${textoRenovacao(permissao.renovaEm, agora)}`;
  if (!permissao.permitido) {
    return { estado: "estourado", texto, percentual: 100 };
  }

  const percentual = Math.min(100, Math.round((permissao.usado / permissao.limite) * 100));
  const perto = permissao.restante !== null && permissao.restante / permissao.limite <= LIMIAR_PERTO;
  return { estado: perto ? "perto" : "normal", texto, percentual };
}

export function montarMailtoSuporte(dados: {
  email: string;
  empresaNome: string;
  planoChave: string | null;
  motivo: string;
}): string {
  const assunto = "Mudança de plano — DocObra";
  const corpo =
    "Olá! Quero mudar de plano no DocObra.\n\n" +
    `Empresa: ${dados.empresaNome}\n` +
    `Plano atual: ${dados.planoChave ?? "não identificado"}\n` +
    `Motivo: ${dados.motivo}\n`;

  return `mailto:${dados.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}
