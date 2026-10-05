import { Client } from "pg";

import { semearPlanos } from "../../../../scripts/seed-planos.mjs";

export async function semearCatalogoNoBancoDeTeste(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await semearPlanos(client);
  } finally {
    await client.end();
  }
}
