import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { comuniqueSe, projeto } from "@/db/schema";
import { proximoNumero } from "./contador";

export interface ChecklistItem {
  id: string;
  descricao: string;
  concluida: boolean;
}

interface ChecklistJson {
  itens: ChecklistItem[];
}

export interface ComuniqueSe {
  id: string;
  numero: number;
  projetoId: string;
  status: string;
  pdfOriginalUrl: string | null;
  checklistJson: ChecklistJson | null;
  createdAt: Date;
}

export interface ComuniqueSeComProjeto extends ComuniqueSe {
  projetoNome: string;
}

const CAMPOS_COMUNIQUE_SE = {
  id: comuniqueSe.id,
  numero: comuniqueSe.numero,
  projetoId: comuniqueSe.projetoId,
  status: comuniqueSe.status,
  pdfOriginalUrl: comuniqueSe.pdfOriginalUrl,
  checklistJson: comuniqueSe.checklistJson,
  createdAt: comuniqueSe.createdAt,
};

export async function criarComuniqueSeProcessando(input: {
  id: string;
  projetoId: string;
  empresaId: string;
  pdfOriginalUrl: string;
}): Promise<ComuniqueSe> {
  const numero = await proximoNumero(input.empresaId, "comunique_se");
  const [criado] = await db
    .insert(comuniqueSe)
    .values({ id: input.id, projetoId: input.projetoId, numero, pdfOriginalUrl: input.pdfOriginalUrl })
    .returning(CAMPOS_COMUNIQUE_SE);
  return criado as ComuniqueSe;
}

export async function listarComuniqueSe(empresaId: string): Promise<ComuniqueSeComProjeto[]> {
  const resultado = await db
    .select({ ...CAMPOS_COMUNIQUE_SE, projetoNome: projeto.nome })
    .from(comuniqueSe)
    .innerJoin(projeto, eq(comuniqueSe.projetoId, projeto.id))
    .where(eq(projeto.empresaId, empresaId))
    .orderBy(desc(comuniqueSe.createdAt));
  return resultado as ComuniqueSeComProjeto[];
}

export async function buscarComuniqueSeDaEmpresa(id: string, empresaId: string): Promise<ComuniqueSe | null> {
  const [resultado] = await db
    .select(CAMPOS_COMUNIQUE_SE)
    .from(comuniqueSe)
    .innerJoin(projeto, eq(comuniqueSe.projetoId, projeto.id))
    .where(and(eq(comuniqueSe.id, id), eq(projeto.empresaId, empresaId)))
    .limit(1);
  return (resultado as ComuniqueSe) ?? null;
}

export async function marcarComoPronto(id: string, itens: ChecklistItem[]): Promise<void> {
  await db
    .update(comuniqueSe)
    .set({ status: "pronto", checklistJson: { itens }, updatedAt: new Date() })
    .where(eq(comuniqueSe.id, id));
}

export async function marcarComoErro(id: string): Promise<void> {
  await db.update(comuniqueSe).set({ status: "erro", updatedAt: new Date() }).where(eq(comuniqueSe.id, id));
}

export async function atualizarItemChecklist(
  id: string,
  itemId: string,
  concluida: boolean,
): Promise<ChecklistItem[] | null> {
  const [linha] = await db
    .select({ checklistJson: comuniqueSe.checklistJson })
    .from(comuniqueSe)
    .where(eq(comuniqueSe.id, id))
    .limit(1);

  const atual = linha?.checklistJson as ChecklistJson | null | undefined;
  if (!atual) return null;

  const indice = atual.itens.findIndex((item) => item.id === itemId);
  if (indice === -1) return null;

  const itensAtualizados = atual.itens.map((item, i) => (i === indice ? { ...item, concluida } : item));

  await db
    .update(comuniqueSe)
    .set({ checklistJson: { itens: itensAtualizados }, updatedAt: new Date() })
    .where(eq(comuniqueSe.id, id));

  return itensAtualizados;
}
