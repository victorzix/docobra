import { sql } from "drizzle-orm";

import { db } from "@/db";
import { contador } from "@/db/schema";

export type EntidadeComContador = "projeto" | "memorial_descritivo" | "comunique_se";

export async function proximoNumero(empresaId: string, entidade: EntidadeComContador): Promise<number> {
  const [linha] = await db
    .insert(contador)
    .values({ empresaId, entidade, valor: 1 })
    .onConflictDoUpdate({
      target: [contador.empresaId, contador.entidade],
      set: { valor: sql`${contador.valor} + 1` },
    })
    .returning({ valor: contador.valor });
  return linha.valor;
}
