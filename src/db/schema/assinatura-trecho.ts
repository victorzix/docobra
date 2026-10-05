import { sql } from "drizzle-orm";
import { pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { assinatura } from "./assinatura";
import { plano } from "./plano";

export const assinaturaTrecho = pgTable(
  "assinatura_trecho",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assinaturaId: uuid("assinatura_id")
      .notNull()
      .references(() => assinatura.id, { onDelete: "cascade" }),
    planoId: uuid("plano_id")
      .notNull()
      .references(() => plano.id),
    inicio: timestamp("inicio", { withTimezone: true }).defaultNow().notNull(),
    fim: timestamp("fim", { withTimezone: true }),
    origem: varchar("origem", { length: 20 })
      .$type<"autoatendimento" | "suporte">()
      .notNull()
      .default("autoatendimento"),
  },
  (table) => [
    // No máximo um trecho vigente (fim nulo) por assinatura.
    uniqueIndex("assinatura_trecho_vigente").on(table.assinaturaId).where(sql`${table.fim} is null`),
  ],
);
