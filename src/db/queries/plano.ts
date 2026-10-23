import { eq } from "drizzle-orm";

import type { PlanoCobravel } from "@/core/billing/upgrade";
import { db } from "@/db";
import { plano } from "@/db/schema";

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
