import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { assinatura } from "./assinatura";
import { empresa } from "./empresa";
import { plano } from "./plano";

export type TipoCobranca = "assinatura" | "upgrade" | "renovacao";
export type StatusCobranca = "pendente" | "paga" | "vencida" | "cancelada" | "estornada";

export const cobranca = pgTable(
  "cobranca",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assinaturaId: uuid("assinatura_id")
      .notNull()
      .references(() => assinatura.id, { onDelete: "cascade" }),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresa.id, { onDelete: "cascade" }),
    tipo: varchar("tipo", { length: 20 }).$type<TipoCobranca>().notNull(),
    planoDestinoId: uuid("plano_destino_id")
      .notNull()
      .references(() => plano.id),
    valorCentavos: integer("valor_centavos").notNull(),
    status: varchar("status", { length: 20 }).$type<StatusCobranca>().notNull().default("pendente"),
    venceEm: timestamp("vence_em", { withTimezone: true }).notNull(),
    provider: varchar("provider", { length: 30 }),
    providerChargeId: varchar("provider_charge_id", { length: 100 }),
    pixCopiaECola: text("pix_copia_e_cola"),
    pixQrCodeBase64: text("pix_qr_code_base64"),
    pixExpiraEm: timestamp("pix_expira_em", { withTimezone: true }),
    pagaEm: timestamp("paga_em", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cobranca_provider_charge").on(table.provider, table.providerChargeId),
    index("cobranca_assinatura_status").on(table.assinaturaId, table.status),
  ],
);
