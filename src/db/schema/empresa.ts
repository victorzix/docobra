import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const empresa = pgTable("empresa", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  logoUrl: varchar("logo_url", { length: 512 }),
  plano: varchar("plano", { length: 50 }).notNull().default("trial"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
