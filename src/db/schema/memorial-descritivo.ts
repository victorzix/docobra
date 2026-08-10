import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";

import { projeto } from "./projeto";

export const memorialDescritivo = pgTable("memorial_descritivo", {
  id: uuid("id").defaultRandom().primaryKey(),
  projetoId: uuid("projeto_id")
    .notNull()
    .references(() => projeto.id, { onDelete: "cascade" }),
  respostasFormularioJson: jsonb("respostas_formulario_json").notNull(),
  audioUrl: varchar("audio_url", { length: 512 }),
  documentoGeradoUrl: varchar("documento_gerado_url", { length: 512 }),
  status: varchar("status", { length: 50 }).notNull().default("rascunho"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
