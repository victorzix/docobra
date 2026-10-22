import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { empresa } from "./empresa";
import { permissao } from "./permissao";

export const empresaPermissao = pgTable(
  "empresa_permissao",
  {
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresa.id, { onDelete: "cascade" }),
    permissaoId: uuid("permissao_id")
      .notNull()
      .references(() => permissao.id, { onDelete: "cascade" }),
    valor: integer("valor"),
    janelaDias: integer("janela_dias"),
    inicio: timestamp("inicio", { withTimezone: true }).defaultNow().notNull(),
    expiraEm: timestamp("expira_em", { withTimezone: true }),
    motivo: text("motivo").notNull().default(""),
  },
  (table) => [
    primaryKey({ columns: [table.empresaId, table.permissaoId] }),
    check("empresa_permissao_valor_janela", sql`(${table.valor} is null) = (${table.janelaDias} is null)`),
    check("empresa_permissao_janela_positiva", sql`${table.janelaDias} is null or ${table.janelaDias} > 0`),
  ],
);
