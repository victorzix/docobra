import { eq } from "drizzle-orm";

import { db } from "@/db";
import { empresa, usuario } from "@/db/schema";

export interface NomesUsuarioEEmpresa {
  usuarioNome: string;
  empresaNome: string;
}

export async function buscarNomesUsuarioEEmpresa(
  userId: string,
): Promise<NomesUsuarioEEmpresa | null> {
  const resultado = await db
    .select({ usuarioNome: usuario.nome, empresaNome: empresa.nome })
    .from(usuario)
    .innerJoin(empresa, eq(usuario.empresaId, empresa.id))
    .where(eq(usuario.id, userId))
    .limit(1);

  return resultado[0] ?? null;
}
