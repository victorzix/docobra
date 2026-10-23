import { pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { empresa } from "./empresa";

export const clienteGateway = pgTable(
  "cliente_gateway",
  {
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresa.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 30 }).notNull(),
    providerClienteId: varchar("provider_cliente_id", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.empresaId, table.provider] })],
);
