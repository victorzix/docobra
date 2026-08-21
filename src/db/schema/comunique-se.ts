import { pgTable, uuid, varchar, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

import { projeto } from "./projeto";

export const comuniqueSe = pgTable("comunique_se", {
  id: uuid("id").defaultRandom().primaryKey(),
  numero: integer("numero").notNull().default(0),
  projetoId: uuid("projeto_id")
    .notNull()
    .references(() => projeto.id, { onDelete: "cascade" }),
  pdfOriginalUrl: varchar("pdf_original_url", { length: 512 }),
  checklistJson: jsonb("checklist_json"),
  status: varchar("status", { length: 50 }).notNull().default("processando"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
