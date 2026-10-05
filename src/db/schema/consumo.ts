import { index, integer, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

import { empresa } from "./empresa";
import { permissao } from "./permissao";

export const consumo = pgTable(
  "consumo",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresa.id, { onDelete: "cascade" }),
    permissaoId: uuid("permissao_id")
      .notNull()
      .references(() => permissao.id),
    quantidade: integer("quantidade").notNull().default(1),
    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true }).defaultNow().notNull(),
    referencia: varchar("referencia", { length: 100 }).notNull(),
  },
  (table) => [
    // Retry do mesmo item não pode contar duas vezes.
    unique("consumo_referencia_unica").on(table.empresaId, table.permissaoId, table.referencia),
    index("consumo_janela").on(table.empresaId, table.permissaoId, table.ocorridoEm),
  ],
);
