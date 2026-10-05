import { and, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { consumo, empresaPermissao, permissao, plano, planoPermissao } from "@/db/schema";

export async function buscarPermissaoPorChave(chave: string) {
  const [linha] = await db
    .select({ id: permissao.id, tipo: permissao.tipo })
    .from(permissao)
    .where(eq(permissao.chave, chave))
    .limit(1);

  return linha ?? null;
}

export async function buscarPlanoPorChave(chave: string) {
  const [linha] = await db.select({ id: plano.id }).from(plano).where(eq(plano.chave, chave)).limit(1);

  return linha ?? null;
}

export async function buscarSobrescrita(empresaId: string, permissaoId: string, agora: Date) {
  const [linha] = await db
    .select({
      valor: empresaPermissao.valor,
      janelaDias: empresaPermissao.janelaDias,
      inicio: empresaPermissao.inicio,
    })
    .from(empresaPermissao)
    .where(
      and(
        eq(empresaPermissao.empresaId, empresaId),
        eq(empresaPermissao.permissaoId, permissaoId),
        lte(empresaPermissao.inicio, agora),
        or(isNull(empresaPermissao.expiraEm), gt(empresaPermissao.expiraEm, agora)),
      ),
    )
    .limit(1);

  return linha ?? null;
}

export async function buscarVinculoDoPlano(planoId: string, permissaoId: string) {
  const [linha] = await db
    .select({ valor: planoPermissao.valor, janelaDias: planoPermissao.janelaDias })
    .from(planoPermissao)
    .where(and(eq(planoPermissao.planoId, planoId), eq(planoPermissao.permissaoId, permissaoId)))
    .limit(1);

  return linha ?? null;
}

export async function somarConsumo(
  empresaId: string,
  permissaoId: string,
  inicio: Date,
  fim: Date,
): Promise<number> {
  const [linha] = await db
    .select({ total: sql<number>`coalesce(sum(${consumo.quantidade}), 0)::int` })
    .from(consumo)
    .where(
      and(
        eq(consumo.empresaId, empresaId),
        eq(consumo.permissaoId, permissaoId),
        gte(consumo.ocorridoEm, inicio),
        lt(consumo.ocorridoEm, fim),
      ),
    );

  return linha.total;
}
