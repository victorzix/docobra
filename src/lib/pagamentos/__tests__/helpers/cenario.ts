import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import {
  assinatura,
  cobranca,
  empresa,
  eventoPagamento,
  plano,
  usuario,
  type StatusAssinatura,
  type StatusCobranca,
  type TipoCobranca,
} from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";

export const AGORA = new Date("2026-06-15T12:00:00Z");

export interface Cenario {
  empresaId: string;
  assinaturaId: string;
}

export async function criarCenario(
  opcoes: {
    planoChave?: string;
    status?: StatusAssinatura;
    documento?: string | null;
    inicio?: Date;
    venceEm?: Date;
    email?: string;
  } = {},
): Promise<Cenario> {
  const [novaEmpresa] = await db
    .insert(empresa)
    .values({
      nome: "Empresa Cobranca",
      documento: opcoes.documento === undefined ? "12345678000199" : opcoes.documento,
    })
    .returning();
  await db.insert(usuario).values({
    nome: "Admin",
    email: opcoes.email ?? "admin@cobranca.com",
    senhaHash: "hash-fake",
    empresaId: novaEmpresa.id,
    papel: "admin",
  });
  await criarAssinatura(db, {
    empresaId: novaEmpresa.id,
    planoChave: opcoes.planoChave ?? "trial",
    status: opcoes.status ?? "trial",
    origem: "suporte",
    inicio: opcoes.inicio ?? AGORA,
    venceEm: opcoes.venceEm,
  });
  const [criada] = await db.select().from(assinatura).where(eq(assinatura.empresaId, novaEmpresa.id));
  return { empresaId: novaEmpresa.id, assinaturaId: criada.id };
}

export async function idDoPlano(chave: string): Promise<string> {
  const [encontrado] = await db.select({ id: plano.id }).from(plano).where(eq(plano.chave, chave));
  return encontrado.id;
}

export async function inserirCobranca(
  cenario: Cenario,
  opcoes: {
    tipo?: TipoCobranca;
    planoChave?: string;
    status?: StatusCobranca;
    valorCentavos?: number;
    provider?: string | null;
    providerChargeId?: string | null;
    venceEm?: Date;
  } = {},
) {
  const [criada] = await db
    .insert(cobranca)
    .values({
      assinaturaId: cenario.assinaturaId,
      empresaId: cenario.empresaId,
      tipo: opcoes.tipo ?? "assinatura",
      planoDestinoId: await idDoPlano(opcoes.planoChave ?? "essencial"),
      valorCentavos: opcoes.valorCentavos ?? 9900,
      status: opcoes.status ?? "pendente",
      venceEm: opcoes.venceEm ?? new Date(AGORA.getTime() + 3 * MS_POR_DIA),
      provider: opcoes.provider === undefined ? "asaas" : opcoes.provider,
      providerChargeId: opcoes.providerChargeId === undefined ? `pay_${randomUUID()}` : opcoes.providerChargeId,
    })
    .returning();
  return criada;
}

export async function limparCenarios() {
  await db.delete(eventoPagamento);
  await db.delete(usuario);
  await db.delete(empresa);
}
