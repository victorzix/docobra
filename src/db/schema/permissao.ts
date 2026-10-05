import { pgTable, uuid, varchar, text } from "drizzle-orm/pg-core";

export const permissao = pgTable("permissao", {
  id: uuid("id").defaultRandom().primaryKey(),
  chave: varchar("chave", { length: 100 }).notNull().unique(),
  tipo: varchar("tipo", { length: 20 }).$type<"booleana" | "limite">().notNull(),
  descricao: text("descricao").notNull().default(""),
});
