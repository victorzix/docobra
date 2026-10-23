import { and, desc, eq, gt } from "drizzle-orm";

import type { CobrancaCriada } from "@/core/payments/types";
import { db } from "@/db";
import { cobranca, type TipoCobranca } from "@/db/schema";

export type Cobranca = typeof cobranca.$inferSelect;

export async function criarCobrancaPendente(dados: {
  assinaturaId: string;
  empresaId: string;
  tipo: TipoCobranca;
  planoDestinoId: string;
  valorCentavos: number;
  venceEm: Date;
}): Promise<Cobranca> {
  const [criada] = await db.insert(cobranca).values(dados).returning();
  return criada;
}

export async function buscarCobrancaPorId(id: string): Promise<Cobranca | null> {
  const [linha] = await db.select().from(cobranca).where(eq(cobranca.id, id)).limit(1);
  return linha ?? null;
}

export async function buscarCobrancaDaEmpresa(id: string, empresaId: string): Promise<Cobranca | null> {
  const [linha] = await db
    .select()
    .from(cobranca)
    .where(and(eq(cobranca.id, id), eq(cobranca.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function buscarCobrancaPendenteReutilizavel(filtro: {
  assinaturaId: string;
  tipo: TipoCobranca;
  planoDestinoId: string;
  agora: Date;
}): Promise<Cobranca | null> {
  const [linha] = await db
    .select()
    .from(cobranca)
    .where(
      and(
        eq(cobranca.assinaturaId, filtro.assinaturaId),
        eq(cobranca.tipo, filtro.tipo),
        eq(cobranca.planoDestinoId, filtro.planoDestinoId),
        eq(cobranca.status, "pendente"),
        gt(cobranca.venceEm, filtro.agora),
      ),
    )
    .orderBy(desc(cobranca.createdAt))
    .limit(1);
  return linha ?? null;
}

export async function registrarCobrancaNoGateway(
  id: string,
  dados: { provider: string; providerChargeId: string; pix: CobrancaCriada["pix"] },
): Promise<Cobranca> {
  const [atualizada] = await db
    .update(cobranca)
    .set({
      provider: dados.provider,
      providerChargeId: dados.providerChargeId,
      pixCopiaECola: dados.pix.copiaECola,
      pixQrCodeBase64: dados.pix.qrCodeBase64,
      pixExpiraEm: dados.pix.expiraEm,
      updatedAt: new Date(),
    })
    .where(eq(cobranca.id, id))
    .returning();
  return atualizada;
}
