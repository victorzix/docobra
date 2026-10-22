import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

import { empresa } from "./empresa";

// Só estes três são gravados. "carencia" e "suspensa" são derivados de `vence_em`
// e da data de agora (ver src/lib/permissoes/status-assinatura.ts).
export type StatusAssinatura = "trial" | "ativa" | "cancelada";

export const assinatura = pgTable("assinatura", {
  id: uuid("id").defaultRandom().primaryKey(),
  empresaId: uuid("empresa_id")
    .notNull()
    .unique()
    .references(() => empresa.id, { onDelete: "cascade" }),
  inicio: timestamp("inicio", { withTimezone: true }).defaultNow().notNull(),
  status: varchar("status", { length: 20 }).$type<StatusAssinatura>().notNull().default("trial"),
  venceEm: timestamp("vence_em", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
