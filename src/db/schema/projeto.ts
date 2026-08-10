import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

import { empresa } from "./empresa";

export const projeto = pgTable("projeto", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  empresaId: uuid("empresa_id")
    .notNull()
    .references(() => empresa.id, { onDelete: "cascade" }),
  endereco: varchar("endereco", { length: 512 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
