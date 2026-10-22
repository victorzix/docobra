import { buscarAssinaturaVigente } from "@/db/queries/assinatura";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { carregarPermissoesDaEmpresa, type PermissoesDaEmpresa } from "./permissoes-da-empresa";

export interface ContatoSuporte {
  email: string | null;
  empresaNome: string;
  planoChave: string | null;
}

export interface ContextoDePlanos {
  permissoes: PermissoesDaEmpresa;
  contatoSuporte: ContatoSuporte;
}

export async function carregarContextoDePlanos(sessao: {
  userId: string;
  empresaId: string;
}): Promise<ContextoDePlanos> {
  const [permissoes, nomes, assinatura] = await Promise.all([
    carregarPermissoesDaEmpresa(sessao.empresaId),
    buscarNomesUsuarioEEmpresa(sessao.userId),
    buscarAssinaturaVigente(sessao.empresaId),
  ]);

  return {
    permissoes,
    contatoSuporte: {
      email: process.env.SUPORTE_EMAIL || null,
      empresaNome: nomes?.empresaNome ?? "",
      planoChave: assinatura?.planoChave ?? null,
    },
  };
}
