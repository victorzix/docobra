import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { assinatura, assinaturaTrecho, plano, type StatusAssinatura } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";

export type Executor = Pick<typeof db, "select" | "insert">;

export interface CriarAssinaturaInput {
  empresaId: string;
  planoChave: string;
  status: StatusAssinatura;
  origem: "autoatendimento" | "suporte";
  inicio?: Date;
  venceEm?: Date;
}

export async function criarAssinatura(
  executor: Executor,
  { empresaId, planoChave, status, origem, inicio = new Date(), venceEm }: CriarAssinaturaInput,
): Promise<{ id: string }> {
  const [planoEncontrado] = await executor
    .select({ id: plano.id, cicloDias: plano.cicloDias })
    .from(plano)
    .where(eq(plano.chave, planoChave))
    .limit(1);

  if (!planoEncontrado) {
    throw new Error(`Plano "${planoChave}" não encontrado. Rode "node scripts/seed-planos.mjs".`);
  }

  const [nova] = await executor
    .insert(assinatura)
    .values({
      empresaId,
      inicio,
      status,
      venceEm: venceEm ?? new Date(inicio.getTime() + planoEncontrado.cicloDias * MS_POR_DIA),
    })
    .returning({ id: assinatura.id });

  await executor
    .insert(assinaturaTrecho)
    .values({ assinaturaId: nova.id, planoId: planoEncontrado.id, inicio, origem });

  return nova;
}

export function criarAssinaturaTrial(
  executor: Executor,
  empresaId: string,
  agora: Date = new Date(),
): Promise<{ id: string }> {
  return criarAssinatura(executor, {
    empresaId,
    planoChave: "trial",
    status: "trial",
    origem: "autoatendimento",
    inicio: agora,
  });
}

export interface AssinaturaVigente {
  id: string;
  inicio: Date;
  status: StatusAssinatura;
  venceEm: Date;
  planoId: string;
  planoChave: string;
}

export async function buscarAssinaturaVigente(empresaId: string): Promise<AssinaturaVigente | null> {
  const [linha] = await db
    .select({
      id: assinatura.id,
      inicio: assinatura.inicio,
      status: assinatura.status,
      venceEm: assinatura.venceEm,
      planoId: plano.id,
      planoChave: plano.chave,
    })
    .from(assinatura)
    .innerJoin(
      assinaturaTrecho,
      and(eq(assinaturaTrecho.assinaturaId, assinatura.id), isNull(assinaturaTrecho.fim)),
    )
    .innerJoin(plano, eq(plano.id, assinaturaTrecho.planoId))
    .where(eq(assinatura.empresaId, empresaId))
    .limit(1);

  return linha ?? null;
}
