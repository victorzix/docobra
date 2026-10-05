import { pgTable, uuid, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const plano = pgTable("plano", {
  id: uuid("id").defaultRandom().primaryKey(),
  chave: varchar("chave", { length: 50 }).notNull().unique(),
  nome: varchar("nome", { length: 100 }).notNull(),
  nivel: integer("nivel").notNull().default(0),
  cicloDias: integer("ciclo_dias").notNull(),
  precoCentavos: integer("preco_centavos").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  interno: boolean("interno").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
