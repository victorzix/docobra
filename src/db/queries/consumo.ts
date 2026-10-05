import { db } from "@/db";
import { consumo } from "@/db/schema";
import { buscarPermissaoPorChave } from "./permissao";

export async function registrarConsumo(
  empresaId: string,
  chave: string,
  referencia: string,
  { quantidade = 1, agora = new Date() }: { quantidade?: number; agora?: Date } = {},
): Promise<boolean> {
  const permissaoEncontrada = await buscarPermissaoPorChave(chave);
  if (!permissaoEncontrada) throw new Error(`Permissão desconhecida: "${chave}".`);

  const inseridos = await db
    .insert(consumo)
    .values({
      empresaId,
      permissaoId: permissaoEncontrada.id,
      quantidade,
      ocorridoEm: agora,
      referencia,
    })
    .onConflictDoNothing()
    .returning({ id: consumo.id });

  return inseridos.length > 0;
}
