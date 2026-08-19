import { pgTable, uuid, varchar, integer, primaryKey } from "drizzle-orm/pg-core";

import { empresa } from "./empresa";

export const contador = pgTable(
  "contador",
  {
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresa.id, { onDelete: "cascade" }),
    entidade: varchar("entidade", { length: 50 }).notNull(),
    valor: integer("valor").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.empresaId, table.entidade] })],
);
