import { buscarAssinaturaVigente } from "@/db/queries/assinatura";
import {
  buscarPermissaoPorChave,
  buscarPlanoPorChave,
  buscarSobrescrita,
  buscarVinculoDoPlano,
  somarConsumo,
} from "@/db/queries/permissao";
import { calcularJanela, type Janela } from "./janela";
import { derivarStatus } from "./status-assinatura";

const PLANO_SUSPENSO = "suspenso";

export interface ResultadoPermissao {
  permitido: boolean;
  limite: number | null;
  usado: number;
  restante: number | null;
  janela: Janela | null;
}

const NEGADA: ResultadoPermissao = {
  permitido: false,
  limite: null,
  usado: 0,
  restante: null,
  janela: null,
};

interface Concessao {
  valor: number | null;
  janelaDias: number | null;
  ancora: Date;
}

async function resolverConcessao(
  empresaId: string,
  permissaoId: string,
  agora: Date,
): Promise<Concessao | null> {
  const sobrescrita = await buscarSobrescrita(empresaId, permissaoId, agora);
  if (sobrescrita) {
    return { valor: sobrescrita.valor, janelaDias: sobrescrita.janelaDias, ancora: sobrescrita.inicio };
  }

  const assinatura = await buscarAssinaturaVigente(empresaId);
  if (!assinatura) return null;

  let planoId = assinatura.planoId;
  if (derivarStatus(assinatura, agora) === "suspensa") {
    const suspenso = await buscarPlanoPorChave(PLANO_SUSPENSO);
    if (!suspenso) {
      throw new Error(`Plano "${PLANO_SUSPENSO}" não encontrado. Rode "node scripts/seed-planos.mjs".`);
    }
    planoId = suspenso.id;
  }

  const vinculo = await buscarVinculoDoPlano(planoId, permissaoId);
  if (!vinculo) return null;

  return { valor: vinculo.valor, janelaDias: vinculo.janelaDias, ancora: assinatura.inicio };
}

export async function verificarPermissao(
  empresaId: string,
  chave: string,
  agora: Date = new Date(),
): Promise<ResultadoPermissao> {
  const permissao = await buscarPermissaoPorChave(chave);
  if (!permissao) throw new Error(`Permissão desconhecida: "${chave}".`);

  const concessao = await resolverConcessao(empresaId, permissao.id, agora);
  if (!concessao) return NEGADA;

  if (concessao.valor === null || concessao.janelaDias === null) {
    return { permitido: true, limite: null, usado: 0, restante: null, janela: null };
  }

  const janela = calcularJanela(concessao.ancora, concessao.janelaDias, agora);
  const usado = await somarConsumo(empresaId, permissao.id, janela.inicio, janela.fim);
  const restante = Math.max(0, concessao.valor - usado);

  return { permitido: restante > 0, limite: concessao.valor, usado, restante, janela };
}
