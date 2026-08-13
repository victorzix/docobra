import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { projeto } from "@/db/schema";

export interface Projeto {
  id: string;
  nome: string;
  endereco: string | null;
  createdAt: Date;
}

const CAMPOS_PROJETO = {
  id: projeto.id,
  nome: projeto.nome,
  endereco: projeto.endereco,
  createdAt: projeto.createdAt,
};

export async function listarProjetos(empresaId: string): Promise<Projeto[]> {
  return db
    .select(CAMPOS_PROJETO)
    .from(projeto)
    .where(eq(projeto.empresaId, empresaId))
    .orderBy(desc(projeto.createdAt));
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
