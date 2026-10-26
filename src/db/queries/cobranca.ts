import { and, desc, eq, gt, isNull, not, or } from "drizzle-orm";

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

export async function criarCobrancaPendenteSeLivre(dados: Parameters<typeof criarCobrancaPendente>[0]): Promise<Cobranca | null> {
  const [criada] = await db.insert(cobranca).values(dados).onConflictDoNothing().returning();
  return criada ?? null;
}

export async function cancelarCobrancasPendentesObsoletas(filtro: {
  assinaturaId: string;
  tipo: TipoCobranca;
  planoDestinoId: string;
  valorCentavos: number;
  agora: Date;
}): Promise<Cobranca[]> {
  return db
    .update(cobranca)
    .set({ status: "cancelada", updatedAt: filtro.agora })
    .where(
      and(
        eq(cobranca.assinaturaId, filtro.assinaturaId),
        eq(cobranca.tipo, filtro.tipo),
        eq(cobranca.planoDestinoId, filtro.planoDestinoId),
        eq(cobranca.status, "pendente"),
        not(condicaoReutilizavel(filtro)!),
      ),
    )
    .returning();
}

export async function cancelarCobrancaPendente(id: string, agora: Date): Promise<Cobranca | null> {
  const [linha] = await db
    .update(cobranca)
    .set({ status: "cancelada", updatedAt: agora })
    .where(and(eq(cobranca.id, id), eq(cobranca.status, "pendente")))
    .returning();
  return linha ?? null;
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

function condicaoReutilizavel(filtro: { valorCentavos: number; agora: Date }) {
  return and(
    eq(cobranca.valorCentavos, filtro.valorCentavos),
    gt(cobranca.venceEm, filtro.agora),
    or(isNull(cobranca.pixExpiraEm), gt(cobranca.pixExpiraEm, filtro.agora)),
  );
}

export async function buscarCobrancaPendenteReutilizavel(filtro: {
  assinaturaId: string;
  tipo: TipoCobranca;
  planoDestinoId: string;
  valorCentavos: number;
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
        condicaoReutilizavel(filtro),
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
