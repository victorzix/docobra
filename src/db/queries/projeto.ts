import { and, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { projeto } from "@/db/schema";

export interface Projeto {
  id: string;
  nome: string;
  endereco: string | null;
  createdAt: Date;
}

export interface PaginaProjetos {
  itens: Projeto[];
  nextCursor: string | null;
}

const CAMPOS_PROJETO = {
  id: projeto.id,
  nome: projeto.nome,
  endereco: projeto.endereco,
  createdAt: projeto.createdAt,
};

const TAMANHO_PAGINA_PADRAO = 9;

export async function listarProjetos(empresaId: string): Promise<Projeto[]> {
  return db
    .select(CAMPOS_PROJETO)
    .from(projeto)
    .where(eq(projeto.empresaId, empresaId))
    .orderBy(desc(projeto.createdAt));
}

function codificarCursor(item: Projeto): string {
  return Buffer.from(`${item.createdAt.toISOString()}|${item.id}`, "utf8").toString("base64");
}

function decodificarCursor(cursor: string): { createdAt: string; id: string } {
  const [createdAt, id] = Buffer.from(cursor, "base64").toString("utf8").split("|");
  return { createdAt, id };
}

export async function listarProjetosPaginado(
  empresaId: string,
  { cursor, limite = TAMANHO_PAGINA_PADRAO }: { cursor?: string; limite?: number } = {},
): Promise<PaginaProjetos> {
  const condicoes = [eq(projeto.empresaId, empresaId)];

  if (cursor) {
    const { createdAt, id } = decodificarCursor(cursor);
    condicoes.push(sql`(${projeto.createdAt}, ${projeto.id}) < (${createdAt}::timestamptz, ${id}::uuid)`);
  }

  const itens = await db
    .select(CAMPOS_PROJETO)
    .from(projeto)
    .where(and(...condicoes))
    .orderBy(desc(projeto.createdAt), desc(projeto.id))
    .limit(limite + 1);

  const temMaisPaginas = itens.length > limite;
  const pagina = temMaisPaginas ? itens.slice(0, limite) : itens;

  return {
    itens: pagina,
    nextCursor: temMaisPaginas ? codificarCursor(pagina[pagina.length - 1]) : null,
  };
}

export async function contarProjetos(empresaId: string): Promise<number> {
  const [resultado] = await db
    .select({ total: count() })
    .from(projeto)
    .where(eq(projeto.empresaId, empresaId));
  return resultado.total;
}

export async function criarProjeto(input: {
  nome: string;
  endereco?: string;
  empresaId: string;
}): Promise<Projeto> {
  const [criado] = await db.insert(projeto).values(input).returning(CAMPOS_PROJETO);
  return criado;
}

export async function buscarProjetoDaEmpresa(id: string, empresaId: string): Promise<Projeto | null> {
  const [resultado] = await db
    .select(CAMPOS_PROJETO)
    .from(projeto)
    .where(and(eq(projeto.id, id), eq(projeto.empresaId, empresaId)))
    .limit(1);
  return resultado ?? null;
}
