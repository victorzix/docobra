import { jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { cobranca } from "./cobranca";

export const eventoPagamento = pgTable(
  "evento_pagamento",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 30 }).notNull(),
    eventId: varchar("event_id", { length: 100 }).notNull(),
    tipoOriginal: varchar("tipo_original", { length: 60 }).notNull(),
    providerChargeId: varchar("provider_charge_id", { length: 100 }),
    cobrancaId: uuid("cobranca_id").references(() => cobranca.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull(),
    resultado: varchar("resultado", { length: 30 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("evento_pagamento_unico").on(table.provider, table.eventId)],
);
