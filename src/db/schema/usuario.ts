import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

import { empresa } from "./empresa";

export const usuario = pgTable("usuario", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
  empresaId: uuid("empresa_id")
    .notNull()
    .references(() => empresa.id, { onDelete: "cascade" }),
  // Níveis de permissão ainda não fechados (ver TODO no CLAUDE.md) — texto
  // livre por ora para não travar o resto do schema numa decisão pendente.
  papel: varchar("papel", { length: 50 }).notNull().default("usuario"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
