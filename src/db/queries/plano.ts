import { and, asc, eq, gt, inArray } from "drizzle-orm";

import type { PlanoCobravel } from "@/core/billing/upgrade";
import { db } from "@/db";
import { permissao, plano, planoPermissao } from "@/db/schema";
import type { LinhaDeLimite } from "@/lib/planos/descrever-limites";

export interface PlanoDoCatalogo extends PlanoCobravel {
  id: string;
  nome: string;
  ativo: boolean;
  interno: boolean;
}

const CAMPOS = {
  id: plano.id,
  chave: plano.chave,
  nome: plano.nome,
  nivel: plano.nivel,
  cicloDias: plano.cicloDias,
  precoCentavos: plano.precoCentavos,
  ativo: plano.ativo,
  interno: plano.interno,
};

export async function buscarPlanoDoCatalogo(chave: string): Promise<PlanoDoCatalogo | null> {
  const [linha] = await db.select(CAMPOS).from(plano).where(eq(plano.chave, chave)).limit(1);
  return linha ?? null;
}

export async function buscarPlanoDoCatalogoPorId(id: string): Promise<PlanoDoCatalogo | null> {
  const [linha] = await db.select(CAMPOS).from(plano).where(eq(plano.id, id)).limit(1);
  return linha ?? null;
}

export interface PlanoPublico extends PlanoDoCatalogo {
  permissoes: LinhaDeLimite[];
}

export async function listarPlanosPublicos(): Promise<PlanoPublico[]> {
  const planos = await db
    .select(CAMPOS)
    .from(plano)
    .where(and(eq(plano.ativo, true), eq(plano.interno, false), gt(plano.precoCentavos, 0)))
    .orderBy(asc(plano.nivel), asc(plano.precoCentavos));
  if (planos.length === 0) return [];

  const linhas = await db
    .select({
      planoId: planoPermissao.planoId,
      chave: permissao.chave,
      valor: planoPermissao.valor,
      janelaDias: planoPermissao.janelaDias,
    })
    .from(planoPermissao)
    .innerJoin(permissao, eq(permissao.id, planoPermissao.permissaoId))
    .where(inArray(planoPermissao.planoId, planos.map((p) => p.id)));

  return planos.map((p) => ({
    ...p,
    permissoes: linhas
      .filter((l) => l.planoId === p.id)
      .map(({ chave, valor, janelaDias }) => ({ chave, valor, janelaDias })),
  }));
}
