import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { memorialDescritivo, projeto } from "@/db/schema";

export interface Memorial {
  id: string;
  projetoId: string;
  status: string;
  documentoGeradoUrl: string | null;
  audioUrl: string | null;
  createdAt: Date;
}

export interface MemorialComProjeto extends Memorial {
  projetoNome: string;
}

const CAMPOS_MEMORIAL = {
  id: memorialDescritivo.id,
  projetoId: memorialDescritivo.projetoId,
  status: memorialDescritivo.status,
  documentoGeradoUrl: memorialDescritivo.documentoGeradoUrl,
  audioUrl: memorialDescritivo.audioUrl,
  createdAt: memorialDescritivo.createdAt,
};

export async function criarMemorialRascunho(input: {
  projetoId: string;
  respostasFormularioJson: unknown;
}): Promise<Memorial> {
  const [criado] = await db
    .insert(memorialDescritivo)
    .values({ projetoId: input.projetoId, respostasFormularioJson: input.respostasFormularioJson })
    .returning(CAMPOS_MEMORIAL);
  return criado;
}

export async function listarMemoriais(empresaId: string): Promise<MemorialComProjeto[]> {
  return db
    .select({ ...CAMPOS_MEMORIAL, projetoNome: projeto.nome })
    .from(memorialDescritivo)
    .innerJoin(projeto, eq(memorialDescritivo.projetoId, projeto.id))
    .where(eq(projeto.empresaId, empresaId))
    .orderBy(desc(memorialDescritivo.createdAt));
}

export async function buscarMemorialDaEmpresa(id: string, empresaId: string): Promise<Memorial | null> {
  const [resultado] = await db
    .select(CAMPOS_MEMORIAL)
    .from(memorialDescritivo)
    .innerJoin(projeto, eq(memorialDescritivo.projetoId, projeto.id))
    .where(and(eq(memorialDescritivo.id, id), eq(projeto.empresaId, empresaId)))
    .limit(1);
  return resultado ?? null;
}

export async function marcarComoGerado(
  id: string,
  input: { documentoGeradoUrl: string; audioUrl?: string; respostasFormularioJson?: unknown },
): Promise<void> {
  await db
    .update(memorialDescritivo)
    .set({
      status: "gerado",
      documentoGeradoUrl: input.documentoGeradoUrl,
      ...(input.audioUrl ? { audioUrl: input.audioUrl } : {}),
      ...(input.respostasFormularioJson !== undefined
        ? { respostasFormularioJson: input.respostasFormularioJson }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(memorialDescritivo.id, id));
}
