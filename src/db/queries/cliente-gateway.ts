import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { clienteGateway } from "@/db/schema";

export async function buscarProviderClienteId(empresaId: string, provider: string): Promise<string | null> {
  const [linha] = await db
    .select({ providerClienteId: clienteGateway.providerClienteId })
    .from(clienteGateway)
    .where(and(eq(clienteGateway.empresaId, empresaId), eq(clienteGateway.provider, provider)))
    .limit(1);
  return linha?.providerClienteId ?? null;
}

export async function salvarProviderClienteId(
  empresaId: string,
  provider: string,
  providerClienteId: string,
): Promise<void> {
  await db.insert(clienteGateway).values({ empresaId, provider, providerClienteId }).onConflictDoNothing();
}
