import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { permissao } from "./permissao";
import { plano } from "./plano";

export const planoPermissao = pgTable(
  "plano_permissao",
  {
    planoId: uuid("plano_id")
      .notNull()
      .references(() => plano.id, { onDelete: "cascade" }),
    permissaoId: uuid("permissao_id")
      .notNull()
      .references(() => permissao.id, { onDelete: "cascade" }),
    valor: integer("valor"),
    janelaDias: integer("janela_dias"),
  },
  (table) => [
    primaryKey({ columns: [table.planoId, table.permissaoId] }),
    // Limite sem janela (ou janela sem limite) não tem como ser contado.
    check("plano_permissao_valor_janela", sql`(${table.valor} is null) = (${table.janelaDias} is null)`),
  ],
);
