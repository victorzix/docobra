# Planos e permissões — Fase 4a (núcleo de pagamento com Asaas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o backend de pagamento (Pix via Asaas, sandbox): tabelas, camada `core/payments`, serviços de cobrança/webhook/renovação e as rotas, sem tela.

**Architecture:** `PaymentProvider` + `PaymentRouter` em `src/core/payments/` (mesmo padrão de `core/llm/`), com `AsaasProvider` falando por `fetch`. Serviços em `src/lib/pagamentos/` gravam a `cobranca` antes de falar com o gateway, tratam o webhook numa única transação (evento + efeitos) e geram renovações de forma idempotente. As rotas são finas.

**Tech Stack:** Next.js (App Router), Drizzle + Postgres, Zod, Vitest com banco real `docobra-local-test`, `fetch` nativo.

Spec: `docs/superpowers/specs/2026-10-23-planos-fase-4a-design.md`.

## Global Constraints

- Executar numa branch própria a partir da `main` (ex.: `feat/planos-fase-4a`). **Nunca commitar na `main`, nunca dar push nem merge sem o Victor pedir.** Os commits dos passos "Commit" são na branch de feature e terminam com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (texto literal, como parágrafo final).
- Tudo contra o **sandbox** do Asaas. Base: `https://api-sandbox.asaas.com` (variável `ASAAS_BASE_URL`, padrão sandbox). Autenticação: header `access_token`. Nenhum teste faz chamada de rede real: o `fetch` é injetado.
- Nomes de campos do Asaas, **exatos**: cliente `name`, `cpfCnpj`, `email`, `externalReference`; cobrança `customer`, `billingType: "PIX"`, `value` (reais decimais), `dueDate` (`YYYY-MM-DD`), `externalReference`, `description`; QR `encodedImage`, `payload`, `expirationDate`; webhook com header `asaas-access-token`, corpo `{ id, event, payment: { id, externalReference } }`.
- Eventos do Asaas: `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` → `paga`; `PAYMENT_OVERDUE` → `vencida`; `PAYMENT_DELETED` → `cancelada`; `PAYMENT_REFUNDED` → `estornada`; os demais → ignorados (`200` sem ação).
- Dinheiro sempre inteiro em centavos no nosso lado; conversão para reais só na borda do Asaas (`centavosParaReais`).
- Schema aplicado com `npm run db:push` (dev) e `set -a; . ./.env.test; set +a; npx drizzle-kit push` (teste). Não existe pasta `drizzle/`. O `drizzle-kit push` recria algumas constraints nomeadas a cada execução (comportamento conhecido): por isso as unicidades novas usam `uniqueIndex`.
- Testes de integração rodam contra `docobra-local-test`; `fileParallelism: false`; **nunca rodar duas execuções de teste ao mesmo tempo**. Se um teste do plano falhar por defeito do código ou da expectativa do próprio plano (não por erro de digitação), pare e reporte `DONE_WITH_CONCERNS`/`BLOCKED` com o diagnóstico, em vez de dobrar um dos lados em silêncio.
- Comentário só quando o PORQUÊ não é óbvio. Sem abstração além do que a tarefa pede. Nomes de domínio em português, imports com alias `@/`, uma tabela por arquivo de schema, schemas Zod em `src/lib/validations/<entidade>/<operacao>.schema.ts`.
- Erros customizados no estilo do projeto: `class X extends Error { constructor(msg, public readonly campo) { super(msg); this.name = "X"; } }`.
- Regra de fallback do router: só passa para o próximo provider em `RecusaDefinitivaError`; em `FalhaIncertaError` (rede, timeout, 5xx, 408, 429) **não** troca de gateway e anota `provider` no erro.
- O provider real só é montado quando usado (`pagamentoRouter()` é preguiçoso): sem `ASAAS_API_KEY` o app e os testes seguem funcionando.
- Fora desta fase: telas, ligar `ASSINATURA_SUSPENSAO_ATIVA`, boleto e cartão, cancelamento pelo cliente, provider AbacatePay, preços reais.
- O repositório pode ter outras alterações não commitadas que não são desta fase: nunca usar `git add -A`/`git add .`; adicionar sempre caminhos explícitos.

## File Structure

Criar:
- `src/db/schema/cliente-gateway.ts`, `cobranca.ts`, `evento-pagamento.ts`
- `src/db/queries/executor.ts`, `plano.ts`, `cobranca.ts`, `cliente-gateway.ts`
- `src/core/payments/{types,erros,formatos,asaas,router,index}.ts`
- `src/lib/pagamentos/{efeitos,iniciar-cobranca,processar-evento,gerar-renovacoes,serializar-cobranca}.ts`
- `src/lib/validations/cobranca/{create,response}.schema.ts`, `src/lib/validations/empresa/documento.schema.ts`
- `src/app/api/webhooks/pagamentos/[provider]/route.ts`, `src/app/api/cobrancas/route.ts`, `src/app/api/cobrancas/[id]/route.ts`, `src/app/api/empresa/documento/route.ts`, `src/app/api/cron/renovacoes/route.ts`
- `scripts/asaas-sandbox-check.mjs`, `docs/pagamentos-asaas.md`
- Testes ao lado de cada um, mais os helpers `src/core/payments/__tests__/helpers/provedor-falso.ts` e `src/lib/pagamentos/__tests__/helpers/cenario.ts`.

Modificar: `src/db/schema/empresa.ts`, `src/db/schema/index.ts`, `.env.example`.

---

### Task 1: Schema (documento, cliente_gateway, cobranca, evento_pagamento)

**Files:**
- Modify: `src/db/schema/empresa.ts`, `src/db/schema/index.ts`
- Create: `src/db/schema/cliente-gateway.ts`, `src/db/schema/cobranca.ts`, `src/db/schema/evento-pagamento.ts`
- Test: `src/db/__tests__/schema-pagamentos.test.ts`

**Interfaces:**
- Produces (exportados por `@/db/schema`): `clienteGateway`, `cobranca`, `eventoPagamento`; `empresa.documento`; tipos `TipoCobranca = "assinatura" | "upgrade" | "renovacao"` e `StatusCobranca = "pendente" | "paga" | "vencida" | "cancelada" | "estornada"` (de `cobranca.ts`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/db/__tests__/schema-pagamentos.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { clienteGateway, cobranca, empresa, eventoPagamento, plano } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "./helpers/semear-catalogo";

async function limpar() {
  await db.delete(eventoPagamento);
  await db.delete(empresa);
}

async function criarBase() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  const { id: assinaturaId } = await criarAssinatura(db, {
    empresaId: novaEmpresa.id,
    planoChave: "trial",
    status: "trial",
    origem: "suporte",
  });
  const [essencial] = await db.select().from(plano).where(eq(plano.chave, "essencial"));
  return { empresaId: novaEmpresa.id, assinaturaId, planoId: essencial.id };
}

function dadosDeCobranca(base: { empresaId: string; assinaturaId: string; planoId: string }) {
  return {
    assinaturaId: base.assinaturaId,
    empresaId: base.empresaId,
    tipo: "assinatura" as const,
    planoDestinoId: base.planoId,
    valorCentavos: 9900,
    venceEm: new Date("2026-06-18T12:00:00Z"),
  };
}

describe("schema de pagamentos", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limpar);
  afterEach(limpar);

  it("empresa.documento é opcional e guarda o valor informado", async () => {
    const [semDocumento] = await db.insert(empresa).values({ nome: "Sem Documento" }).returning();
    const [comDocumento] = await db
      .insert(empresa)
      .values({ nome: "Com Documento", documento: "12345678000199" })
      .returning();

    expect(semDocumento.documento).toBeNull();
    expect(comDocumento.documento).toBe("12345678000199");
  });

  it("cobranca nasce pendente e sem dados do gateway", async () => {
    const base = await criarBase();

    const [criada] = await db.insert(cobranca).values(dadosDeCobranca(base)).returning();

    expect(criada.status).toBe("pendente");
    expect(criada.provider).toBeNull();
    expect(criada.providerChargeId).toBeNull();
    expect(criada.pixCopiaECola).toBeNull();
  });

  it("rejeita duas cobranças com o mesmo (provider, provider_charge_id), mas aceita várias sem gateway", async () => {
    const base = await criarBase();
    const comGateway = { ...dadosDeCobranca(base), provider: "asaas", providerChargeId: "pay_1" };

    await db.insert(cobranca).values(comGateway);
    await expect(db.insert(cobranca).values(comGateway)).rejects.toThrow();

    await db.insert(cobranca).values(dadosDeCobranca(base));
    await db.insert(cobranca).values(dadosDeCobranca(base));
  });

  it("cliente_gateway tem uma linha por (empresa, provider)", async () => {
    const base = await criarBase();
    const linha = { empresaId: base.empresaId, provider: "asaas", providerClienteId: "cus_1" };

    await db.insert(clienteGateway).values(linha);

    await expect(db.insert(clienteGateway).values(linha)).rejects.toThrow();
  });

  it("evento_pagamento rejeita o mesmo (provider, event_id) duas vezes", async () => {
    const linha = { provider: "asaas", eventId: "evt_1", tipoOriginal: "PAYMENT_RECEIVED", payload: { id: "evt_1" } };

    await db.insert(eventoPagamento).values(linha);

    await expect(db.insert(eventoPagamento).values(linha)).rejects.toThrow();
  });

  it("apagar a empresa apaga as cobranças e o cliente do gateway", async () => {
    const base = await criarBase();
    await db.insert(cobranca).values(dadosDeCobranca(base));
    await db
      .insert(clienteGateway)
      .values({ empresaId: base.empresaId, provider: "asaas", providerClienteId: "cus_1" });

    await db.delete(empresa).where(eq(empresa.id, base.empresaId));

    expect(await db.select().from(cobranca)).toHaveLength(0);
    expect(await db.select().from(clienteGateway)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/db/__tests__/schema-pagamentos.test.ts`
Expected: FAIL (`clienteGateway`/`cobranca`/`eventoPagamento` não são exportados por `@/db/schema`).

- [ ] **Step 3: Implementar o schema**

Em `src/db/schema/empresa.ts`, acrescentar a coluna (depois de `logoUrl`):

```ts
  documento: varchar("documento", { length: 20 }),
```

`src/db/schema/cliente-gateway.ts`:

```ts
import { pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { empresa } from "./empresa";

export const clienteGateway = pgTable(
  "cliente_gateway",
  {
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresa.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 30 }).notNull(),
    providerClienteId: varchar("provider_cliente_id", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.empresaId, table.provider] })],
);
```

`src/db/schema/cobranca.ts`:

```ts
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
```

`src/db/schema/evento-pagamento.ts`:

```ts
import { jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { cobranca } from "./cobranca";

export const eventoPagamento = pgTable(
  "evento_pagamento",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 30 }).notNull(),
    eventId: varchar("event_id", { length: 100 }).notNull(),
    tipoOriginal: varchar("tipo_original", { length: 60 }).notNull(),
    providerChargeId: varchar("provider_charge_id", { length: 100 }),
    cobrancaId: uuid("cobranca_id").references(() => cobranca.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull(),
    resultado: varchar("resultado", { length: 30 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("evento_pagamento_unico").on(table.provider, table.eventId)],
);
```

Em `src/db/schema/index.ts`, acrescentar ao final:

```ts
export * from "./cliente-gateway";
export * from "./cobranca";
export * from "./evento-pagamento";
```

- [ ] **Step 4: Aplicar o schema no dev e no teste**

Run (dev): `npm run db:push`
Run (teste, Git Bash): `set -a; . ./.env.test; set +a; npx drizzle-kit push`
Expected: ambos terminam com `[✓] Changes applied` (a coluna e as 3 tabelas entram; recriações de constraints antigas que aparecerem são o comportamento conhecido).

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/db/__tests__/schema-pagamentos.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema src/db/__tests__/schema-pagamentos.test.ts
git commit -m "feat(pagamentos): schema de cobranca, evento de pagamento, cliente do gateway e documento da empresa"
```

---

### Task 2: Tipos, erros e formatos de `core/payments`

**Files:**
- Create: `src/core/payments/types.ts`, `src/core/payments/erros.ts`, `src/core/payments/formatos.ts`
- Test: `src/core/payments/__tests__/formatos.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `DadosCliente { nome: string; documento: string; email: string | null }`; `CriarCobrancaInput { clienteId: string; referencia: string; valorCentavos: number; venceEm: Date; descricao: string }`; `CobrancaCriada { providerChargeId: string; pix: { copiaECola: string; qrCodeBase64: string; expiraEm: Date | null } }`; `StatusEvento = "paga" | "vencida" | "cancelada" | "estornada"`; `EventoPagamento { eventId: string; tipoOriginal: string; status: StatusEvento; providerChargeId: string; referencia: string | null; payload: unknown }`; `PaymentProvider` (`nome`, `criarCliente(dados, referencia): Promise<string>`, `criarCobranca(input): Promise<CobrancaCriada>`, `buscarCobrancaPorReferencia(referencia): Promise<CobrancaCriada | null>`, `cancelarCobranca(providerChargeId): Promise<void>`, `lerWebhook(headers: Headers, corpoCru: string): EventoPagamento | null`).
  - `erros.ts`: `RecusaDefinitivaError(mensagem, codigo?, status?)`, `FalhaIncertaError(mensagem, causa?)` com campo mutável `provider?: string`, `WebhookNaoAutenticadoError()`, `WebhookInvalidoError(mensagem)`.
  - `formatos.ts`: `centavosParaReais(centavos: number): number`; `dataIso(data: Date): string` (`YYYY-MM-DD` no fuso de São Paulo).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/core/payments/__tests__/formatos.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { centavosParaReais, dataIso } from "../formatos";

describe("centavosParaReais", () => {
  it("converte centavos em reais decimais sem erro de ponto flutuante", () => {
    expect(centavosParaReais(9900)).toBe(99);
    expect(centavosParaReais(10090)).toBe(100.9);
    expect(centavosParaReais(1550)).toBe(15.5);
    expect(centavosParaReais(5)).toBe(0.05);
    expect(centavosParaReais(0)).toBe(0);
    expect(centavosParaReais(1)).toBe(0.01);
  });
});

describe("dataIso", () => {
  it("formata AAAA-MM-DD no fuso de São Paulo", () => {
    expect(dataIso(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06-15");
  });

  it("não adianta nem atrasa o dia por causa do fuso (02:00Z ainda é o dia anterior em SP)", () => {
    expect(dataIso(new Date("2026-06-15T02:00:00Z"))).toBe("2026-06-14");
    expect(dataIso(new Date("2026-06-15T03:00:00Z"))).toBe("2026-06-15");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/core/payments/__tests__/formatos.test.ts`
Expected: FAIL (`Failed to resolve import "../formatos"`).

- [ ] **Step 3: Implementar**

`src/core/payments/formatos.ts`:

```ts
export function centavosParaReais(centavos: number): number {
  return Number((centavos / 100).toFixed(2));
}

export function dataIso(data: Date): string {
  return data.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
```

`src/core/payments/erros.ts`:

```ts
// O gateway respondeu e recusou (4xx): é seguro tentar outro provider.
export class RecusaDefinitivaError extends Error {
  constructor(
    mensagem: string,
    public readonly codigo?: string,
    public readonly status?: number,
  ) {
    super(mensagem);
    this.name = "RecusaDefinitivaError";
  }
}

// Rede, timeout, 5xx, 408 ou 429: a operação pode ter sido feita. Não trocar de provider.
export class FalhaIncertaError extends Error {
  provider?: string;

  constructor(
    mensagem: string,
    public readonly causa?: unknown,
  ) {
    super(mensagem);
    this.name = "FalhaIncertaError";
  }
}

export class WebhookNaoAutenticadoError extends Error {
  constructor() {
    super("Token do webhook inválido.");
    this.name = "WebhookNaoAutenticadoError";
  }
}

export class WebhookInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "WebhookInvalidoError";
  }
}
```

`src/core/payments/types.ts`:

```ts
export interface DadosCliente {
  nome: string;
  documento: string;
  email: string | null;
}

export interface CriarCobrancaInput {
  clienteId: string;
  referencia: string;
  valorCentavos: number;
  venceEm: Date;
  descricao: string;
}

export interface CobrancaCriada {
  providerChargeId: string;
  pix: { copiaECola: string; qrCodeBase64: string; expiraEm: Date | null };
}

export type StatusEvento = "paga" | "vencida" | "cancelada" | "estornada";

export interface EventoPagamento {
  eventId: string;
  tipoOriginal: string;
  status: StatusEvento;
  providerChargeId: string;
  referencia: string | null;
  payload: unknown;
}

export interface PaymentProvider {
  readonly nome: string;
  criarCliente(dados: DadosCliente, referencia: string): Promise<string>;
  criarCobranca(input: CriarCobrancaInput): Promise<CobrancaCriada>;
  buscarCobrancaPorReferencia(referencia: string): Promise<CobrancaCriada | null>;
  cancelarCobranca(providerChargeId: string): Promise<void>;
  lerWebhook(headers: Headers, corpoCru: string): EventoPagamento | null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/core/payments/__tests__/formatos.test.ts`
Expected: PASS (3 testes).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/core/payments/types.ts src/core/payments/erros.ts src/core/payments/formatos.ts src/core/payments/__tests__/formatos.test.ts
git commit -m "feat(pagamentos): tipos, erros e formatos da camada de pagamento"
```

---

### Task 3: `AsaasProvider`

**Files:**
- Create: `src/core/payments/asaas.ts`
- Test: `src/core/payments/__tests__/asaas.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: tipos, erros e formatos da Task 2.
- Produces: `interface OpcoesAsaas { apiKey: string; baseUrl: string; webhookToken: string; fetchImpl?: typeof fetch; timeoutMs?: number }` e `class AsaasProvider implements PaymentProvider` (`nome = "asaas"`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/core/payments/__tests__/asaas.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { AsaasProvider } from "../asaas";
import {
  FalhaIncertaError,
  RecusaDefinitivaError,
  WebhookInvalidoError,
  WebhookNaoAutenticadoError,
} from "../erros";

const BASE = "https://api-sandbox.asaas.com";

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function criarProvider(fetchImpl: typeof fetch) {
  return new AsaasProvider({ apiKey: "chave-teste", baseUrl: BASE, webhookToken: "token-do-webhook", fetchImpl });
}

function chamada(fetchMock: ReturnType<typeof vi.fn>, indice: number) {
  const [url, opcoes] = fetchMock.mock.calls[indice] as [string, RequestInit];
  return { url, metodo: opcoes.method, headers: opcoes.headers as Record<string, string>, corpo: opcoes.body };
}

const QR = { encodedImage: "base64-do-qr", payload: "00020126-copia-e-cola", expirationDate: "2026-06-18 23:59:59" };

describe("AsaasProvider.criarCliente", () => {
  it("cadastra o cliente e devolve o id", async () => {
    const fetchMock = vi.fn(async () => resposta({ id: "cus_123" }));

    const id = await criarProvider(fetchMock as unknown as typeof fetch).criarCliente(
      { nome: "Empresa X", documento: "12345678000199", email: "a@b.com" },
      "empresa-1",
    );

    expect(id).toBe("cus_123");
    const c = chamada(fetchMock, 0);
    expect(c.url).toBe(`${BASE}/v3/customers`);
    expect(c.metodo).toBe("POST");
    expect(c.headers.access_token).toBe("chave-teste");
    expect(JSON.parse(c.corpo as string)).toEqual({
      name: "Empresa X",
      cpfCnpj: "12345678000199",
      email: "a@b.com",
      externalReference: "empresa-1",
    });
  });

  it("omite o email quando não há", async () => {
    const fetchMock = vi.fn(async () => resposta({ id: "cus_123" }));

    await criarProvider(fetchMock as unknown as typeof fetch).criarCliente(
      { nome: "Empresa X", documento: "12345678000199", email: null },
      "empresa-1",
    );

    expect(JSON.parse(chamada(fetchMock, 0).corpo as string)).not.toHaveProperty("email");
  });
});

describe("AsaasProvider.criarCobranca", () => {
  it("cria a cobrança Pix e busca o QR Code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta({ id: "pay_1" }))
      .mockResolvedValueOnce(resposta(QR));

    const criada = await criarProvider(fetchMock as unknown as typeof fetch).criarCobranca({
      clienteId: "cus_123",
      referencia: "cobranca-1",
      valorCentavos: 9900,
      venceEm: new Date("2026-06-18T12:00:00Z"),
      descricao: "DocObra — plano Essencial",
    });

    expect(criada).toEqual({
      providerChargeId: "pay_1",
      pix: {
        copiaECola: "00020126-copia-e-cola",
        qrCodeBase64: "base64-do-qr",
        expiraEm: new Date("2026-06-18T23:59:59-03:00"),
      },
    });
    const criacao = chamada(fetchMock, 0);
    expect(criacao.url).toBe(`${BASE}/v3/payments`);
    expect(criacao.metodo).toBe("POST");
    expect(JSON.parse(criacao.corpo as string)).toEqual({
      customer: "cus_123",
      billingType: "PIX",
      value: 99,
      dueDate: "2026-06-18",
      externalReference: "cobranca-1",
      description: "DocObra — plano Essencial",
    });
    const qr = chamada(fetchMock, 1);
    expect(qr.url).toBe(`${BASE}/v3/payments/pay_1/pixQrCode`);
    expect(qr.metodo).toBe("GET");
  });

  it("aceita expirationDate sem data (expiraEm nulo)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta({ id: "pay_1" }))
      .mockResolvedValueOnce(resposta({ encodedImage: "x", payload: "y" }));

    const criada = await criarProvider(fetchMock as unknown as typeof fetch).criarCobranca({
      clienteId: "cus_123",
      referencia: "cobranca-1",
      valorCentavos: 500,
      venceEm: new Date("2026-06-18T12:00:00Z"),
      descricao: "x",
    });

    expect(criada.pix.expiraEm).toBeNull();
  });
});

describe("AsaasProvider: classificação de erros", () => {
  const entrada = {
    clienteId: "cus_123",
    referencia: "cobranca-1",
    valorCentavos: 9900,
    venceEm: new Date("2026-06-18T12:00:00Z"),
    descricao: "x",
  };

  it("4xx vira recusa definitiva, com código, descrição e status", async () => {
    const fetchMock = vi.fn(async () =>
      resposta({ errors: [{ code: "invalid_customer", description: "Cliente inválido" }] }, 400),
    );

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(RecusaDefinitivaError);
    expect(erro.message).toBe("Cliente inválido");
    expect(erro.codigo).toBe("invalid_customer");
    expect(erro.status).toBe(400);
  });

  it("401 também é recusa definitiva", async () => {
    const fetchMock = vi.fn(async () => resposta({ errors: [{ code: "invalid_access_token" }] }, 401));

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(RecusaDefinitivaError);
    expect(erro.status).toBe(401);
  });

  it.each([500, 502, 408, 429])("%i vira falha incerta", async (status) => {
    const fetchMock = vi.fn(async () => resposta({}, status));

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
  });

  it("erro de rede ou timeout vira falha incerta", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
  });
});

describe("AsaasProvider.buscarCobrancaPorReferencia", () => {
  it("consulta por externalReference e devolve a cobrança existente com o QR", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta({ data: [{ id: "pay_apagada", deleted: true }, { id: "pay_1", deleted: false }] }))
      .mockResolvedValueOnce(resposta(QR));

    const encontrada = await criarProvider(fetchMock as unknown as typeof fetch).buscarCobrancaPorReferencia(
      "cobranca-1",
    );

    expect(encontrada?.providerChargeId).toBe("pay_1");
    expect(encontrada?.pix.copiaECola).toBe("00020126-copia-e-cola");
    const busca = chamada(fetchMock, 0);
    expect(busca.url).toBe(`${BASE}/v3/payments?externalReference=cobranca-1&limit=10`);
    expect(busca.metodo).toBe("GET");
  });

  it("devolve null quando não há cobrança (ou só apagadas)", async () => {
    const vazio = vi.fn(async () => resposta({ data: [] }));
    const soApagadas = vi.fn(async () => resposta({ data: [{ id: "pay_x", deleted: true }] }));

    expect(await criarProvider(vazio as unknown as typeof fetch).buscarCobrancaPorReferencia("c")).toBeNull();
    expect(await criarProvider(soApagadas as unknown as typeof fetch).buscarCobrancaPorReferencia("c")).toBeNull();
  });
});

describe("AsaasProvider.cancelarCobranca", () => {
  it("apaga a cobrança no Asaas", async () => {
    const fetchMock = vi.fn(async () => resposta({ deleted: true, id: "pay_1" }));

    await criarProvider(fetchMock as unknown as typeof fetch).cancelarCobranca("pay_1");

    const c = chamada(fetchMock, 0);
    expect(c.url).toBe(`${BASE}/v3/payments/pay_1`);
    expect(c.metodo).toBe("DELETE");
  });

  it("trata 404 como já cancelada", async () => {
    const fetchMock = vi.fn(async () => resposta({ errors: [{ code: "not_found" }] }, 404));

    await expect(
      criarProvider(fetchMock as unknown as typeof fetch).cancelarCobranca("pay_1"),
    ).resolves.toBeUndefined();
  });

  it("repassa outros erros", async () => {
    const fetchMock = vi.fn(async () => resposta({ errors: [{ code: "x" }] }, 400));

    await expect(criarProvider(fetchMock as unknown as typeof fetch).cancelarCobranca("pay_1")).rejects.toBeInstanceOf(
      RecusaDefinitivaError,
    );
  });
});

describe("AsaasProvider.lerWebhook", () => {
  const provider = criarProvider(vi.fn() as unknown as typeof fetch);

  function corpo(evento: string) {
    return JSON.stringify({
      id: "evt_1",
      event: evento,
      payment: { id: "pay_1", externalReference: "cobranca-1", status: "RECEIVED" },
    });
  }

  function cabecalhos(token = "token-do-webhook") {
    return new Headers({ "asaas-access-token": token });
  }

  it.each([
    ["PAYMENT_RECEIVED", "paga"],
    ["PAYMENT_CONFIRMED", "paga"],
    ["PAYMENT_OVERDUE", "vencida"],
    ["PAYMENT_DELETED", "cancelada"],
    ["PAYMENT_REFUNDED", "estornada"],
  ])("%s vira %s", (evento, status) => {
    expect(provider.lerWebhook(cabecalhos(), corpo(evento))).toMatchObject({
      eventId: "evt_1",
      tipoOriginal: evento,
      status,
      providerChargeId: "pay_1",
      referencia: "cobranca-1",
    });
  });

  it("evento sem ação devolve null", () => {
    expect(provider.lerWebhook(cabecalhos(), corpo("PAYMENT_CREATED"))).toBeNull();
  });

  it("token errado ou ausente não autentica", () => {
    expect(() => provider.lerWebhook(cabecalhos("outro-token"), corpo("PAYMENT_RECEIVED"))).toThrow(
      WebhookNaoAutenticadoError,
    );
    expect(() => provider.lerWebhook(new Headers(), corpo("PAYMENT_RECEIVED"))).toThrow(WebhookNaoAutenticadoError);
  });

  it("JSON inválido ou evento sem id/pagamento é inválido", () => {
    expect(() => provider.lerWebhook(cabecalhos(), "isso não é json")).toThrow(WebhookInvalidoError);
    expect(() =>
      provider.lerWebhook(cabecalhos(), JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } })),
    ).toThrow(WebhookInvalidoError);
  });

  it("externalReference ausente vira referencia nula", () => {
    const evento = provider.lerWebhook(
      cabecalhos(),
      JSON.stringify({ id: "evt_2", event: "PAYMENT_RECEIVED", payment: { id: "pay_2" } }),
    );

    expect(evento?.referencia).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/core/payments/__tests__/asaas.test.ts`
Expected: FAIL (`Failed to resolve import "../asaas"`).

- [ ] **Step 3: Implementar**

`src/core/payments/asaas.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

import {
  FalhaIncertaError,
  RecusaDefinitivaError,
  WebhookInvalidoError,
  WebhookNaoAutenticadoError,
} from "./erros";
import { centavosParaReais, dataIso } from "./formatos";
import type {
  CobrancaCriada,
  CriarCobrancaInput,
  DadosCliente,
  EventoPagamento,
  PaymentProvider,
  StatusEvento,
} from "./types";

export interface OpcoesAsaas {
  apiKey: string;
  baseUrl: string;
  webhookToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const STATUS_POR_EVENTO: Record<string, StatusEvento> = {
  PAYMENT_RECEIVED: "paga",
  PAYMENT_CONFIRMED: "paga",
  PAYMENT_OVERDUE: "vencida",
  PAYMENT_DELETED: "cancelada",
  PAYMENT_REFUNDED: "estornada",
};

const TIMEOUT_PADRAO_MS = 15_000;

interface ErroAsaas {
  errors?: { code?: string; description?: string }[];
}

interface PagamentoAsaas {
  id: string;
  deleted?: boolean;
}

interface QrCodeAsaas {
  encodedImage: string;
  payload: string;
  expirationDate?: string;
}

interface CorpoWebhookAsaas {
  id?: unknown;
  event?: unknown;
  payment?: { id?: unknown; externalReference?: unknown };
}

// "2026-06-18 23:59:59" vem sem fuso: é horário de Brasília.
function dataDoAsaas(texto: string): Date {
  return new Date(texto.includes("T") ? texto : `${texto.replace(" ", "T")}-03:00`);
}

function tokensIguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class AsaasProvider implements PaymentProvider {
  readonly nome = "asaas";

  constructor(private readonly opcoes: OpcoesAsaas) {}

  private async requisitar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const fetchImpl = this.opcoes.fetchImpl ?? fetch;

    let resposta: Response;
    try {
      resposta = await fetchImpl(`${this.opcoes.baseUrl}${caminho}`, {
        method: metodo,
        headers: {
          access_token: this.opcoes.apiKey,
          "Content-Type": "application/json",
          "User-Agent": "docobra",
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(this.opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS),
      });
    } catch (erro) {
      throw new FalhaIncertaError("Falha de rede ao falar com o Asaas.", erro);
    }

    if (resposta.status >= 500 || resposta.status === 408 || resposta.status === 429) {
      throw new FalhaIncertaError(`O Asaas respondeu ${resposta.status}.`);
    }

    if (!resposta.ok) {
      const detalhe = (await resposta.json().catch(() => null)) as ErroAsaas | null;
      const primeiro = detalhe?.errors?.[0];
      throw new RecusaDefinitivaError(
        primeiro?.description ?? `O Asaas recusou a requisição (${resposta.status}).`,
        primeiro?.code,
        resposta.status,
      );
    }

    return (await resposta.json()) as T;
  }

  async criarCliente(dados: DadosCliente, referencia: string): Promise<string> {
    const cliente = await this.requisitar<{ id: string }>("POST", "/v3/customers", {
      name: dados.nome,
      cpfCnpj: dados.documento,
      ...(dados.email ? { email: dados.email } : {}),
      externalReference: referencia,
    });
    return cliente.id;
  }

  private async buscarQrCode(pagamentoId: string): Promise<CobrancaCriada> {
    const qr = await this.requisitar<QrCodeAsaas>("GET", `/v3/payments/${pagamentoId}/pixQrCode`);
    return {
      providerChargeId: pagamentoId,
      pix: {
        copiaECola: qr.payload,
        qrCodeBase64: qr.encodedImage,
        expiraEm: qr.expirationDate ? dataDoAsaas(qr.expirationDate) : null,
      },
    };
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CobrancaCriada> {
    const pagamento = await this.requisitar<PagamentoAsaas>("POST", "/v3/payments", {
      customer: input.clienteId,
      billingType: "PIX",
      value: centavosParaReais(input.valorCentavos),
      dueDate: dataIso(input.venceEm),
      externalReference: input.referencia,
      description: input.descricao,
    });
    return this.buscarQrCode(pagamento.id);
  }

  async buscarCobrancaPorReferencia(referencia: string): Promise<CobrancaCriada | null> {
    const lista = await this.requisitar<{ data: PagamentoAsaas[] }>(
      "GET",
      `/v3/payments?externalReference=${encodeURIComponent(referencia)}&limit=10`,
    );
    const existente = lista.data.find((pagamento) => !pagamento.deleted);
    return existente ? this.buscarQrCode(existente.id) : null;
  }

  async cancelarCobranca(providerChargeId: string): Promise<void> {
    try {
      await this.requisitar("DELETE", `/v3/payments/${providerChargeId}`);
    } catch (erro) {
      if (erro instanceof RecusaDefinitivaError && erro.status === 404) return;
      throw erro;
    }
  }

  lerWebhook(headers: Headers, corpoCru: string): EventoPagamento | null {
    if (!tokensIguais(headers.get("asaas-access-token") ?? "", this.opcoes.webhookToken)) {
      throw new WebhookNaoAutenticadoError();
    }

    let corpo: CorpoWebhookAsaas;
    try {
      corpo = JSON.parse(corpoCru) as CorpoWebhookAsaas;
    } catch {
      throw new WebhookInvalidoError("O corpo do webhook não é um JSON válido.");
    }

    const status = typeof corpo.event === "string" ? STATUS_POR_EVENTO[corpo.event] : undefined;
    if (!status) return null;

    if (typeof corpo.id !== "string" || typeof corpo.payment?.id !== "string") {
      throw new WebhookInvalidoError("Evento sem id ou sem pagamento.");
    }

    return {
      eventId: corpo.id,
      tipoOriginal: corpo.event as string,
      status,
      providerChargeId: corpo.payment.id,
      referencia: typeof corpo.payment.externalReference === "string" ? corpo.payment.externalReference : null,
      payload: corpo,
    };
  }
}
```

Em `.env.example`, acrescentar ao final:

```bash

# Pagamentos (Asaas). Por enquanto SOMENTE sandbox: crie a conta sandbox em
# https://sandbox.asaas.com, gere a API key e configure o webhook (veja
# docs/pagamentos-asaas.md). Sem a chave, o app roda normalmente; só o fluxo de
# cobrança fica indisponível.
ASAAS_API_KEY=""
ASAAS_WEBHOOK_TOKEN=""
ASAAS_BASE_URL="https://api-sandbox.asaas.com"
# Ordem dos provedores de pagamento (fallback só em recusa definitiva).
PAGAMENTOS_ORDEM="asaas"
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/core/payments/__tests__/asaas.test.ts`
Expected: PASS (todos os testes do arquivo).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/core/payments/asaas.ts src/core/payments/__tests__/asaas.test.ts .env.example
git commit -m "feat(pagamentos): provider Asaas (cliente, cobranca Pix, QR, consulta, cancelamento e webhook)"
```

---

### Task 4: `PaymentRouter`, `index.ts` e o provedor falso dos testes

**Files:**
- Create: `src/core/payments/router.ts`, `src/core/payments/index.ts`, `src/core/payments/__tests__/helpers/provedor-falso.ts`
- Test: `src/core/payments/__tests__/router.test.ts`, `src/core/payments/__tests__/index.test.ts`

**Interfaces:**
- Consumes: tudo da Task 2 e `AsaasProvider` (Task 3).
- Produces:
  - `class PaymentRouter { constructor(providers: PaymentProvider[]); provider(nome: string): PaymentProvider; criarCobranca(input: Omit<CriarCobrancaInput, "clienteId">, resolverCliente: (provider: PaymentProvider) => Promise<string>): Promise<CobrancaCriada & { provider: string }> }`;
  - `criarPagamentoRouterDoAmbiente(env?: NodeJS.ProcessEnv): PaymentRouter`, `pagamentoRouter(): PaymentRouter` (preguiçoso), `reiniciarPagamentoRouterParaTestes(): void`; reexporta `AsaasProvider` e `PaymentRouter`;
  - helper de teste `criarProvedorFalso(nome: string, sobrescritas?: Partial<PaymentProvider>): PaymentProvider` (métodos `vi.fn`: `criarCliente` → `cliente-<nome>`, `criarCobranca` → `{ providerChargeId: "cobranca-<nome>", pix: { copiaECola: "pix-<nome>", qrCodeBase64: "qr-base64", expiraEm: null } }`, `buscarCobrancaPorReferencia` → `null`, `cancelarCobranca` → `undefined`, `lerWebhook` → `null`).

- [ ] **Step 1: Criar o helper e escrever os testes que falham**

`src/core/payments/__tests__/helpers/provedor-falso.ts`:

```ts
import { vi } from "vitest";

import type { PaymentProvider } from "../../types";

export function criarProvedorFalso(nome: string, sobrescritas: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    nome,
    criarCliente: vi.fn(async () => `cliente-${nome}`),
    criarCobranca: vi.fn(async () => ({
      providerChargeId: `cobranca-${nome}`,
      pix: { copiaECola: `pix-${nome}`, qrCodeBase64: "qr-base64", expiraEm: null },
    })),
    buscarCobrancaPorReferencia: vi.fn(async () => null),
    cancelarCobranca: vi.fn(async () => undefined),
    lerWebhook: vi.fn(() => null),
    ...sobrescritas,
  };
}
```

`src/core/payments/__tests__/router.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { FalhaIncertaError, RecusaDefinitivaError } from "../erros";
import { PaymentRouter } from "../router";
import { criarProvedorFalso } from "./helpers/provedor-falso";

const ENTRADA = {
  referencia: "cobranca-1",
  valorCentavos: 9900,
  venceEm: new Date("2026-06-18T12:00:00Z"),
  descricao: "DocObra — plano Essencial",
};

const resolverCliente = async (provider: { nome: string }) => `cliente-${provider.nome}`;

describe("PaymentRouter", () => {
  it("exige ao menos um provider", () => {
    expect(() => new PaymentRouter([])).toThrow("ao menos um provider");
  });

  it("cria a cobrança no primeiro provider e informa qual foi", async () => {
    const primeiro = criarProvedorFalso("a");
    const segundo = criarProvedorFalso("b");

    const resultado = await new PaymentRouter([primeiro, segundo]).criarCobranca(ENTRADA, resolverCliente);

    expect(resultado).toMatchObject({ provider: "a", providerChargeId: "cobranca-a" });
    expect(primeiro.criarCobranca).toHaveBeenCalledWith({ ...ENTRADA, clienteId: "cliente-a" });
    expect(segundo.criarCobranca).not.toHaveBeenCalled();
  });

  it("passa para o próximo provider quando o primeiro recusa de forma definitiva", async () => {
    const primeiro = criarProvedorFalso("a", {
      criarCobranca: vi.fn(async () => {
        throw new RecusaDefinitivaError("recusou");
      }),
    });
    const segundo = criarProvedorFalso("b");

    const resultado = await new PaymentRouter([primeiro, segundo]).criarCobranca(ENTRADA, resolverCliente);

    expect(resultado.provider).toBe("b");
  });

  it("resolve o cliente de cada provider tentado", async () => {
    const primeiro = criarProvedorFalso("a", {
      criarCobranca: vi.fn(async () => {
        throw new RecusaDefinitivaError("recusou");
      }),
    });
    const segundo = criarProvedorFalso("b");
    const resolver = vi.fn(resolverCliente);

    await new PaymentRouter([primeiro, segundo]).criarCobranca(ENTRADA, resolver);

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(segundo.criarCobranca).toHaveBeenCalledWith({ ...ENTRADA, clienteId: "cliente-b" });
  });

  it("NÃO troca de provider em falha incerta e anota qual provider falhou", async () => {
    const primeiro = criarProvedorFalso("a", {
      criarCobranca: vi.fn(async () => {
        throw new FalhaIncertaError("timeout");
      }),
    });
    const segundo = criarProvedorFalso("b");

    const erro = await new PaymentRouter([primeiro, segundo])
      .criarCobranca(ENTRADA, resolverCliente)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
    expect(erro.provider).toBe("a");
    expect(segundo.criarCobranca).not.toHaveBeenCalled();
  });

  it("falha incerta ao resolver o cliente também não troca de provider", async () => {
    const primeiro = criarProvedorFalso("a");
    const segundo = criarProvedorFalso("b");
    const resolver = async () => {
      throw new FalhaIncertaError("timeout no cliente");
    };

    const erro = await new PaymentRouter([primeiro, segundo]).criarCobranca(ENTRADA, resolver).catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
    expect(erro.provider).toBe("a");
    expect(segundo.criarCobranca).not.toHaveBeenCalled();
  });

  it("se todos recusam, lança a última recusa", async () => {
    const recusa = (nome: string) =>
      criarProvedorFalso(nome, {
        criarCobranca: vi.fn(async () => {
          throw new RecusaDefinitivaError(`recusa de ${nome}`);
        }),
      });

    const erro = await new PaymentRouter([recusa("a"), recusa("b")])
      .criarCobranca(ENTRADA, resolverCliente)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(RecusaDefinitivaError);
    expect(erro.message).toBe("recusa de b");
  });

  it("provider(nome) devolve o provider ou lança para nome desconhecido", () => {
    const router = new PaymentRouter([criarProvedorFalso("a")]);

    expect(router.provider("a").nome).toBe("a");
    expect(() => router.provider("zzz")).toThrow('Provider de pagamento desconhecido: "zzz"');
  });
});
```

`src/core/payments/__tests__/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { AsaasProvider, criarPagamentoRouterDoAmbiente, pagamentoRouter, reiniciarPagamentoRouterParaTestes } from "..";

const ENV_COMPLETO = {
  ASAAS_API_KEY: "chave",
  ASAAS_WEBHOOK_TOKEN: "token",
} as NodeJS.ProcessEnv;

describe("criarPagamentoRouterDoAmbiente", () => {
  it("usa o asaas por padrão", () => {
    const router = criarPagamentoRouterDoAmbiente(ENV_COMPLETO);

    expect(router.provider("asaas")).toBeInstanceOf(AsaasProvider);
  });

  it("respeita PAGAMENTOS_ORDEM (e ignora espaços e vazios)", () => {
    const router = criarPagamentoRouterDoAmbiente({ ...ENV_COMPLETO, PAGAMENTOS_ORDEM: " asaas , " });

    expect(router.provider("asaas").nome).toBe("asaas");
  });

  it("falha com mensagem clara sem a chave do Asaas", () => {
    expect(() => criarPagamentoRouterDoAmbiente({} as NodeJS.ProcessEnv)).toThrow("ASAAS_API_KEY");
    expect(() => criarPagamentoRouterDoAmbiente({ ASAAS_API_KEY: "chave" } as NodeJS.ProcessEnv)).toThrow(
      "ASAAS_WEBHOOK_TOKEN",
    );
  });

  it("falha para provider desconhecido", () => {
    expect(() => criarPagamentoRouterDoAmbiente({ ...ENV_COMPLETO, PAGAMENTOS_ORDEM: "zzz" })).toThrow(
      'Provider de pagamento desconhecido: "zzz"',
    );
  });
});

describe("pagamentoRouter", () => {
  it("monta uma vez e reaproveita; reiniciar recria", () => {
    const original = { chave: process.env.ASAAS_API_KEY, token: process.env.ASAAS_WEBHOOK_TOKEN };
    process.env.ASAAS_API_KEY = "chave";
    process.env.ASAAS_WEBHOOK_TOKEN = "token";
    try {
      reiniciarPagamentoRouterParaTestes();
      const primeiro = pagamentoRouter();

      expect(pagamentoRouter()).toBe(primeiro);

      reiniciarPagamentoRouterParaTestes();
      expect(pagamentoRouter()).not.toBe(primeiro);
    } finally {
      process.env.ASAAS_API_KEY = original.chave;
      process.env.ASAAS_WEBHOOK_TOKEN = original.token;
      if (original.chave === undefined) delete process.env.ASAAS_API_KEY;
      if (original.token === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN;
      reiniciarPagamentoRouterParaTestes();
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/core/payments/__tests__/router.test.ts src/core/payments/__tests__/index.test.ts`
Expected: FAIL (`Failed to resolve import "../router"` / `".."`).

- [ ] **Step 3: Implementar**

`src/core/payments/router.ts`:

```ts
import { FalhaIncertaError, RecusaDefinitivaError } from "./erros";
import type { CobrancaCriada, CriarCobrancaInput, PaymentProvider } from "./types";

export class PaymentRouter {
  constructor(private readonly providers: PaymentProvider[]) {
    if (providers.length === 0) {
      throw new Error("PaymentRouter precisa de ao menos um provider.");
    }
  }

  provider(nome: string): PaymentProvider {
    const encontrado = this.providers.find((candidato) => candidato.nome === nome);
    if (!encontrado) throw new Error(`Provider de pagamento desconhecido: "${nome}".`);
    return encontrado;
  }

  // Só a recusa definitiva autoriza tentar o próximo gateway: em falha incerta a
  // cobrança pode ter sido criada, e criar outra num segundo gateway cobraria duas vezes.
  async criarCobranca(
    input: Omit<CriarCobrancaInput, "clienteId">,
    resolverCliente: (provider: PaymentProvider) => Promise<string>,
  ): Promise<CobrancaCriada & { provider: string }> {
    let ultimaRecusa: RecusaDefinitivaError | null = null;

    for (const provider of this.providers) {
      try {
        const clienteId = await resolverCliente(provider);
        const criada = await provider.criarCobranca({ ...input, clienteId });
        return { ...criada, provider: provider.nome };
      } catch (erro) {
        if (erro instanceof RecusaDefinitivaError) {
          ultimaRecusa = erro;
          continue;
        }
        if (erro instanceof FalhaIncertaError) erro.provider = provider.nome;
        throw erro;
      }
    }

    throw ultimaRecusa as RecusaDefinitivaError;
  }
}
```

`src/core/payments/index.ts`:

```ts
import { AsaasProvider } from "./asaas";
import { PaymentRouter } from "./router";
import type { PaymentProvider } from "./types";

export * from "./types";
export { AsaasProvider, PaymentRouter };

const BASE_URL_SANDBOX_ASAAS = "https://api-sandbox.asaas.com";

function exigir(valor: string | undefined, nome: string): string {
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida.`);
  return valor;
}

function montarProvider(nome: string, env: NodeJS.ProcessEnv): PaymentProvider {
  if (nome === "asaas") {
    return new AsaasProvider({
      apiKey: exigir(env.ASAAS_API_KEY, "ASAAS_API_KEY"),
      baseUrl: env.ASAAS_BASE_URL || BASE_URL_SANDBOX_ASAAS,
      webhookToken: exigir(env.ASAAS_WEBHOOK_TOKEN, "ASAAS_WEBHOOK_TOKEN"),
    });
  }
  throw new Error(`Provider de pagamento desconhecido: "${nome}".`);
}

export function criarPagamentoRouterDoAmbiente(env: NodeJS.ProcessEnv = process.env): PaymentRouter {
  const ordem = (env.PAGAMENTOS_ORDEM || "asaas")
    .split(",")
    .map((nome) => nome.trim())
    .filter(Boolean);
  return new PaymentRouter(ordem.map((nome) => montarProvider(nome, env)));
}

// Preguiçoso de propósito: sem as chaves o app (e os testes) sobem normalmente.
let instancia: PaymentRouter | null = null;

export function pagamentoRouter(): PaymentRouter {
  instancia ??= criarPagamentoRouterDoAmbiente();
  return instancia;
}

export function reiniciarPagamentoRouterParaTestes(): void {
  instancia = null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/core/payments`
Expected: PASS (todos os arquivos de `src/core/payments`).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/core/payments/router.ts src/core/payments/index.ts src/core/payments/__tests__/helpers/provedor-falso.ts src/core/payments/__tests__/router.test.ts src/core/payments/__tests__/index.test.ts
git commit -m "feat(pagamentos): router de pagamento com fallback so em recusa definitiva"
```

---

### Task 5: Queries (executor, plano, cobrança, cliente do gateway)

**Files:**
- Create: `src/db/queries/executor.ts`, `src/db/queries/plano.ts`, `src/db/queries/cobranca.ts`, `src/db/queries/cliente-gateway.ts`
- Test: `src/db/queries/__tests__/plano.test.ts`, `src/db/queries/__tests__/cobranca.test.ts`, `src/db/queries/__tests__/cliente-gateway.test.ts`
- Create (helper de teste, usado também nas Tasks 6 a 11): `src/lib/pagamentos/__tests__/helpers/cenario.ts`

**Interfaces:**
- Consumes: schema da Task 1; `PlanoCobravel` de `@/core/billing/upgrade`; `CobrancaCriada` de `@/core/payments/types`; `criarAssinatura` de `@/db/queries/assinatura`.
- Produces:
  - `ExecutorDb = Pick<typeof db, "select" | "insert" | "update">`;
  - `PlanoDoCatalogo extends PlanoCobravel { id: string; nome: string; ativo: boolean; interno: boolean }`; `buscarPlanoDoCatalogo(chave: string): Promise<PlanoDoCatalogo | null>`; `buscarPlanoDoCatalogoPorId(id: string): Promise<PlanoDoCatalogo | null>`;
  - `Cobranca = typeof cobranca.$inferSelect`; `criarCobrancaPendente(dados: { assinaturaId: string; empresaId: string; tipo: TipoCobranca; planoDestinoId: string; valorCentavos: number; venceEm: Date }): Promise<Cobranca>`; `buscarCobrancaPorId(id: string): Promise<Cobranca | null>`; `buscarCobrancaDaEmpresa(id: string, empresaId: string): Promise<Cobranca | null>`; `buscarCobrancaPendenteReutilizavel(filtro: { assinaturaId: string; tipo: TipoCobranca; planoDestinoId: string; agora: Date }): Promise<Cobranca | null>` (status `pendente` e `venceEm` depois de `agora`, a mais recente); `registrarCobrancaNoGateway(id: string, dados: { provider: string; providerChargeId: string; pix: CobrancaCriada["pix"] }): Promise<Cobranca>`;
  - `buscarProviderClienteId(empresaId: string, provider: string): Promise<string | null>`; `salvarProviderClienteId(empresaId: string, provider: string, providerClienteId: string): Promise<void>` (não sobrescreve);
  - helper de teste: `AGORA`, `criarCenario(opcoes?)` → `{ empresaId, assinaturaId }`, `idDoPlano(chave)`, `inserirCobranca(cenario, opcoes?)`, `limparCenarios()`.

- [ ] **Step 1: Criar o helper de teste e escrever os testes que falham**

`src/lib/pagamentos/__tests__/helpers/cenario.ts`:

```ts
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import {
  assinatura,
  cobranca,
  empresa,
  eventoPagamento,
  plano,
  usuario,
  type StatusAssinatura,
  type StatusCobranca,
  type TipoCobranca,
} from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";

export const AGORA = new Date("2026-06-15T12:00:00Z");

export interface Cenario {
  empresaId: string;
  assinaturaId: string;
}

export async function criarCenario(
  opcoes: {
    planoChave?: string;
    status?: StatusAssinatura;
    documento?: string | null;
    inicio?: Date;
    venceEm?: Date;
    email?: string;
  } = {},
): Promise<Cenario> {
  const [novaEmpresa] = await db
    .insert(empresa)
    .values({
      nome: "Empresa Cobranca",
      documento: opcoes.documento === undefined ? "12345678000199" : opcoes.documento,
    })
    .returning();
  await db.insert(usuario).values({
    nome: "Admin",
    email: opcoes.email ?? "admin@cobranca.com",
    senhaHash: "hash-fake",
    empresaId: novaEmpresa.id,
    papel: "admin",
  });
  await criarAssinatura(db, {
    empresaId: novaEmpresa.id,
    planoChave: opcoes.planoChave ?? "trial",
    status: opcoes.status ?? "trial",
    origem: "suporte",
    inicio: opcoes.inicio ?? AGORA,
    venceEm: opcoes.venceEm,
  });
  const [criada] = await db.select().from(assinatura).where(eq(assinatura.empresaId, novaEmpresa.id));
  return { empresaId: novaEmpresa.id, assinaturaId: criada.id };
}

export async function idDoPlano(chave: string): Promise<string> {
  const [encontrado] = await db.select({ id: plano.id }).from(plano).where(eq(plano.chave, chave));
  return encontrado.id;
}

export async function inserirCobranca(
  cenario: Cenario,
  opcoes: {
    tipo?: TipoCobranca;
    planoChave?: string;
    status?: StatusCobranca;
    valorCentavos?: number;
    provider?: string | null;
    providerChargeId?: string | null;
    venceEm?: Date;
  } = {},
) {
  const [criada] = await db
    .insert(cobranca)
    .values({
      assinaturaId: cenario.assinaturaId,
      empresaId: cenario.empresaId,
      tipo: opcoes.tipo ?? "assinatura",
      planoDestinoId: await idDoPlano(opcoes.planoChave ?? "essencial"),
      valorCentavos: opcoes.valorCentavos ?? 9900,
      status: opcoes.status ?? "pendente",
      venceEm: opcoes.venceEm ?? new Date(AGORA.getTime() + 3 * MS_POR_DIA),
      provider: opcoes.provider === undefined ? "asaas" : opcoes.provider,
      providerChargeId: opcoes.providerChargeId === undefined ? `pay_${randomUUID()}` : opcoes.providerChargeId,
    })
    .returning();
  return criada;
}

export async function limparCenarios() {
  await db.delete(eventoPagamento);
  await db.delete(usuario);
  await db.delete(empresa);
}
```

`src/db/queries/__tests__/plano.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";

import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { buscarPlanoDoCatalogo, buscarPlanoDoCatalogoPorId } from "../plano";

describe("plano do catálogo", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);

  it("busca por chave com os campos de cobrança", async () => {
    const essencial = await buscarPlanoDoCatalogo("essencial");

    expect(essencial).toMatchObject({
      chave: "essencial",
      nome: "Essencial",
      nivel: 1,
      cicloDias: 30,
      precoCentavos: 9900,
      ativo: true,
      interno: false,
    });
  });

  it("marca os planos internos", async () => {
    expect((await buscarPlanoDoCatalogo("trial"))?.interno).toBe(true);
    expect((await buscarPlanoDoCatalogo("suspenso"))?.interno).toBe(true);
  });

  it("busca por id e devolve null quando não existe", async () => {
    const essencial = await buscarPlanoDoCatalogo("essencial");

    expect((await buscarPlanoDoCatalogoPorId(essencial!.id))?.chave).toBe("essencial");
    expect(await buscarPlanoDoCatalogo("nao-existe")).toBeNull();
    expect(await buscarPlanoDoCatalogoPorId("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
```

`src/db/queries/__tests__/cobranca.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import {
  AGORA,
  criarCenario,
  idDoPlano,
  inserirCobranca,
  limparCenarios,
} from "@/lib/pagamentos/__tests__/helpers/cenario";
import {
  buscarCobrancaDaEmpresa,
  buscarCobrancaPendenteReutilizavel,
  buscarCobrancaPorId,
  criarCobrancaPendente,
  registrarCobrancaNoGateway,
} from "../cobranca";

describe("queries de cobrança", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("cria uma cobrança pendente sem dados do gateway", async () => {
    const cenario = await criarCenario();

    const criada = await criarCobrancaPendente({
      assinaturaId: cenario.assinaturaId,
      empresaId: cenario.empresaId,
      tipo: "assinatura",
      planoDestinoId: await idDoPlano("essencial"),
      valorCentavos: 9900,
      venceEm: new Date(AGORA.getTime() + 3 * MS_POR_DIA),
    });

    expect(criada).toMatchObject({ status: "pendente", valorCentavos: 9900, tipo: "assinatura", provider: null });
  });

  it("busca por id e por empresa (outra empresa não enxerga)", async () => {
    const cenario = await criarCenario();
    const outra = await criarCenario({ email: "outra@cobranca.com" });
    const criada = await inserirCobranca(cenario);

    expect((await buscarCobrancaPorId(criada.id))?.id).toBe(criada.id);
    expect((await buscarCobrancaDaEmpresa(criada.id, cenario.empresaId))?.id).toBe(criada.id);
    expect(await buscarCobrancaDaEmpresa(criada.id, outra.empresaId)).toBeNull();
    expect(await buscarCobrancaPorId("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("registra no gateway o provider, o id e o Pix", async () => {
    const cenario = await criarCenario();
    const criada = await inserirCobranca(cenario, { provider: null, providerChargeId: null });
    const expiraEm = new Date("2026-06-18T23:59:59-03:00");

    const atualizada = await registrarCobrancaNoGateway(criada.id, {
      provider: "asaas",
      providerChargeId: "pay_9",
      pix: { copiaECola: "copia-e-cola", qrCodeBase64: "qr", expiraEm },
    });

    expect(atualizada).toMatchObject({
      provider: "asaas",
      providerChargeId: "pay_9",
      pixCopiaECola: "copia-e-cola",
      pixQrCodeBase64: "qr",
    });
    expect(atualizada.pixExpiraEm).toEqual(expiraEm);
  });

  describe("buscarCobrancaPendenteReutilizavel", () => {
    it("devolve a pendente mais recente do mesmo tipo e plano que ainda não venceu", async () => {
      const cenario = await criarCenario();
      await inserirCobranca(cenario);
      const maisRecente = await inserirCobranca(cenario);

      const achada = await buscarCobrancaPendenteReutilizavel({
        assinaturaId: cenario.assinaturaId,
        tipo: "assinatura",
        planoDestinoId: await idDoPlano("essencial"),
        agora: AGORA,
      });

      expect(achada?.id).toBe(maisRecente.id);
    });

    it("ignora outro tipo, outro plano, outro status e cobrança vencida", async () => {
      const cenario = await criarCenario();
      await inserirCobranca(cenario, { tipo: "upgrade" });
      await inserirCobranca(cenario, { planoChave: "escritorio" });
      await inserirCobranca(cenario, { status: "paga" });
      await inserirCobranca(cenario, { venceEm: new Date(AGORA.getTime() - MS_POR_DIA) });

      const achada = await buscarCobrancaPendenteReutilizavel({
        assinaturaId: cenario.assinaturaId,
        tipo: "assinatura",
        planoDestinoId: await idDoPlano("essencial"),
        agora: AGORA,
      });

      expect(achada).toBeNull();
    });
  });
});
```

`src/db/queries/__tests__/cliente-gateway.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { criarCenario, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { buscarProviderClienteId, salvarProviderClienteId } from "../cliente-gateway";

describe("cliente do gateway", () => {
  beforeEach(async () => {
    await semearCatalogoNoBancoDeTeste();
    await limparCenarios();
  });
  afterEach(limparCenarios);

  it("devolve null quando a empresa ainda não tem cliente no provider", async () => {
    const { empresaId } = await criarCenario();

    expect(await buscarProviderClienteId(empresaId, "asaas")).toBeNull();
  });

  it("guarda e devolve o id do cliente, por provider", async () => {
    const { empresaId } = await criarCenario();

    await salvarProviderClienteId(empresaId, "asaas", "cus_1");

    expect(await buscarProviderClienteId(empresaId, "asaas")).toBe("cus_1");
    expect(await buscarProviderClienteId(empresaId, "outro")).toBeNull();
  });

  it("não sobrescreve um cliente já guardado", async () => {
    const { empresaId } = await criarCenario();
    await salvarProviderClienteId(empresaId, "asaas", "cus_1");

    await salvarProviderClienteId(empresaId, "asaas", "cus_2");

    expect(await buscarProviderClienteId(empresaId, "asaas")).toBe("cus_1");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/db/queries/__tests__/plano.test.ts src/db/queries/__tests__/cobranca.test.ts src/db/queries/__tests__/cliente-gateway.test.ts`
Expected: FAIL (módulos `../plano`, `../cobranca`, `../cliente-gateway` não existem).

- [ ] **Step 3: Implementar**

`src/db/queries/executor.ts`:

```ts
import type { db } from "@/db";

export type ExecutorDb = Pick<typeof db, "select" | "insert" | "update">;
```

`src/db/queries/plano.ts`:

```ts
import { eq } from "drizzle-orm";

import type { PlanoCobravel } from "@/core/billing/upgrade";
import { db } from "@/db";
import { plano } from "@/db/schema";

export interface PlanoDoCatalogo extends PlanoCobravel {
  id: string;
  nome: string;
  ativo: boolean;
  interno: boolean;
}

const CAMPOS = {
  id: plano.id,
  chave: plano.chave,
  nome: plano.nome,
  nivel: plano.nivel,
  cicloDias: plano.cicloDias,
  precoCentavos: plano.precoCentavos,
  ativo: plano.ativo,
  interno: plano.interno,
};

export async function buscarPlanoDoCatalogo(chave: string): Promise<PlanoDoCatalogo | null> {
  const [linha] = await db.select(CAMPOS).from(plano).where(eq(plano.chave, chave)).limit(1);
  return linha ?? null;
}

export async function buscarPlanoDoCatalogoPorId(id: string): Promise<PlanoDoCatalogo | null> {
  const [linha] = await db.select(CAMPOS).from(plano).where(eq(plano.id, id)).limit(1);
  return linha ?? null;
}
```

`src/db/queries/cobranca.ts`:

```ts
import { and, desc, eq, gt } from "drizzle-orm";

import type { CobrancaCriada } from "@/core/payments/types";
import { db } from "@/db";
import { cobranca, type TipoCobranca } from "@/db/schema";

export type Cobranca = typeof cobranca.$inferSelect;

export async function criarCobrancaPendente(dados: {
  assinaturaId: string;
  empresaId: string;
  tipo: TipoCobranca;
  planoDestinoId: string;
  valorCentavos: number;
  venceEm: Date;
}): Promise<Cobranca> {
  const [criada] = await db.insert(cobranca).values(dados).returning();
  return criada;
}

export async function buscarCobrancaPorId(id: string): Promise<Cobranca | null> {
  const [linha] = await db.select().from(cobranca).where(eq(cobranca.id, id)).limit(1);
  return linha ?? null;
}

export async function buscarCobrancaDaEmpresa(id: string, empresaId: string): Promise<Cobranca | null> {
  const [linha] = await db
    .select()
    .from(cobranca)
    .where(and(eq(cobranca.id, id), eq(cobranca.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function buscarCobrancaPendenteReutilizavel(filtro: {
  assinaturaId: string;
  tipo: TipoCobranca;
  planoDestinoId: string;
  agora: Date;
}): Promise<Cobranca | null> {
  const [linha] = await db
    .select()
    .from(cobranca)
    .where(
      and(
        eq(cobranca.assinaturaId, filtro.assinaturaId),
        eq(cobranca.tipo, filtro.tipo),
        eq(cobranca.planoDestinoId, filtro.planoDestinoId),
        eq(cobranca.status, "pendente"),
        gt(cobranca.venceEm, filtro.agora),
      ),
    )
    .orderBy(desc(cobranca.createdAt))
    .limit(1);
  return linha ?? null;
}

export async function registrarCobrancaNoGateway(
  id: string,
  dados: { provider: string; providerChargeId: string; pix: CobrancaCriada["pix"] },
): Promise<Cobranca> {
  const [atualizada] = await db
    .update(cobranca)
    .set({
      provider: dados.provider,
      providerChargeId: dados.providerChargeId,
      pixCopiaECola: dados.pix.copiaECola,
      pixQrCodeBase64: dados.pix.qrCodeBase64,
      pixExpiraEm: dados.pix.expiraEm,
      updatedAt: new Date(),
    })
    .where(eq(cobranca.id, id))
    .returning();
  return atualizada;
}
```

`src/db/queries/cliente-gateway.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { clienteGateway } from "@/db/schema";

export async function buscarProviderClienteId(empresaId: string, provider: string): Promise<string | null> {
  const [linha] = await db
    .select({ providerClienteId: clienteGateway.providerClienteId })
    .from(clienteGateway)
    .where(and(eq(clienteGateway.empresaId, empresaId), eq(clienteGateway.provider, provider)))
    .limit(1);
  return linha?.providerClienteId ?? null;
}

export async function salvarProviderClienteId(
  empresaId: string,
  provider: string,
  providerClienteId: string,
): Promise<void> {
  await db.insert(clienteGateway).values({ empresaId, provider, providerClienteId }).onConflictDoNothing();
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/db/queries/__tests__/plano.test.ts src/db/queries/__tests__/cobranca.test.ts src/db/queries/__tests__/cliente-gateway.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries/executor.ts src/db/queries/plano.ts src/db/queries/cobranca.ts src/db/queries/cliente-gateway.ts src/db/queries/__tests__/plano.test.ts src/db/queries/__tests__/cobranca.test.ts src/db/queries/__tests__/cliente-gateway.test.ts src/lib/pagamentos/__tests__/helpers/cenario.ts
git commit -m "feat(pagamentos): queries de plano do catalogo, cobranca e cliente do gateway"
```

---

### Task 6: Efeitos de um pagamento confirmado (`aplicarPagamento`)

**Files:**
- Create: `src/lib/pagamentos/efeitos.ts`
- Test: `src/lib/pagamentos/__tests__/efeitos.test.ts`

**Interfaces:**
- Consumes: `ExecutorDb`, `Cobranca` (Task 5); `proximoVencimento` de `@/core/billing/renovacao`; `MS_POR_DIA`; schema; helper `cenario.ts`.
- Produces: `interface CobrancaParaCancelarNoGateway { provider: string; providerChargeId: string }` e `aplicarPagamento(tx: ExecutorDb, paga: Cobranca, agora: Date): Promise<CobrancaParaCancelarNoGateway[]>`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/pagamentos/__tests__/efeitos.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinatura, assinaturaTrecho, cobranca, plano } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { aplicarPagamento } from "../efeitos";
import { AGORA, criarCenario, inserirCobranca, limparCenarios } from "./helpers/cenario";

const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

async function assinaturaDe(assinaturaId: string) {
  const [linha] = await db.select().from(assinatura).where(eq(assinatura.id, assinaturaId));
  return linha;
}

async function trechosDe(assinaturaId: string) {
  return db
    .select({
      plano: plano.chave,
      inicio: assinaturaTrecho.inicio,
      fim: assinaturaTrecho.fim,
      origem: assinaturaTrecho.origem,
    })
    .from(assinaturaTrecho)
    .innerJoin(plano, eq(plano.id, assinaturaTrecho.planoId))
    .where(eq(assinaturaTrecho.assinaturaId, assinaturaId));
}

async function cobrancaDe(id: string) {
  const [linha] = await db.select().from(cobranca).where(eq(cobranca.id, id));
  return linha;
}

describe("aplicarPagamento", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("assinatura: reinicia o dia 0, ativa e troca o trecho para o plano pago", async () => {
    const cenario = await criarCenario({ inicio: emDias(-10) });
    const paga = await inserirCobranca(cenario, { tipo: "assinatura", planoChave: "essencial" });

    await aplicarPagamento(db, paga, AGORA);

    const depois = await assinaturaDe(cenario.assinaturaId);
    expect(depois.status).toBe("ativa");
    expect(depois.inicio).toEqual(AGORA);
    expect(depois.venceEm).toEqual(emDias(30));
    const trechos = await trechosDe(cenario.assinaturaId);
    expect(trechos).toHaveLength(2);
    expect(trechos.find((t) => t.plano === "trial")?.fim).toEqual(AGORA);
    expect(trechos.find((t) => t.plano === "essencial")).toMatchObject({ fim: null, origem: "autoatendimento" });
    expect((await cobrancaDe(paga.id)).status).toBe("paga");
    expect((await cobrancaDe(paga.id)).pagaEm).toEqual(AGORA);
  });

  it("upgrade: troca o trecho e mantém o dia 0 e o vencimento", async () => {
    const inicio = emDias(-10);
    const venceEm = emDias(20);
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio, venceEm });
    const paga = await inserirCobranca(cenario, { tipo: "upgrade", planoChave: "escritorio" });

    await aplicarPagamento(db, paga, AGORA);

    const depois = await assinaturaDe(cenario.assinaturaId);
    expect(depois.inicio).toEqual(inicio);
    expect(depois.venceEm).toEqual(venceEm);
    expect(depois.status).toBe("ativa");
    const trechos = await trechosDe(cenario.assinaturaId);
    expect(trechos.find((t) => t.plano === "essencial")?.fim).toEqual(AGORA);
    expect(trechos.find((t) => t.plano === "escritorio")).toMatchObject({ fim: null, origem: "autoatendimento" });
  });

  it("renovação: avança o vencimento um ciclo a partir do vencimento antigo (não da data do pagamento)", async () => {
    const venceEm = emDias(-3);
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-33), venceEm });
    const paga = await inserirCobranca(cenario, { tipo: "renovacao", planoChave: "essencial" });

    await aplicarPagamento(db, paga, AGORA);

    const depois = await assinaturaDe(cenario.assinaturaId);
    expect(depois.venceEm).toEqual(new Date(venceEm.getTime() + 30 * MS_POR_DIA));
    expect(depois.status).toBe("ativa");
    expect(depois.inicio).toEqual(emDias(-33));
    expect(await trechosDe(cenario.assinaturaId)).toHaveLength(1);
  });

  it("cancela as outras cobranças pendentes ou vencidas e devolve as que estão no gateway", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(5) });
    const paga = await inserirCobranca(cenario, { tipo: "upgrade", planoChave: "escritorio", providerChargeId: "pay_paga" });
    const pendente = await inserirCobranca(cenario, { tipo: "renovacao", providerChargeId: "pay_pendente" });
    const vencida = await inserirCobranca(cenario, { tipo: "renovacao", status: "vencida", providerChargeId: "pay_vencida" });
    const semGateway = await inserirCobranca(cenario, { provider: null, providerChargeId: null });
    const jaPaga = await inserirCobranca(cenario, { status: "paga", providerChargeId: "pay_antiga" });

    const cancelar = await aplicarPagamento(db, paga, AGORA);

    expect((await cobrancaDe(pendente.id)).status).toBe("cancelada");
    expect((await cobrancaDe(vencida.id)).status).toBe("cancelada");
    expect((await cobrancaDe(semGateway.id)).status).toBe("cancelada");
    expect((await cobrancaDe(jaPaga.id)).status).toBe("paga");
    expect(cancelar).toHaveLength(2);
    expect(cancelar).toEqual(
      expect.arrayContaining([
        { provider: "asaas", providerChargeId: "pay_pendente" },
        { provider: "asaas", providerChargeId: "pay_vencida" },
      ]),
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/pagamentos/__tests__/efeitos.test.ts`
Expected: FAIL (`Failed to resolve import "../efeitos"`).

- [ ] **Step 3: Implementar**

`src/lib/pagamentos/efeitos.ts`:

```ts
import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { proximoVencimento } from "@/core/billing/renovacao";
import type { Cobranca } from "@/db/queries/cobranca";
import type { ExecutorDb } from "@/db/queries/executor";
import { assinatura, assinaturaTrecho, cobranca, plano } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";

export interface CobrancaParaCancelarNoGateway {
  provider: string;
  providerChargeId: string;
}

// Roda dentro da transação do evento. Cancelar no gateway é rede: quem chama faz
// isso depois do commit, com a lista devolvida aqui.
export async function aplicarPagamento(
  tx: ExecutorDb,
  paga: Cobranca,
  agora: Date,
): Promise<CobrancaParaCancelarNoGateway[]> {
  const [destino] = await tx
    .select({ id: plano.id, cicloDias: plano.cicloDias })
    .from(plano)
    .where(eq(plano.id, paga.planoDestinoId));
  const [atual] = await tx.select().from(assinatura).where(eq(assinatura.id, paga.assinaturaId));

  if (paga.tipo === "renovacao") {
    await tx
      .update(assinatura)
      .set({
        status: "ativa",
        venceEm: proximoVencimento(atual.venceEm, destino.cicloDias),
        updatedAt: agora,
      })
      .where(eq(assinatura.id, atual.id));
  } else {
    await tx
      .update(assinaturaTrecho)
      .set({ fim: agora })
      .where(and(eq(assinaturaTrecho.assinaturaId, atual.id), isNull(assinaturaTrecho.fim)));
    await tx
      .insert(assinaturaTrecho)
      .values({ assinaturaId: atual.id, planoId: destino.id, inicio: agora, origem: "autoatendimento" });

    if (paga.tipo === "assinatura") {
      await tx
        .update(assinatura)
        .set({
          inicio: agora,
          status: "ativa",
          venceEm: new Date(agora.getTime() + destino.cicloDias * MS_POR_DIA),
          updatedAt: agora,
        })
        .where(eq(assinatura.id, atual.id));
    }
  }

  await tx
    .update(cobranca)
    .set({ status: "paga", pagaEm: agora, updatedAt: agora })
    .where(eq(cobranca.id, paga.id));

  // Os valores das outras cobranças em aberto foram calculados sobre o estado
  // anterior da assinatura: cancela e deixa o job/o cliente gerar de novo.
  const canceladas = await tx
    .update(cobranca)
    .set({ status: "cancelada", updatedAt: agora })
    .where(
      and(
        eq(cobranca.assinaturaId, atual.id),
        inArray(cobranca.status, ["pendente", "vencida"]),
        ne(cobranca.id, paga.id),
      ),
    )
    .returning({ provider: cobranca.provider, providerChargeId: cobranca.providerChargeId });

  return canceladas.filter(
    (linha): linha is CobrancaParaCancelarNoGateway => linha.provider !== null && linha.providerChargeId !== null,
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/pagamentos/__tests__/efeitos.test.ts`
Expected: PASS (4 testes).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pagamentos/efeitos.ts src/lib/pagamentos/__tests__/efeitos.test.ts
git commit -m "feat(pagamentos): efeitos de um pagamento confirmado (assinar, upgrade e renovacao)"
```

---

### Task 7: `iniciarCobranca`

**Files:**
- Create: `src/lib/pagamentos/iniciar-cobranca.ts`
- Test: `src/lib/pagamentos/__tests__/iniciar-cobranca.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `simularUpgrade` e `MotivoRecusaUpgrade` (`@/core/billing/upgrade`); `pagamentoRouter` (`@/core/payments`), `PaymentRouter`, `PaymentProvider`, `FalhaIncertaError`; queries da Task 5; `buscarAssinaturaVigente` (`@/db/queries/assinatura`); `derivarStatus` (`@/lib/permissoes/status-assinatura`); `MS_POR_DIA`.
- Produces:
  - `VENCIMENTO_DIAS_ASSINATURA_E_UPGRADE = 3`, `VALOR_MINIMO_PADRAO_CENTAVOS = 500`;
  - `valorMinimoDoAmbiente(env?: NodeJS.ProcessEnv): number`;
  - `class DocumentoAusenteError extends Error`; `class CobrancaNaoPermitidaError extends Error { constructor(motivo: string, mensagem: string); readonly motivo: string }`;
  - `iniciarCobranca(input: { empresaId: string; tipo: TipoCobranca; planoDestinoChave?: string; agora?: Date; roteador?: PaymentRouter; valorMinimoCentavos?: number }): Promise<Cobranca>`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/pagamentos/__tests__/iniciar-cobranca.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { PaymentRouter } from "@/core/payments";
import { FalhaIncertaError, RecusaDefinitivaError } from "@/core/payments/erros";
import { criarProvedorFalso } from "@/core/payments/__tests__/helpers/provedor-falso";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { buscarProviderClienteId } from "@/db/queries/cliente-gateway";
import { cobranca } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import {
  CobrancaNaoPermitidaError,
  DocumentoAusenteError,
  iniciarCobranca,
  valorMinimoDoAmbiente,
} from "../iniciar-cobranca";
import { AGORA, criarCenario, limparCenarios } from "./helpers/cenario";

const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

async function todasAsCobrancas() {
  return db.select().from(cobranca);
}

describe("valorMinimoDoAmbiente", () => {
  it("usa o padrão sem variável ou com valor inválido, e a variável quando válida", () => {
    expect(valorMinimoDoAmbiente({} as NodeJS.ProcessEnv)).toBe(500);
    expect(valorMinimoDoAmbiente({ PAGAMENTO_VALOR_MINIMO_CENTAVOS: "abc" } as NodeJS.ProcessEnv)).toBe(500);
    expect(valorMinimoDoAmbiente({ PAGAMENTO_VALOR_MINIMO_CENTAVOS: "-10" } as NodeJS.ProcessEnv)).toBe(500);
    expect(valorMinimoDoAmbiente({ PAGAMENTO_VALOR_MINIMO_CENTAVOS: "1000" } as NodeJS.ProcessEnv)).toBe(1000);
  });
});

describe("iniciarCobranca", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  describe("assinatura", () => {
    it("trial → plano pago: grava a cobrança antes do gateway, cadastra o cliente e guarda o Pix", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas");
      vi.mocked(provedor.criarCobranca).mockImplementation(async () => {
        // Neste ponto a cobrança já tem que existir no banco (é o externalReference).
        expect(await todasAsCobrancas()).toHaveLength(1);
        return { providerChargeId: "pay_1", pix: { copiaECola: "copia", qrCodeBase64: "qr", expiraEm: null } };
      });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([provedor]),
      });

      expect(criada).toMatchObject({
        tipo: "assinatura",
        status: "pendente",
        valorCentavos: 9900,
        provider: "asaas",
        providerChargeId: "pay_1",
        pixCopiaECola: "copia",
        pixQrCodeBase64: "qr",
      });
      expect(criada.venceEm).toEqual(emDias(3));
      expect(provedor.criarCliente).toHaveBeenCalledWith(
        { nome: "Empresa Cobranca", documento: "12345678000199", email: "admin@cobranca.com" },
        cenario.empresaId,
      );
      expect(provedor.criarCobranca).toHaveBeenCalledWith({
        clienteId: "cliente-asaas",
        referencia: criada.id,
        valorCentavos: 9900,
        venceEm: emDias(3),
        descricao: "DocObra — plano Essencial (assinatura)",
      });
      expect(await buscarProviderClienteId(cenario.empresaId, "asaas")).toBe("cliente-asaas");
    });

    it("reaproveita a cobrança pendente igual, sem falar de novo com o gateway", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas");
      const roteador = new PaymentRouter([provedor]);
      const dados = {
        empresaId: cenario.empresaId,
        tipo: "assinatura" as const,
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador,
      };

      const primeira = await iniciarCobranca(dados);
      const segunda = await iniciarCobranca(dados);

      expect(segunda.id).toBe(primeira.id);
      expect(provedor.criarCobranca).toHaveBeenCalledTimes(1);
      expect(await todasAsCobrancas()).toHaveLength(1);
    });

    it("não reaproveita cliente nem cria outro: o cliente do gateway é cadastrado uma vez só", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas");
      const roteador = new PaymentRouter([provedor]);

      await iniciarCobranca({ empresaId: cenario.empresaId, tipo: "assinatura", planoDestinoChave: "essencial", agora: AGORA, roteador });
      await iniciarCobranca({ empresaId: cenario.empresaId, tipo: "assinatura", planoDestinoChave: "escritorio", agora: AGORA, roteador });

      expect(provedor.criarCliente).toHaveBeenCalledTimes(1);
      expect(provedor.criarCobranca).toHaveBeenCalledTimes(2);
    });

    it("sem CPF/CNPJ: lança DocumentoAusenteError e não cria nada", async () => {
      const cenario = await criarCenario({ documento: null });
      const provedor = criarProvedorFalso("asaas");

      await expect(
        iniciarCobranca({
          empresaId: cenario.empresaId,
          tipo: "assinatura",
          planoDestinoChave: "essencial",
          agora: AGORA,
          roteador: new PaymentRouter([provedor]),
        }),
      ).rejects.toBeInstanceOf(DocumentoAusenteError);

      expect(await todasAsCobrancas()).toHaveLength(0);
      expect(provedor.criarCliente).not.toHaveBeenCalled();
    });

    it("não permite assinar com assinatura ativa e vigente", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(10) });

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "escritorio",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);

      expect(erro).toBeInstanceOf(CobrancaNaoPermitidaError);
      expect(erro.motivo).toBe("assinatura_vigente");
    });

    it("permite assinar quando a assinatura está suspensa (vencida além da carência)", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-60), venceEm: emDias(-20) });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      });

      expect(criada.tipo).toBe("assinatura");
    });

    it.each([
      ["inexistente", "nao-existe"],
      ["interno", "trial"],
      ["interno de leitura limitada", "suspenso"],
    ])("recusa plano %s", async (_descricao, chave) => {
      const cenario = await criarCenario();

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: chave,
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);

      expect(erro).toBeInstanceOf(CobrancaNaoPermitidaError);
    });
  });

  describe("upgrade", () => {
    const ativaEssencial = () =>
      criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-10), venceEm: emDias(20) });

    it("cobra a diferença proporcional aos dias restantes (Fase 3) e mantém o vencimento de 3 dias", async () => {
      const cenario = await ativaEssencial();

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "upgrade",
        planoDestinoChave: "escritorio",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      });

      // (24900 − 9900) × 20 dias restantes ÷ 30 = 10000
      expect(criada.valorCentavos).toBe(10000);
      expect(criada.venceEm).toEqual(emDias(3));
    });

    it("aplica o valor mínimo quando a diferença é menor", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-29), venceEm: new Date(AGORA.getTime() + 60 * 60 * 1000) });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "upgrade",
        planoDestinoChave: "escritorio",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
        valorMinimoCentavos: 2000,
      });

      // Último dia: (24900 − 9900) × 1 ÷ 30 = 500, abaixo do mínimo de 2000.
      expect(criada.valorCentavos).toBe(2000);
    });

    it("recusa com o motivo da política (Fase 3) e mensagem em português", async () => {
      const cenario = await criarCenario({ planoChave: "escritorio", status: "ativa", inicio: emDias(-10), venceEm: emDias(20) });

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "upgrade",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);

      expect(erro).toBeInstanceOf(CobrancaNaoPermitidaError);
      expect(erro.motivo).toBe("mesmo_nivel_ou_menor");
      expect(erro.message).toContain("nível maior");
    });

    it("não permite upgrade em trial nem com o ciclo vencido", async () => {
      const trial = await criarCenario();
      const erroTrial = await iniciarCobranca({
        empresaId: trial.empresaId,
        tipo: "upgrade",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);
      expect(erroTrial.motivo).toBe("upgrade_indisponivel");

      const vencida = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-40), venceEm: emDias(-2), email: "venc@cobranca.com" });
      const erroVencida = await iniciarCobranca({
        empresaId: vencida.empresaId,
        tipo: "upgrade",
        planoDestinoChave: "escritorio",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);
      expect(erroVencida.motivo).toBe("upgrade_indisponivel");
    });
  });

  describe("renovação", () => {
    it("cobra o preço cheio do plano atual, vencendo no fim do ciclo", async () => {
      const venceEm = emDias(3);
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-27), venceEm });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "renovacao",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      });

      expect(criada).toMatchObject({ tipo: "renovacao", valorCentavos: 9900 });
      expect(criada.venceEm).toEqual(venceEm);
    });

    it("em carência (ciclo já vencido) vence em 3 dias, não no passado", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-32), venceEm: emDias(-2) });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "renovacao",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      });

      expect(criada.venceEm).toEqual(emDias(3));
    });

    it("não permite renovar trial", async () => {
      const cenario = await criarCenario();

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "renovacao",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);

      expect(erro).toBeInstanceOf(CobrancaNaoPermitidaError);
      expect(erro.motivo).toBe("renovacao_indisponivel");
    });
  });

  describe("falhas do gateway", () => {
    it("falha incerta: consulta por referência e adota a cobrança que já existia no gateway", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas", {
        criarCobranca: vi.fn(async () => {
          throw new FalhaIncertaError("timeout");
        }),
        buscarCobrancaPorReferencia: vi.fn(async () => ({
          providerChargeId: "pay_existente",
          pix: { copiaECola: "copia-existente", qrCodeBase64: "qr-existente", expiraEm: null },
        })),
      });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([provedor]),
      });

      expect(criada).toMatchObject({ provider: "asaas", providerChargeId: "pay_existente", pixCopiaECola: "copia-existente" });
      expect(provedor.buscarCobrancaPorReferencia).toHaveBeenCalledWith(criada.id);
    });

    it("falha incerta sem cobrança no gateway: propaga o erro, mantém a cobrança e a próxima chamada a reaproveita", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas");
      vi.mocked(provedor.criarCobranca).mockRejectedValueOnce(new FalhaIncertaError("timeout"));
      const dados = {
        empresaId: cenario.empresaId,
        tipo: "assinatura" as const,
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([provedor]),
      };

      await expect(iniciarCobranca(dados)).rejects.toBeInstanceOf(FalhaIncertaError);
      const [pendente] = await todasAsCobrancas();
      expect(pendente.providerChargeId).toBeNull();

      const retomada = await iniciarCobranca(dados);

      expect(retomada.id).toBe(pendente.id);
      expect(retomada.providerChargeId).toBe("cobranca-asaas");
      expect(await todasAsCobrancas()).toHaveLength(1);
    });

    it("recusa definitiva no primeiro provider cai para o segundo", async () => {
      const cenario = await criarCenario();
      const primeiro = criarProvedorFalso("a", {
        criarCobranca: vi.fn(async () => {
          throw new RecusaDefinitivaError("recusou");
        }),
      });
      const segundo = criarProvedorFalso("b");

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([primeiro, segundo]),
      });

      expect(criada.provider).toBe("b");
      expect(await buscarProviderClienteId(cenario.empresaId, "b")).toBe("cliente-b");
    });

    it("a cobrança fica gravada mesmo quando o gateway recusa tudo", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas", {
        criarCobranca: vi.fn(async () => {
          throw new RecusaDefinitivaError("recusou");
        }),
      });

      await expect(
        iniciarCobranca({
          empresaId: cenario.empresaId,
          tipo: "assinatura",
          planoDestinoChave: "essencial",
          agora: AGORA,
          roteador: new PaymentRouter([provedor]),
        }),
      ).rejects.toBeInstanceOf(RecusaDefinitivaError);

      const [guardada] = await db.select().from(cobranca).where(eq(cobranca.empresaId, cenario.empresaId));
      expect(guardada.status).toBe("pendente");
      expect(guardada.providerChargeId).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/pagamentos/__tests__/iniciar-cobranca.test.ts`
Expected: FAIL (`Failed to resolve import "../iniciar-cobranca"`).

- [ ] **Step 3: Implementar**

`src/lib/pagamentos/iniciar-cobranca.ts`:

```ts
import { and, asc, eq } from "drizzle-orm";

import { simularUpgrade, type MotivoRecusaUpgrade } from "@/core/billing/upgrade";
import { pagamentoRouter } from "@/core/payments";
import { FalhaIncertaError } from "@/core/payments/erros";
import type { PaymentRouter } from "@/core/payments/router";
import type { PaymentProvider } from "@/core/payments/types";
import { db } from "@/db";
import { buscarAssinaturaVigente, type AssinaturaVigente } from "@/db/queries/assinatura";
import { buscarProviderClienteId, salvarProviderClienteId } from "@/db/queries/cliente-gateway";
import {
  buscarCobrancaPendenteReutilizavel,
  criarCobrancaPendente,
  registrarCobrancaNoGateway,
  type Cobranca,
} from "@/db/queries/cobranca";
import { buscarPlanoDoCatalogo, type PlanoDoCatalogo } from "@/db/queries/plano";
import { empresa, usuario, type TipoCobranca } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { derivarStatus, type StatusEfetivo } from "@/lib/permissoes/status-assinatura";

export const VENCIMENTO_DIAS_ASSINATURA_E_UPGRADE = 3;
export const VALOR_MINIMO_PADRAO_CENTAVOS = 500;

const ROTULO_DO_TIPO: Record<TipoCobranca, string> = {
  assinatura: "assinatura",
  upgrade: "upgrade",
  renovacao: "renovação",
};

const MENSAGEM_DO_MOTIVO: Record<MotivoRecusaUpgrade | "ciclo_vencido", string> = {
  mesmo_plano: "Você já está nesse plano.",
  periodicidade_diferente: "A troca entre plano mensal e anual é feita pelo suporte.",
  mesmo_nivel_ou_menor: "Só é possível trocar para um plano de nível maior; para reduzir, fale com o suporte.",
  preco_nao_maior: "Esse plano não custa mais que o atual; fale com o suporte para a troca.",
  ciclo_vencido: "Seu ciclo venceu: renove antes de trocar de plano.",
};

export class DocumentoAusenteError extends Error {
  constructor() {
    super("Informe o CPF ou CNPJ da empresa antes de gerar a cobrança.");
    this.name = "DocumentoAusenteError";
  }
}

export class CobrancaNaoPermitidaError extends Error {
  constructor(
    public readonly motivo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "CobrancaNaoPermitidaError";
  }
}

export function valorMinimoDoAmbiente(env: NodeJS.ProcessEnv = process.env): number {
  const bruto = Number(env.PAGAMENTO_VALOR_MINIMO_CENTAVOS);
  return Number.isInteger(bruto) && bruto > 0 ? bruto : VALOR_MINIMO_PADRAO_CENTAVOS;
}

const emDias = (base: Date, dias: number) => new Date(base.getTime() + dias * MS_POR_DIA);

interface Contexto {
  vigente: AssinaturaVigente;
  atual: PlanoDoCatalogo;
  statusEfetivo: StatusEfetivo;
  destinoSolicitado: PlanoDoCatalogo | null;
  agora: Date;
  valorMinimoCentavos: number;
}

interface Planejamento {
  destino: PlanoDoCatalogo;
  valorCentavos: number;
  venceEm: Date;
}

function exigirPlanoPublico(destino: PlanoDoCatalogo | null): PlanoDoCatalogo {
  if (!destino) throw new CobrancaNaoPermitidaError("plano_inexistente", "Plano não encontrado.");
  if (!destino.ativo || destino.interno || destino.precoCentavos <= 0) {
    throw new CobrancaNaoPermitidaError("plano_indisponivel", "Esse plano não está disponível para contratação.");
  }
  return destino;
}

function planejar(tipo: TipoCobranca, c: Contexto): Planejamento {
  if (tipo === "renovacao") {
    const renovavel =
      c.vigente.status === "ativa" && (c.statusEfetivo === "ativa" || c.statusEfetivo === "carencia");
    if (!renovavel) {
      throw new CobrancaNaoPermitidaError("renovacao_indisponivel", "Esta assinatura não está em período de renovação.");
    }
    const venceEm =
      c.vigente.venceEm.getTime() > c.agora.getTime()
        ? c.vigente.venceEm
        : emDias(c.agora, VENCIMENTO_DIAS_ASSINATURA_E_UPGRADE);
    return { destino: c.atual, valorCentavos: c.atual.precoCentavos, venceEm };
  }

  const destino = exigirPlanoPublico(c.destinoSolicitado);

  if (tipo === "assinatura") {
    const livre =
      c.vigente.status === "trial" || c.vigente.status === "cancelada" || c.statusEfetivo === "suspensa";
    if (!livre) {
      throw new CobrancaNaoPermitidaError(
        "assinatura_vigente",
        "A empresa já tem uma assinatura vigente: use renovação ou upgrade.",
      );
    }
    return {
      destino,
      valorCentavos: destino.precoCentavos,
      venceEm: emDias(c.agora, VENCIMENTO_DIAS_ASSINATURA_E_UPGRADE),
    };
  }

  if (!(c.vigente.status === "ativa" && c.statusEfetivo === "ativa")) {
    throw new CobrancaNaoPermitidaError(
      "upgrade_indisponivel",
      "O upgrade só está disponível para assinaturas ativas e dentro do ciclo.",
    );
  }
  const simulacao = simularUpgrade({ atual: c.atual, destino, venceEm: c.vigente.venceEm, agora: c.agora });
  if (!simulacao.ok) {
    throw new CobrancaNaoPermitidaError(simulacao.motivo, MENSAGEM_DO_MOTIVO[simulacao.motivo]);
  }
  return {
    destino,
    valorCentavos: Math.max(simulacao.valorCentavos, c.valorMinimoCentavos),
    venceEm: emDias(c.agora, VENCIMENTO_DIAS_ASSINATURA_E_UPGRADE),
  };
}

export interface IniciarCobrancaInput {
  empresaId: string;
  tipo: TipoCobranca;
  planoDestinoChave?: string;
  agora?: Date;
  roteador?: PaymentRouter;
  valorMinimoCentavos?: number;
}

export async function iniciarCobranca(input: IniciarCobrancaInput): Promise<Cobranca> {
  const {
    empresaId,
    tipo,
    planoDestinoChave,
    agora = new Date(),
    roteador = pagamentoRouter(),
    valorMinimoCentavos = valorMinimoDoAmbiente(),
  } = input;

  const [empresaEncontrada] = await db
    .select({ nome: empresa.nome, documento: empresa.documento })
    .from(empresa)
    .where(eq(empresa.id, empresaId))
    .limit(1);
  if (!empresaEncontrada) throw new Error("Empresa não encontrada.");

  const vigente = await buscarAssinaturaVigente(empresaId);
  if (!vigente) throw new CobrancaNaoPermitidaError("sem_assinatura", "A empresa não tem assinatura.");
  const atual = (await buscarPlanoDoCatalogo(vigente.planoChave)) as PlanoDoCatalogo;

  const planejamento = planejar(tipo, {
    vigente,
    atual,
    statusEfetivo: derivarStatus(vigente, agora),
    destinoSolicitado: planoDestinoChave ? await buscarPlanoDoCatalogo(planoDestinoChave) : null,
    agora,
    valorMinimoCentavos,
  });

  let pendente = await buscarCobrancaPendenteReutilizavel({
    assinaturaId: vigente.id,
    tipo,
    planoDestinoId: planejamento.destino.id,
    agora,
  });

  if (!pendente) {
    if (!empresaEncontrada.documento) throw new DocumentoAusenteError();
    pendente = await criarCobrancaPendente({
      assinaturaId: vigente.id,
      empresaId,
      tipo,
      planoDestinoId: planejamento.destino.id,
      valorCentavos: planejamento.valorCentavos,
      venceEm: planejamento.venceEm,
    });
  }

  if (pendente.providerChargeId) return pendente;
  if (!empresaEncontrada.documento) throw new DocumentoAusenteError();

  const documento = empresaEncontrada.documento;
  const [admin] = await db
    .select({ email: usuario.email })
    .from(usuario)
    .where(and(eq(usuario.empresaId, empresaId), eq(usuario.papel, "admin")))
    .orderBy(asc(usuario.createdAt))
    .limit(1);

  const resolverCliente = async (provider: PaymentProvider): Promise<string> => {
    const existente = await buscarProviderClienteId(empresaId, provider.nome);
    if (existente) return existente;
    const criadoId = await provider.criarCliente(
      { nome: empresaEncontrada.nome, documento, email: admin?.email ?? null },
      empresaId,
    );
    await salvarProviderClienteId(empresaId, provider.nome, criadoId);
    return (await buscarProviderClienteId(empresaId, provider.nome)) ?? criadoId;
  };

  try {
    const criada = await roteador.criarCobranca(
      {
        referencia: pendente.id,
        valorCentavos: pendente.valorCentavos,
        venceEm: pendente.venceEm,
        descricao: `DocObra — plano ${planejamento.destino.nome} (${ROTULO_DO_TIPO[tipo]})`,
      },
      resolverCliente,
    );
    return await registrarCobrancaNoGateway(pendente.id, {
      provider: criada.provider,
      providerChargeId: criada.providerChargeId,
      pix: criada.pix,
    });
  } catch (erro) {
    // Pode ter sido criada no gateway apesar do erro: antes de desistir, adota a que existir.
    if (erro instanceof FalhaIncertaError && erro.provider) {
      const encontrada = await roteador.provider(erro.provider).buscarCobrancaPorReferencia(pendente.id);
      if (encontrada) {
        return registrarCobrancaNoGateway(pendente.id, { provider: erro.provider, ...encontrada });
      }
    }
    throw erro;
  }
}
```

Em `.env.example`, acrescentar ao final:

```bash

# Menor valor que uma cobrança pode ter, em centavos. Um upgrade cuja diferença
# proporcional dê menos que isso cobra este mínimo. Valide o valor no sandbox.
PAGAMENTO_VALOR_MINIMO_CENTAVOS="500"
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/pagamentos/__tests__/iniciar-cobranca.test.ts`
Expected: PASS (todos os testes do arquivo).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pagamentos/iniciar-cobranca.ts src/lib/pagamentos/__tests__/iniciar-cobranca.test.ts .env.example
git commit -m "feat(pagamentos): iniciar cobranca (assinatura, upgrade e renovacao) com adocao apos timeout"
```

---

### Task 8: `processarEventoPagamento`

**Files:**
- Create: `src/lib/pagamentos/processar-evento.ts`
- Test: `src/lib/pagamentos/__tests__/processar-evento.test.ts`

**Interfaces:**
- Consumes: `aplicarPagamento` (Task 6), `EventoPagamento` (Task 2), `PaymentRouter`/`pagamentoRouter`, schema, helper `cenario.ts`.
- Produces: `type ResultadoEvento = "processado" | "ignorado" | "duplicado" | "sem_cobranca" | "pagamento_sem_efeito"` e `processarEventoPagamento(providerNome: string, evento: EventoPagamento, opcoes?: { agora?: Date; roteador?: PaymentRouter }): Promise<ResultadoEvento>`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/pagamentos/__tests__/processar-evento.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { PaymentRouter } from "@/core/payments";
import { criarProvedorFalso } from "@/core/payments/__tests__/helpers/provedor-falso";
import type { EventoPagamento, StatusEvento } from "@/core/payments/types";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinatura, cobranca, eventoPagamento } from "@/db/schema";
import { processarEventoPagamento } from "../processar-evento";
import { AGORA, criarCenario, inserirCobranca, limparCenarios } from "./helpers/cenario";

function evento(
  cobrancaRow: { id: string; providerChargeId: string | null },
  status: StatusEvento,
  sobrescritas: Partial<EventoPagamento> = {},
): EventoPagamento {
  return {
    eventId: `evt_${status}_${cobrancaRow.id}`,
    tipoOriginal: "PAYMENT_RECEIVED",
    status,
    providerChargeId: cobrancaRow.providerChargeId as string,
    referencia: cobrancaRow.id,
    payload: { id: "evt" },
    ...sobrescritas,
  };
}

async function cobrancaDe(id: string) {
  const [linha] = await db.select().from(cobranca).where(eq(cobranca.id, id));
  return linha;
}

async function assinaturaDe(id: string) {
  const [linha] = await db.select().from(assinatura).where(eq(assinatura.id, id));
  return linha;
}

describe("processarEventoPagamento", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("paga: aplica os efeitos, marca a cobrança e registra o evento com o resultado", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario);

    const resultado = await processarEventoPagamento("asaas", evento(pendente, "paga"), { agora: AGORA });

    expect(resultado).toBe("processado");
    expect((await cobrancaDe(pendente.id)).status).toBe("paga");
    expect((await assinaturaDe(cenario.assinaturaId)).status).toBe("ativa");
    const [registrado] = await db.select().from(eventoPagamento);
    expect(registrado).toMatchObject({
      provider: "asaas",
      eventId: `evt_paga_${pendente.id}`,
      cobrancaId: pendente.id,
      resultado: "processado",
    });
  });

  it("evento repetido (mesmo id) vira duplicado e não aplica nada de novo", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario);
    const dados = evento(pendente, "paga");
    await processarEventoPagamento("asaas", dados, { agora: AGORA });
    const depoisDoPrimeiro = await assinaturaDe(cenario.assinaturaId);

    const segundo = await processarEventoPagamento("asaas", dados, { agora: new Date(AGORA.getTime() + 86_400_000) });

    expect(segundo).toBe("duplicado");
    expect(await assinaturaDe(cenario.assinaturaId)).toEqual(depoisDoPrimeiro);
    expect(await db.select().from(eventoPagamento)).toHaveLength(1);
  });

  it("outro evento de pagamento da mesma cobrança já paga é ignorado (ex.: CONFIRMED depois de RECEIVED)", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario);
    await processarEventoPagamento("asaas", evento(pendente, "paga"), { agora: AGORA });

    const resultado = await processarEventoPagamento("asaas", evento(pendente, "paga", { eventId: "evt_outro" }), {
      agora: AGORA,
    });

    expect(resultado).toBe("ignorado");
  });

  it("paga cobrança que já tinha vencido: aplica", async () => {
    const cenario = await criarCenario();
    const vencida = await inserirCobranca(cenario, { status: "vencida" });

    const resultado = await processarEventoPagamento("asaas", evento(vencida, "paga"), { agora: AGORA });

    expect(resultado).toBe("processado");
    expect((await cobrancaDe(vencida.id)).status).toBe("paga");
  });

  it("pagamento de outra cobrança do mesmo pedido (charge id diferente) não tem efeito", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario, { providerChargeId: "pay_registrada" });

    const resultado = await processarEventoPagamento(
      "asaas",
      evento(pendente, "paga", { providerChargeId: "pay_duplicada" }),
      { agora: AGORA },
    );

    expect(resultado).toBe("pagamento_sem_efeito");
    expect((await cobrancaDe(pendente.id)).status).toBe("pendente");
    expect((await assinaturaDe(cenario.assinaturaId)).status).toBe("trial");
    const [registrado] = await db.select().from(eventoPagamento);
    expect(registrado.resultado).toBe("pagamento_sem_efeito");
  });

  it("pagamento de cobrança já cancelada não tem efeito (dinheiro entrou, o suporte resolve)", async () => {
    const cenario = await criarCenario();
    const cancelada = await inserirCobranca(cenario, { status: "cancelada" });

    const resultado = await processarEventoPagamento("asaas", evento(cancelada, "paga"), { agora: AGORA });

    expect(resultado).toBe("pagamento_sem_efeito");
    expect((await cobrancaDe(cancelada.id)).status).toBe("cancelada");
    expect((await assinaturaDe(cenario.assinaturaId)).status).toBe("trial");
  });

  it("vencida: marca só a pendente; cancelada: marca pendente ou vencida", async () => {
    const cenario = await criarCenario();
    const aVencer = await inserirCobranca(cenario);
    const aCancelar = await inserirCobranca(cenario, { status: "vencida" });
    const jaPaga = await inserirCobranca(cenario, { status: "paga" });

    expect(await processarEventoPagamento("asaas", evento(aVencer, "vencida"), { agora: AGORA })).toBe("processado");
    expect(await processarEventoPagamento("asaas", evento(aCancelar, "cancelada"), { agora: AGORA })).toBe("processado");
    expect(await processarEventoPagamento("asaas", evento(jaPaga, "vencida"), { agora: AGORA })).toBe("ignorado");
    expect(await processarEventoPagamento("asaas", evento(jaPaga, "cancelada"), { agora: AGORA })).toBe("ignorado");

    expect((await cobrancaDe(aVencer.id)).status).toBe("vencida");
    expect((await cobrancaDe(aCancelar.id)).status).toBe("cancelada");
    expect((await cobrancaDe(jaPaga.id)).status).toBe("paga");
  });

  it("estornada: marca a cobrança paga como estornada sem desfazer a assinatura", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario);
    await processarEventoPagamento("asaas", evento(pendente, "paga"), { agora: AGORA });

    const resultado = await processarEventoPagamento("asaas", evento(pendente, "estornada"), { agora: AGORA });

    expect(resultado).toBe("processado");
    expect((await cobrancaDe(pendente.id)).status).toBe("estornada");
    expect((await assinaturaDe(cenario.assinaturaId)).status).toBe("ativa");
  });

  it("sem cobrança correspondente: registra o evento como sem_cobranca", async () => {
    const resultado = await processarEventoPagamento(
      "asaas",
      {
        eventId: "evt_orfao",
        tipoOriginal: "PAYMENT_RECEIVED",
        status: "paga",
        providerChargeId: "pay_que_nao_conhecemos",
        referencia: "00000000-0000-0000-0000-000000000000",
        payload: {},
      },
      { agora: AGORA },
    );

    expect(resultado).toBe("sem_cobranca");
    const [registrado] = await db.select().from(eventoPagamento);
    expect(registrado).toMatchObject({ eventId: "evt_orfao", cobrancaId: null, resultado: "sem_cobranca" });
  });

  it("sem referência válida, acha a cobrança pelo id do gateway", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario, { providerChargeId: "pay_achada" });

    const resultado = await processarEventoPagamento(
      "asaas",
      evento(pendente, "paga", { referencia: null, providerChargeId: "pay_achada" }),
      { agora: AGORA },
    );

    expect(resultado).toBe("processado");
  });

  it("depois do commit, cancela no gateway as outras cobranças em aberto (falha de rede não derruba)", async () => {
    const cenario = await criarCenario();
    const paga = await inserirCobranca(cenario, { providerChargeId: "pay_paga" });
    await inserirCobranca(cenario, { tipo: "renovacao", providerChargeId: "pay_outra" });
    const provedor = criarProvedorFalso("asaas", {
      cancelarCobranca: vi.fn(async () => {
        throw new Error("rede caiu");
      }),
    });
    const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultado = await processarEventoPagamento("asaas", evento(paga, "paga"), {
      agora: AGORA,
      roteador: new PaymentRouter([provedor]),
    });

    expect(resultado).toBe("processado");
    expect(provedor.cancelarCobranca).toHaveBeenCalledWith("pay_outra");
    expect(erroNoConsole).toHaveBeenCalled();
    erroNoConsole.mockRestore();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/pagamentos/__tests__/processar-evento.test.ts`
Expected: FAIL (`Failed to resolve import "../processar-evento"`).

- [ ] **Step 3: Implementar**

`src/lib/pagamentos/processar-evento.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { pagamentoRouter } from "@/core/payments";
import type { PaymentRouter } from "@/core/payments/router";
import type { EventoPagamento } from "@/core/payments/types";
import { db } from "@/db";
import type { Cobranca } from "@/db/queries/cobranca";
import type { ExecutorDb } from "@/db/queries/executor";
import { cobranca, eventoPagamento } from "@/db/schema";
import { aplicarPagamento, type CobrancaParaCancelarNoGateway } from "./efeitos";

export type ResultadoEvento = "processado" | "ignorado" | "duplicado" | "sem_cobranca" | "pagamento_sem_efeito";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function acharCobranca(tx: ExecutorDb, provider: string, evento: EventoPagamento): Promise<Cobranca | null> {
  if (evento.referencia && UUID.test(evento.referencia)) {
    const [porReferencia] = await tx.select().from(cobranca).where(eq(cobranca.id, evento.referencia)).limit(1);
    if (porReferencia) return porReferencia;
  }
  const [porGateway] = await tx
    .select()
    .from(cobranca)
    .where(and(eq(cobranca.provider, provider), eq(cobranca.providerChargeId, evento.providerChargeId)))
    .limit(1);
  return porGateway ?? null;
}

export async function processarEventoPagamento(
  providerNome: string,
  evento: EventoPagamento,
  { agora = new Date(), roteador }: { agora?: Date; roteador?: PaymentRouter } = {},
): Promise<ResultadoEvento> {
  // Evento e efeitos na MESMA transação: se algo falhar, o registro do evento volta
  // junto e o reenvio do gateway reprocessa (senão ele cairia como "duplicado").
  const { resultado, paraCancelar } = await db.transaction(async (tx) => {
    const [registrado] = await tx
      .insert(eventoPagamento)
      .values({
        provider: providerNome,
        eventId: evento.eventId,
        tipoOriginal: evento.tipoOriginal,
        providerChargeId: evento.providerChargeId,
        payload: evento.payload,
      })
      .onConflictDoNothing({ target: [eventoPagamento.provider, eventoPagamento.eventId] })
      .returning({ id: eventoPagamento.id });

    if (!registrado) {
      return { resultado: "duplicado" as ResultadoEvento, paraCancelar: [] as CobrancaParaCancelarNoGateway[] };
    }

    const encontrada = await acharCobranca(tx, providerNome, evento);
    let resultadoDoEvento: ResultadoEvento = "ignorado";
    let cancelar: CobrancaParaCancelarNoGateway[] = [];

    if (!encontrada) {
      resultadoDoEvento = "sem_cobranca";
    } else if (evento.status === "paga") {
      const outraCobranca = encontrada.providerChargeId !== evento.providerChargeId;
      const semEfeito = encontrada.status === "cancelada" || encontrada.status === "estornada";
      if (outraCobranca || semEfeito) {
        resultadoDoEvento = "pagamento_sem_efeito";
      } else if (encontrada.status === "pendente" || encontrada.status === "vencida") {
        cancelar = await aplicarPagamento(tx, encontrada, agora);
        resultadoDoEvento = "processado";
      }
    } else if (evento.status === "vencida") {
      if (encontrada.status === "pendente") {
        await tx.update(cobranca).set({ status: "vencida", updatedAt: agora }).where(eq(cobranca.id, encontrada.id));
        resultadoDoEvento = "processado";
      }
    } else if (evento.status === "cancelada") {
      if (encontrada.status === "pendente" || encontrada.status === "vencida") {
        await tx.update(cobranca).set({ status: "cancelada", updatedAt: agora }).where(eq(cobranca.id, encontrada.id));
        resultadoDoEvento = "processado";
      }
    } else if (evento.status === "estornada") {
      if (encontrada.status === "paga") {
        await tx.update(cobranca).set({ status: "estornada", updatedAt: agora }).where(eq(cobranca.id, encontrada.id));
        resultadoDoEvento = "processado";
      }
    }

    await tx
      .update(eventoPagamento)
      .set({ cobrancaId: encontrada?.id ?? null, resultado: resultadoDoEvento })
      .where(eq(eventoPagamento.id, registrado.id));

    return { resultado: resultadoDoEvento, paraCancelar: cancelar };
  });

  for (const alvo of paraCancelar) {
    try {
      await (roteador ?? pagamentoRouter()).provider(alvo.provider).cancelarCobranca(alvo.providerChargeId);
    } catch (erro) {
      console.error("[pagamentos] não foi possível cancelar a cobrança no gateway", alvo, erro);
    }
  }

  return resultado;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/pagamentos/__tests__/processar-evento.test.ts`
Expected: PASS (todos os testes do arquivo).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pagamentos/processar-evento.ts src/lib/pagamentos/__tests__/processar-evento.test.ts
git commit -m "feat(pagamentos): processar evento de pagamento numa transacao unica e idempotente"
```

---

### Task 9: Rota do webhook

**Files:**
- Create: `src/app/api/webhooks/pagamentos/[provider]/route.ts`
- Test: `src/app/api/webhooks/pagamentos/[provider]/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `pagamentoRouter`, `reiniciarPagamentoRouterParaTestes`, `WebhookNaoAutenticadoError`, `WebhookInvalidoError` (`@/core/payments/erros`), `processarEventoPagamento` (Task 8), helper `cenario.ts`.
- Produces: `POST /api/webhooks/pagamentos/[provider]` com `POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> })`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/api/webhooks/pagamentos/[provider]/__tests__/route.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { reiniciarPagamentoRouterParaTestes } from "@/core/payments";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinatura, cobranca, eventoPagamento } from "@/db/schema";
import { criarCenario, inserirCobranca, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { POST } from "@/app/api/webhooks/pagamentos/[provider]/route";

const TOKEN = "token-do-webhook-de-teste";

function requisicao(corpo: unknown, token: string | null = TOKEN) {
  return new NextRequest("http://localhost/api/webhooks/pagamentos/asaas", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "asaas-access-token": token } : {}) },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

const chamar = (request: NextRequest, provider = "asaas") => POST(request, { params: Promise.resolve({ provider }) });

function eventoAsaas(evento: string, pagamento: { id: string; externalReference?: string }, id = "evt_1") {
  return { id, event: evento, payment: pagamento };
}

describe("POST /api/webhooks/pagamentos/[provider]", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(async () => {
    vi.stubEnv("ASAAS_API_KEY", "chave-de-teste");
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN);
    reiniciarPagamentoRouterParaTestes();
    await limparCenarios();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    reiniciarPagamentoRouterParaTestes();
    await limparCenarios();
  });

  it("provider desconhecido: 404", async () => {
    const resposta = await chamar(requisicao({}), "zzz");

    expect(resposta.status).toBe(404);
  });

  it("token errado ou ausente: 401, sem processar", async () => {
    const corpo = eventoAsaas("PAYMENT_RECEIVED", { id: "pay_1" });

    expect((await chamar(requisicao(corpo, "outro"))).status).toBe(401);
    expect((await chamar(requisicao(corpo, null))).status).toBe(401);
    expect(await db.select().from(eventoPagamento)).toHaveLength(0);
  });

  it("corpo que não é JSON (com token certo): 400", async () => {
    const resposta = await chamar(requisicao("não é json"));

    expect(resposta.status).toBe(400);
  });

  it("evento sem ação: 200 e nada é gravado", async () => {
    const resposta = await chamar(requisicao(eventoAsaas("PAYMENT_CREATED", { id: "pay_1" })));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ignorado: true });
    expect(await db.select().from(eventoPagamento)).toHaveLength(0);
  });

  it("pagamento recebido: 200, aplica os efeitos e registra o evento", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario, { providerChargeId: "pay_1" });

    const resposta = await chamar(
      requisicao(eventoAsaas("PAYMENT_RECEIVED", { id: "pay_1", externalReference: pendente.id })),
    );

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ resultado: "processado" });
    const [depois] = await db.select().from(cobranca).where(eq(cobranca.id, pendente.id));
    expect(depois.status).toBe("paga");
    const [assinaturaDepois] = await db.select().from(assinatura).where(eq(assinatura.id, cenario.assinaturaId));
    expect(assinaturaDepois.status).toBe("ativa");
  });

  it("reenvio do mesmo evento: 200 como duplicado, sem aplicar de novo", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario, { providerChargeId: "pay_1" });
    const corpo = eventoAsaas("PAYMENT_RECEIVED", { id: "pay_1", externalReference: pendente.id });
    await chamar(requisicao(corpo));

    const segunda = await chamar(requisicao(corpo));

    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toEqual({ resultado: "duplicado" });
    expect(await db.select().from(eventoPagamento)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run "src/app/api/webhooks/pagamentos"`
Expected: FAIL (`Failed to resolve import "@/app/api/webhooks/pagamentos/[provider]/route"`).

- [ ] **Step 3: Implementar**

`src/app/api/webhooks/pagamentos/[provider]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { pagamentoRouter } from "@/core/payments";
import { WebhookInvalidoError, WebhookNaoAutenticadoError } from "@/core/payments/erros";
import { processarEventoPagamento } from "@/lib/pagamentos/processar-evento";

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: nomeDoProvider } = await params;

  let provider;
  try {
    provider = pagamentoRouter().provider(nomeDoProvider);
  } catch {
    return NextResponse.json({ error: "Provider desconhecido." }, { status: 404 });
  }

  const corpoCru = await request.text();

  let evento;
  try {
    evento = provider.lerWebhook(request.headers, corpoCru);
  } catch (erro) {
    if (erro instanceof WebhookNaoAutenticadoError) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    if (erro instanceof WebhookInvalidoError) {
      return NextResponse.json({ error: erro.message }, { status: 400 });
    }
    throw erro;
  }

  if (!evento) return NextResponse.json({ ignorado: true });

  try {
    const resultado = await processarEventoPagamento(provider.nome, evento);
    return NextResponse.json({ resultado });
  } catch (error) {
    console.error("[POST /api/webhooks/pagamentos]", error);
    // 5xx para o gateway reenviar: o evento só fica gravado se o processamento der certo.
    return NextResponse.json({ error: "Erro ao processar o evento." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run "src/app/api/webhooks/pagamentos"`
Expected: PASS (6 testes).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/webhooks/pagamentos"
git commit -m "feat(pagamentos): rota de webhook de pagamentos"
```

---

### Task 10: Rotas de cobrança e de documento da empresa

**Files:**
- Create: `src/lib/validations/cobranca/create.schema.ts`, `src/lib/validations/cobranca/response.schema.ts`, `src/lib/validations/empresa/documento.schema.ts`, `src/lib/pagamentos/serializar-cobranca.ts`
- Create: `src/app/api/cobrancas/route.ts`, `src/app/api/cobrancas/[id]/route.ts`, `src/app/api/empresa/documento/route.ts`
- Test: `src/lib/pagamentos/__tests__/serializar-cobranca.test.ts`, `src/app/api/cobrancas/__tests__/route.test.ts`, `src/app/api/cobrancas/[id]/__tests__/route.test.ts`, `src/app/api/empresa/documento/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `iniciarCobranca`, `DocumentoAusenteError`, `CobrancaNaoPermitidaError` (Task 7); `buscarCobrancaDaEmpresa` (Task 5); `FalhaIncertaError`, `RecusaDefinitivaError`; padrão de autenticação das rotas existentes (`verificarToken`, `SESSION_COOKIE_NAME`).
- Produces:
  - `criarCobrancaSchema` (`z.discriminatedUnion("tipo", [...])`): `{ tipo: "assinatura", planoChave: string } | { tipo: "upgrade", planoChave: string } | { tipo: "renovacao" }`; tipo `CriarCobrancaInput`;
  - `cobrancaResponseSchema` / `type CobrancaResponse = { id: string; tipo: TipoCobranca; status: StatusCobranca; valorCentavos: number; venceEm: string; pix: { copiaECola: string; qrCodeBase64: string; expiraEm: string | null } | null }`;
  - `serializarCobranca(c: Cobranca): CobrancaResponse`;
  - `atualizarDocumentoSchema`: `{ documento: string }` → só dígitos, 11 ou 14;
  - `POST /api/cobrancas` (201 `{ cobranca }`; 400 dados inválidos; 401; 409 `COBRANCA_NAO_PERMITIDA` com `motivo`; 422 `DOCUMENTO_AUSENTE`; 502 gateway), `GET /api/cobrancas/[id]` (200 `{ cobranca }`; 401; 404), `PUT /api/empresa/documento` (200 `{ documento }`; 400; 401).

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/pagamentos/__tests__/serializar-cobranca.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Cobranca } from "@/db/queries/cobranca";
import { serializarCobranca } from "../serializar-cobranca";

function cobranca(sobrescritas: Partial<Cobranca> = {}): Cobranca {
  return {
    id: "c1",
    assinaturaId: "a1",
    empresaId: "e1",
    tipo: "assinatura",
    planoDestinoId: "p1",
    valorCentavos: 9900,
    status: "pendente",
    venceEm: new Date("2026-06-18T12:00:00Z"),
    provider: "asaas",
    providerChargeId: "pay_1",
    pixCopiaECola: "copia",
    pixQrCodeBase64: "qr",
    pixExpiraEm: new Date("2026-06-19T02:59:59Z"),
    pagaEm: null,
    createdAt: new Date("2026-06-15T12:00:00Z"),
    updatedAt: new Date("2026-06-15T12:00:00Z"),
    ...sobrescritas,
  };
}

describe("serializarCobranca", () => {
  it("expõe só o que a tela precisa, com datas em ISO", () => {
    expect(serializarCobranca(cobranca())).toEqual({
      id: "c1",
      tipo: "assinatura",
      status: "pendente",
      valorCentavos: 9900,
      venceEm: "2026-06-18T12:00:00.000Z",
      pix: { copiaECola: "copia", qrCodeBase64: "qr", expiraEm: "2026-06-19T02:59:59.000Z" },
    });
  });

  it("pix é null enquanto o gateway ainda não devolveu o QR", () => {
    expect(serializarCobranca(cobranca({ pixCopiaECola: null, pixQrCodeBase64: null })).pix).toBeNull();
  });

  it("expiraEm nulo quando o gateway não informa", () => {
    expect(serializarCobranca(cobranca({ pixExpiraEm: null })).pix?.expiraEm).toBeNull();
  });
});
```

`src/app/api/cobrancas/__tests__/route.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { FalhaIncertaError, RecusaDefinitivaError } from "@/core/payments/erros";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { usuario } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { assinarToken } from "@/lib/auth/jwt";
import { AGORA, criarCenario, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";

vi.mock("@/lib/pagamentos/iniciar-cobranca", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/pagamentos/iniciar-cobranca")>()),
  iniciarCobranca: vi.fn(),
}));

import {
  CobrancaNaoPermitidaError,
  DocumentoAusenteError,
  iniciarCobranca,
} from "@/lib/pagamentos/iniciar-cobranca";
import { POST } from "@/app/api/cobrancas/route";

async function sessao() {
  const cenario = await criarCenario();
  const [admin] = await db.select().from(usuario);
  const token = await assinarToken({ userId: admin.id, empresaId: cenario.empresaId, papel: admin.papel });
  return { cenario, token };
}

function requisicao(corpo: unknown, token?: string) {
  return new NextRequest("http://localhost/api/cobrancas", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
}

const COBRANCA = {
  id: "c1",
  assinaturaId: "a1",
  empresaId: "e1",
  tipo: "assinatura" as const,
  planoDestinoId: "p1",
  valorCentavos: 9900,
  status: "pendente" as const,
  venceEm: AGORA,
  provider: "asaas",
  providerChargeId: "pay_1",
  pixCopiaECola: "copia",
  pixQrCodeBase64: "qr",
  pixExpiraEm: null,
  pagaEm: null,
  createdAt: AGORA,
  updatedAt: AGORA,
};

describe("POST /api/cobrancas", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(async () => {
    await limparCenarios();
    vi.mocked(iniciarCobranca).mockReset();
  });
  afterEach(limparCenarios);

  it("sem sessão: 401", async () => {
    expect((await POST(requisicao({ tipo: "renovacao" }))).status).toBe(401);
  });

  it("corpo inválido: 400 (assinatura e upgrade exigem planoChave; tipo desconhecido)", async () => {
    const { token } = await sessao();

    expect((await POST(requisicao({ tipo: "assinatura" }, token))).status).toBe(400);
    expect((await POST(requisicao({ tipo: "upgrade", planoChave: "" }, token))).status).toBe(400);
    expect((await POST(requisicao({ tipo: "outro" }, token))).status).toBe(400);
    expect(iniciarCobranca).not.toHaveBeenCalled();
  });

  it("201 com a cobrança serializada e o Pix, usando a empresa da sessão", async () => {
    const { cenario, token } = await sessao();
    vi.mocked(iniciarCobranca).mockResolvedValue(COBRANCA);

    const resposta = await POST(requisicao({ tipo: "assinatura", planoChave: "essencial" }, token));

    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(corpo.cobranca).toMatchObject({ id: "c1", valorCentavos: 9900, pix: { copiaECola: "copia", qrCodeBase64: "qr" } });
    expect(iniciarCobranca).toHaveBeenCalledWith({
      empresaId: cenario.empresaId,
      tipo: "assinatura",
      planoDestinoChave: "essencial",
    });
  });

  it("renovação não envia plano", async () => {
    const { cenario, token } = await sessao();
    vi.mocked(iniciarCobranca).mockResolvedValue({ ...COBRANCA, tipo: "renovacao" });

    await POST(requisicao({ tipo: "renovacao" }, token));

    expect(iniciarCobranca).toHaveBeenCalledWith({
      empresaId: cenario.empresaId,
      tipo: "renovacao",
      planoDestinoChave: undefined,
    });
  });

  it("sem CPF/CNPJ: 422 DOCUMENTO_AUSENTE", async () => {
    const { token } = await sessao();
    vi.mocked(iniciarCobranca).mockRejectedValue(new DocumentoAusenteError());

    const resposta = await POST(requisicao({ tipo: "renovacao" }, token));

    expect(resposta.status).toBe(422);
    expect((await resposta.json()).codigo).toBe("DOCUMENTO_AUSENTE");
  });

  it("não permitido: 409 COBRANCA_NAO_PERMITIDA com o motivo", async () => {
    const { token } = await sessao();
    vi.mocked(iniciarCobranca).mockRejectedValue(new CobrancaNaoPermitidaError("mesmo_plano", "Você já está nesse plano."));

    const resposta = await POST(requisicao({ tipo: "upgrade", planoChave: "essencial" }, token));

    expect(resposta.status).toBe(409);
    expect(await resposta.json()).toEqual({
      error: "Você já está nesse plano.",
      codigo: "COBRANCA_NAO_PERMITIDA",
      motivo: "mesmo_plano",
    });
  });

  it.each([
    ["falha incerta", new FalhaIncertaError("timeout")],
    ["recusa definitiva", new RecusaDefinitivaError("recusou")],
  ])("%s do gateway: 502 com mensagem amigável", async (_nome, erro) => {
    const { token } = await sessao();
    vi.mocked(iniciarCobranca).mockRejectedValue(erro);
    const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resposta = await POST(requisicao({ tipo: "renovacao" }, token));

    expect(resposta.status).toBe(502);
    expect((await resposta.json()).error).toContain("tente de novo");
    erroNoConsole.mockRestore();
  });

  it("erro inesperado: 500", async () => {
    const { token } = await sessao();
    vi.mocked(iniciarCobranca).mockRejectedValue(new Error("boom"));
    const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await POST(requisicao({ tipo: "renovacao" }, token))).status).toBe(500);
    erroNoConsole.mockRestore();
  });
});
```

`src/app/api/cobrancas/[id]/__tests__/route.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { usuario } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { assinarToken } from "@/lib/auth/jwt";
import { criarCenario, inserirCobranca, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { GET } from "@/app/api/cobrancas/[id]/route";

async function tokenDaEmpresa(empresaId: string) {
  const [admin] = await db.select().from(usuario);
  return assinarToken({ userId: admin.id, empresaId, papel: admin.papel });
}

function requisicao(id: string, token?: string) {
  return new NextRequest(`http://localhost/api/cobrancas/${id}`, {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

const chamar = (request: NextRequest, id: string) => GET(request, { params: Promise.resolve({ id }) });

describe("GET /api/cobrancas/[id]", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("sem sessão: 401", async () => {
    expect((await chamar(requisicao("x"), "x")).status).toBe(401);
  });

  it("devolve a cobrança da própria empresa", async () => {
    const cenario = await criarCenario();
    const criada = await inserirCobranca(cenario);
    const token = await tokenDaEmpresa(cenario.empresaId);

    const resposta = await chamar(requisicao(criada.id, token), criada.id);

    expect(resposta.status).toBe(200);
    expect((await resposta.json()).cobranca).toMatchObject({ id: criada.id, status: "pendente", valorCentavos: 9900 });
  });

  it("cobrança de outra empresa ou inexistente: 404", async () => {
    const cenario = await criarCenario();
    const criada = await inserirCobranca(cenario);
    const outra = await criarCenario({ email: "outra@cobranca.com" });
    const [, adminDaOutra] = await db.select().from(usuario);
    const tokenDaOutra = await assinarToken({
      userId: adminDaOutra.id,
      empresaId: outra.empresaId,
      papel: adminDaOutra.papel,
    });

    expect((await chamar(requisicao(criada.id, tokenDaOutra), criada.id)).status).toBe(404);
    const inexistente = "00000000-0000-0000-0000-000000000000";
    expect((await chamar(requisicao(inexistente, tokenDaOutra), inexistente)).status).toBe(404);
  });

  it("id que não é UUID: 404 (sem erro de banco)", async () => {
    const cenario = await criarCenario();
    const token = await tokenDaEmpresa(cenario.empresaId);

    expect((await chamar(requisicao("abc", token), "abc")).status).toBe(404);
  });
});
```

`src/app/api/empresa/documento/__tests__/route.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { empresa, usuario } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { assinarToken } from "@/lib/auth/jwt";
import { criarCenario, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { PUT } from "@/app/api/empresa/documento/route";

async function sessao(documento: string | null = null) {
  const cenario = await criarCenario({ documento });
  const [admin] = await db.select().from(usuario);
  const token = await assinarToken({ userId: admin.id, empresaId: cenario.empresaId, papel: admin.papel });
  return { cenario, token };
}

function requisicao(corpo: unknown, token?: string) {
  return new NextRequest("http://localhost/api/empresa/documento", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
}

describe("PUT /api/empresa/documento", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("sem sessão: 401", async () => {
    expect((await PUT(requisicao({ documento: "12345678000199" }))).status).toBe(401);
  });

  it("grava só os dígitos de um CNPJ com máscara", async () => {
    const { cenario, token } = await sessao();

    const resposta = await PUT(requisicao({ documento: "12.345.678/0001-99" }, token));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ documento: "12345678000199" });
    const [salva] = await db.select().from(empresa).where(eq(empresa.id, cenario.empresaId));
    expect(salva.documento).toBe("12345678000199");
  });

  it("aceita CPF (11 dígitos) com máscara", async () => {
    const { token } = await sessao();

    const resposta = await PUT(requisicao({ documento: "123.456.789-09" }, token));

    expect(await resposta.json()).toEqual({ documento: "12345678909" });
  });

  it.each(["", "123", "123456789012", "abcdefghijk", "1234567890123"])("rejeita %j com 400", async (documento) => {
    const { token } = await sessao();

    const resposta = await PUT(requisicao({ documento }, token));

    expect(resposta.status).toBe(400);
  });

  it("corpo sem o campo: 400", async () => {
    const { token } = await sessao();

    expect((await PUT(requisicao({}, token))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/pagamentos/__tests__/serializar-cobranca.test.ts "src/app/api/cobrancas" "src/app/api/empresa"`
Expected: FAIL (módulos e rotas não existem).

- [ ] **Step 3: Implementar schemas e serializador**

`src/lib/validations/cobranca/create.schema.ts`:

```ts
import { z } from "zod";

export const criarCobrancaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("assinatura"), planoChave: z.string().min(1, "Escolha um plano.") }),
  z.object({ tipo: z.literal("upgrade"), planoChave: z.string().min(1, "Escolha um plano.") }),
  z.object({ tipo: z.literal("renovacao") }),
]);

export type CriarCobrancaInput = z.infer<typeof criarCobrancaSchema>;
```

`src/lib/validations/cobranca/response.schema.ts`:

```ts
import { z } from "zod";

export const cobrancaResponseSchema = z.object({
  id: z.string(),
  tipo: z.enum(["assinatura", "upgrade", "renovacao"]),
  status: z.enum(["pendente", "paga", "vencida", "cancelada", "estornada"]),
  valorCentavos: z.number().int(),
  venceEm: z.string(),
  pix: z
    .object({
      copiaECola: z.string(),
      qrCodeBase64: z.string(),
      expiraEm: z.string().nullable(),
    })
    .nullable(),
});

export type CobrancaResponse = z.infer<typeof cobrancaResponseSchema>;
```

`src/lib/validations/empresa/documento.schema.ts`:

```ts
import { z } from "zod";

export const atualizarDocumentoSchema = z.object({
  documento: z
    .string()
    .transform((valor) => valor.replace(/\D/g, ""))
    .pipe(z.string().regex(/^(\d{11}|\d{14})$/, "Informe um CPF (11 dígitos) ou um CNPJ (14 dígitos).")),
});

export type AtualizarDocumentoInput = z.infer<typeof atualizarDocumentoSchema>;
```

`src/lib/pagamentos/serializar-cobranca.ts`:

```ts
import type { Cobranca } from "@/db/queries/cobranca";
import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

export function serializarCobranca(c: Cobranca): CobrancaResponse {
  return {
    id: c.id,
    tipo: c.tipo,
    status: c.status,
    valorCentavos: c.valorCentavos,
    venceEm: c.venceEm.toISOString(),
    pix:
      c.pixCopiaECola && c.pixQrCodeBase64
        ? {
            copiaECola: c.pixCopiaECola,
            qrCodeBase64: c.pixQrCodeBase64,
            expiraEm: c.pixExpiraEm ? c.pixExpiraEm.toISOString() : null,
          }
        : null,
  };
}
```

- [ ] **Step 4: Implementar as rotas**

`src/app/api/cobrancas/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { FalhaIncertaError, RecusaDefinitivaError } from "@/core/payments/erros";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verificarToken } from "@/lib/auth/jwt";
import {
  CobrancaNaoPermitidaError,
  DocumentoAusenteError,
  iniciarCobranca,
} from "@/lib/pagamentos/iniciar-cobranca";
import { serializarCobranca } from "@/lib/pagamentos/serializar-cobranca";
import { criarCobrancaSchema } from "@/lib/validations/cobranca/create.schema";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const parsed = criarCobrancaSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const criada = await iniciarCobranca({
      empresaId: sessao.empresaId,
      tipo: parsed.data.tipo,
      planoDestinoChave: parsed.data.tipo === "renovacao" ? undefined : parsed.data.planoChave,
    });
    return NextResponse.json({ cobranca: serializarCobranca(criada) }, { status: 201 });
  } catch (erro) {
    if (erro instanceof DocumentoAusenteError) {
      return NextResponse.json({ error: erro.message, codigo: "DOCUMENTO_AUSENTE" }, { status: 422 });
    }
    if (erro instanceof CobrancaNaoPermitidaError) {
      return NextResponse.json(
        { error: erro.message, codigo: "COBRANCA_NAO_PERMITIDA", motivo: erro.motivo },
        { status: 409 },
      );
    }
    if (erro instanceof FalhaIncertaError || erro instanceof RecusaDefinitivaError) {
      console.error("[POST /api/cobrancas]", erro);
      return NextResponse.json(
        { error: "Não foi possível gerar o Pix agora, tente de novo em instantes." },
        { status: 502 },
      );
    }
    console.error("[POST /api/cobrancas]", erro);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
```

`src/app/api/cobrancas/[id]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { buscarCobrancaDaEmpresa } from "@/db/queries/cobranca";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verificarToken } from "@/lib/auth/jwt";
import { serializarCobranca } from "@/lib/pagamentos/serializar-cobranca";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  }

  try {
    const encontrada = await buscarCobrancaDaEmpresa(id, sessao.empresaId);
    if (!encontrada) {
      return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ cobranca: serializarCobranca(encontrada) });
  } catch (error) {
    console.error("[GET /api/cobrancas/[id]]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
```

`src/app/api/empresa/documento/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { empresa } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verificarToken } from "@/lib/auth/jwt";
import { atualizarDocumentoSchema } from "@/lib/validations/empresa/documento.schema";

export async function PUT(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const parsed = atualizarDocumentoSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    await db
      .update(empresa)
      .set({ documento: parsed.data.documento, updatedAt: new Date() })
      .where(eq(empresa.id, sessao.empresaId));
    return NextResponse.json({ documento: parsed.data.documento });
  } catch (error) {
    console.error("[PUT /api/empresa/documento]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/pagamentos/__tests__/serializar-cobranca.test.ts "src/app/api/cobrancas" "src/app/api/empresa"`
Expected: PASS (todos os testes).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations/cobranca src/lib/validations/empresa src/lib/pagamentos/serializar-cobranca.ts src/lib/pagamentos/__tests__/serializar-cobranca.test.ts src/app/api/cobrancas src/app/api/empresa
git commit -m "feat(pagamentos): rotas de cobranca (criar e consultar) e do documento da empresa"
```

---

### Task 11: Renovações automáticas (`gerarRenovacoes` e a rota do job)

**Files:**
- Create: `src/lib/pagamentos/gerar-renovacoes.ts`, `src/app/api/cron/renovacoes/route.ts`
- Test: `src/lib/pagamentos/__tests__/gerar-renovacoes.test.ts`, `src/app/api/cron/renovacoes/__tests__/route.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `iniciarCobranca`, `DocumentoAusenteError` (Task 7); `ANTECEDENCIA_RENOVACAO_DIAS_PADRAO` (`@/core/billing/renovacao`); `CARENCIA_DIAS_PADRAO` (`@/lib/permissoes/status-assinatura`); `PaymentRouter`.
- Produces: `gerarRenovacoes(opcoes?: { agora?: Date; antecedenciaDias?: number; roteador?: PaymentRouter }): Promise<{ garantidas: number; semDocumento: number; falhas: number }>` e `POST /api/cron/renovacoes` (`Authorization: Bearer <CRON_SECRET>`; `503` sem `CRON_SECRET`, `401` token errado, `200` com o resumo).

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/pagamentos/__tests__/gerar-renovacoes.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentRouter } from "@/core/payments";
import { FalhaIncertaError } from "@/core/payments/erros";
import { criarProvedorFalso } from "@/core/payments/__tests__/helpers/provedor-falso";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { cobranca } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { gerarRenovacoes } from "../gerar-renovacoes";
import { AGORA, criarCenario, limparCenarios } from "./helpers/cenario";

const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

const ativaVencendoEm = (dias: number, email: string, documento: string | null = "12345678000199") =>
  criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(dias - 30), venceEm: emDias(dias), email, documento });

describe("gerarRenovacoes", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("gera a cobrança de renovação de quem vence dentro da antecedência", async () => {
    const cenario = await ativaVencendoEm(3, "a@x.com");
    const provedor = criarProvedorFalso("asaas");

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([provedor]) });

    expect(resumo).toEqual({ garantidas: 1, semDocumento: 0, falhas: 0 });
    const [criada] = await db.select().from(cobranca);
    expect(criada).toMatchObject({
      empresaId: cenario.empresaId,
      tipo: "renovacao",
      valorCentavos: 9900,
      providerChargeId: "cobranca-asaas",
    });
    expect(criada.venceEm).toEqual(emDias(3));
  });

  it("é idempotente: rodar de novo no mesmo ciclo não cria outra cobrança", async () => {
    await ativaVencendoEm(3, "a@x.com");
    const provedor = criarProvedorFalso("asaas");
    const roteador = new PaymentRouter([provedor]);

    await gerarRenovacoes({ agora: AGORA, roteador });
    const segunda = await gerarRenovacoes({ agora: AGORA, roteador });

    expect(segunda.garantidas).toBe(1);
    expect(await db.select().from(cobranca)).toHaveLength(1);
    expect(provedor.criarCobranca).toHaveBeenCalledTimes(1);
  });

  it("também cobre quem está em carência (venceu há menos de 5 dias)", async () => {
    await ativaVencendoEm(-2, "a@x.com");

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([criarProvedorFalso("asaas")]) });

    expect(resumo.garantidas).toBe(1);
  });

  it("ignora quem vence depois da antecedência, quem já está suspenso, trial e cancelada", async () => {
    await ativaVencendoEm(10, "longe@x.com");
    await ativaVencendoEm(-8, "suspensa@x.com");
    await criarCenario({ email: "trial@x.com" });
    await criarCenario({ planoChave: "essencial", status: "cancelada", inicio: emDias(-27), venceEm: emDias(3), email: "cancelada@x.com" });
    const provedor = criarProvedorFalso("asaas");

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([provedor]) });

    expect(resumo).toEqual({ garantidas: 0, semDocumento: 0, falhas: 0 });
    expect(provedor.criarCobranca).not.toHaveBeenCalled();
  });

  it("respeita uma antecedência customizada", async () => {
    await ativaVencendoEm(8, "a@x.com");
    const roteador = new PaymentRouter([criarProvedorFalso("asaas")]);

    expect((await gerarRenovacoes({ agora: AGORA, roteador })).garantidas).toBe(0);
    expect((await gerarRenovacoes({ agora: AGORA, roteador, antecedenciaDias: 10 })).garantidas).toBe(1);
  });

  it("conta empresas sem CPF/CNPJ e segue com as outras", async () => {
    await ativaVencendoEm(3, "sem@x.com", null);
    await ativaVencendoEm(3, "com@x.com");

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([criarProvedorFalso("asaas")]) });

    expect(resumo).toEqual({ garantidas: 1, semDocumento: 1, falhas: 0 });
  });

  it("falha do gateway numa empresa conta como falha e não derruba o lote", async () => {
    await ativaVencendoEm(3, "a@x.com");
    await ativaVencendoEm(3, "b@x.com");
    const provedor = criarProvedorFalso("asaas");
    vi.mocked(provedor.criarCobranca).mockRejectedValueOnce(new FalhaIncertaError("timeout"));
    const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([provedor]) });

    expect(resumo).toEqual({ garantidas: 1, semDocumento: 0, falhas: 1 });
    erroNoConsole.mockRestore();
  });
});
```

`src/app/api/cron/renovacoes/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/pagamentos/gerar-renovacoes", () => ({
  gerarRenovacoes: vi.fn(async () => ({ garantidas: 2, semDocumento: 1, falhas: 0 })),
}));

import { gerarRenovacoes } from "@/lib/pagamentos/gerar-renovacoes";
import { POST } from "@/app/api/cron/renovacoes/route";

function requisicao(token?: string) {
  return new NextRequest("http://localhost/api/cron/renovacoes", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("POST /api/cron/renovacoes", () => {
  beforeEach(() => {
    vi.mocked(gerarRenovacoes).mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sem CRON_SECRET configurada: 503 e não executa", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const resposta = await POST(requisicao("qualquer"));

    expect(resposta.status).toBe(503);
    expect(gerarRenovacoes).not.toHaveBeenCalled();
  });

  it("token ausente ou errado: 401 e não executa", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");

    expect((await POST(requisicao())).status).toBe(401);
    expect((await POST(requisicao("errado"))).status).toBe(401);
    expect(gerarRenovacoes).not.toHaveBeenCalled();
  });

  it("token certo: 200 com o resumo", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");

    const resposta = await POST(requisicao("segredo-do-cron"));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ garantidas: 2, semDocumento: 1, falhas: 0 });
    expect(gerarRenovacoes).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/pagamentos/__tests__/gerar-renovacoes.test.ts "src/app/api/cron"`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar**

`src/lib/pagamentos/gerar-renovacoes.ts`:

```ts
import { and, eq, gt, lte } from "drizzle-orm";

import { ANTECEDENCIA_RENOVACAO_DIAS_PADRAO } from "@/core/billing/renovacao";
import type { PaymentRouter } from "@/core/payments/router";
import { db } from "@/db";
import { assinatura } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { CARENCIA_DIAS_PADRAO } from "@/lib/permissoes/status-assinatura";
import { DocumentoAusenteError, iniciarCobranca } from "./iniciar-cobranca";

export interface ResumoRenovacoes {
  garantidas: number;
  semDocumento: number;
  falhas: number;
}

// Idempotente: iniciarCobranca reaproveita a renovação pendente do ciclo, então o
// job pode rodar todo dia (e de novo, se alguém disparar a mais) sem duplicar cobrança.
export async function gerarRenovacoes({
  agora = new Date(),
  antecedenciaDias = ANTECEDENCIA_RENOVACAO_DIAS_PADRAO,
  roteador,
}: { agora?: Date; antecedenciaDias?: number; roteador?: PaymentRouter } = {}): Promise<ResumoRenovacoes> {
  const limiteSuperior = new Date(agora.getTime() + antecedenciaDias * MS_POR_DIA);
  const limiteInferior = new Date(agora.getTime() - CARENCIA_DIAS_PADRAO * MS_POR_DIA);

  const candidatas = await db
    .select({ empresaId: assinatura.empresaId })
    .from(assinatura)
    .where(
      and(
        eq(assinatura.status, "ativa"),
        lte(assinatura.venceEm, limiteSuperior),
        gt(assinatura.venceEm, limiteInferior),
      ),
    );

  const resumo: ResumoRenovacoes = { garantidas: 0, semDocumento: 0, falhas: 0 };

  for (const { empresaId } of candidatas) {
    try {
      await iniciarCobranca({ empresaId, tipo: "renovacao", agora, roteador });
      resumo.garantidas += 1;
    } catch (erro) {
      if (erro instanceof DocumentoAusenteError) {
        resumo.semDocumento += 1;
      } else {
        console.error("[pagamentos] falha ao gerar a renovação", empresaId, erro);
        resumo.falhas += 1;
      }
    }
  }

  return resumo;
}
```

`src/app/api/cron/renovacoes/route.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { gerarRenovacoes } from "@/lib/pagamentos/gerar-renovacoes";

function tokensIguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return NextResponse.json({ error: "Job não configurado." }, { status: 503 });
  }

  const cabecalho = request.headers.get("authorization") ?? "";
  const recebido = cabecalho.startsWith("Bearer ") ? cabecalho.slice("Bearer ".length) : "";
  if (!tokensIguais(recebido, segredo)) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    return NextResponse.json(await gerarRenovacoes());
  } catch (error) {
    console.error("[POST /api/cron/renovacoes]", error);
    return NextResponse.json({ error: "Erro ao gerar as renovações." }, { status: 500 });
  }
}
```

Em `.env.example`, acrescentar ao final:

```bash

# Segredo da rota que gera as cobranças de renovação (POST /api/cron/renovacoes).
# Agende no Coolify (Scheduled Task, 1x por dia) um curl com
# `Authorization: Bearer <este valor>`. Sem ele a rota responde 503.
CRON_SECRET=""
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/pagamentos/__tests__/gerar-renovacoes.test.ts "src/app/api/cron"`
Expected: PASS (todos os testes).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pagamentos/gerar-renovacoes.ts src/lib/pagamentos/__tests__/gerar-renovacoes.test.ts src/app/api/cron .env.example
git commit -m "feat(pagamentos): geracao diaria e idempotente das renovacoes e rota do job"
```

---

### Task 12: Script de verificação no sandbox e guia de configuração

**Files:**
- Create: `scripts/asaas-sandbox-check.mjs`, `docs/pagamentos-asaas.md`

**Interfaces:**
- Produces: um script manual (não faz parte da suíte) que valida a API key do sandbox criando um cliente e uma cobrança Pix de teste, consultando-a por `externalReference`, buscando o QR e cancelando; e o guia de configuração da conta sandbox e do webhook.

- [ ] **Step 1: Criar o script**

`scripts/asaas-sandbox-check.mjs`:

```js
#!/usr/bin/env node
/**
 * Verificação manual do sandbox do Asaas. NÃO faz parte dos testes: usa a rede e
 * a sua chave. Cria um cliente e uma cobrança Pix de R$ 5,00, consulta pelo
 * externalReference, busca o QR Code e cancela a cobrança no fim.
 *
 * Uso:
 *   node scripts/asaas-sandbox-check.mjs --cpfcnpj=<CPF ou CNPJ válido>
 *
 * Lê ASAAS_API_KEY e ASAAS_BASE_URL do ambiente ou do .env (padrão: sandbox).
 * Recusa rodar contra um endereço que não seja o do sandbox.
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE_SANDBOX = "https://api-sandbox.asaas.com";

async function lerEnv() {
  const arquivo = path.join(process.cwd(), ".env");
  if (!existsSync(arquivo)) return {};
  const saida = {};
  for (const linha of (await readFile(arquivo, "utf8")).split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) saida[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return saida;
}

function lerArgumento(nome) {
  const prefixo = `--${nome}=`;
  const achado = process.argv.slice(2).find((arg) => arg.startsWith(prefixo));
  return achado ? achado.slice(prefixo.length) : undefined;
}

async function chamar(base, chave, metodo, caminho, corpo) {
  const resposta = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { access_token: chave, "Content-Type": "application/json", "User-Agent": "docobra" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    // resposta sem corpo JSON
  }
  if (!resposta.ok) {
    throw new Error(`${metodo} ${caminho} → ${resposta.status}: ${texto.slice(0, 400)}`);
  }
  return json;
}

function passo(titulo, dados) {
  console.log(`\n▶ ${titulo}`);
  if (dados !== undefined) console.log(JSON.stringify(dados, null, 2));
}

async function main() {
  const env = { ...(await lerEnv()), ...process.env };
  const chave = env.ASAAS_API_KEY;
  const base = env.ASAAS_BASE_URL || BASE_SANDBOX;
  const documento = lerArgumento("cpfcnpj");

  if (!chave) throw new Error("ASAAS_API_KEY não definida (ambiente ou .env).");
  if (!documento) throw new Error("Informe --cpfcnpj=<CPF ou CNPJ válido>.");
  if (base !== BASE_SANDBOX) {
    throw new Error(`Este script só roda no sandbox (${BASE_SANDBOX}). ASAAS_BASE_URL atual: ${base}`);
  }

  const referencia = randomUUID();
  const vencimento = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const cliente = await chamar(base, chave, "POST", "/v3/customers", {
    name: "DocObra — teste de sandbox",
    cpfCnpj: documento.replace(/\D/g, ""),
    externalReference: `teste-${referencia}`,
  });
  passo("Cliente criado", { id: cliente.id });

  const pagamento = await chamar(base, chave, "POST", "/v3/payments", {
    customer: cliente.id,
    billingType: "PIX",
    value: 5,
    dueDate: vencimento,
    externalReference: referencia,
    description: "DocObra — teste de sandbox",
  });
  passo("Cobrança Pix criada", { id: pagamento.id, status: pagamento.status, invoiceUrl: pagamento.invoiceUrl });

  const qr = await chamar(base, chave, "GET", `/v3/payments/${pagamento.id}/pixQrCode`);
  passo("QR Code", {
    expirationDate: qr.expirationDate,
    payloadComeca: String(qr.payload).slice(0, 40),
    imagemBase64Bytes: String(qr.encodedImage).length,
  });

  const busca = await chamar(base, chave, "GET", `/v3/payments?externalReference=${referencia}&limit=10`);
  passo("Consulta por externalReference", { encontradas: busca.data.map((p) => p.id), totalCount: busca.totalCount });

  await chamar(base, chave, "DELETE", `/v3/payments/${pagamento.id}`);
  passo("Cobrança cancelada (DELETE)");

  console.log("\n✔ Sandbox respondeu a todas as chamadas que o DocObra usa.");
  console.log("  Falta validar o webhook: veja docs/pagamentos-asaas.md.");
}

main().catch((erro) => {
  console.error(`\n✖ ${erro.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Criar o guia**

`docs/pagamentos-asaas.md`:

````markdown
# Pagamentos com Asaas (sandbox)

O DocObra cobra por Pix via Asaas. **Por enquanto tudo roda no sandbox**, que é uma
conta separada da produção e sai em minutos.

## 1. Conta e chave

1. Crie a conta em https://sandbox.asaas.com.
2. Gere a API key (Integrações → Chaves de API) e ponha no `.env`:
   ```bash
   ASAAS_API_KEY="<chave do sandbox>"
   ASAAS_BASE_URL="https://api-sandbox.asaas.com"
   PAGAMENTOS_ORDEM="asaas"
   ```
3. Cadastre uma chave Pix na conta sandbox (o QR Code dinâmico depende dela).

## 2. Verificação da API

```bash
node scripts/asaas-sandbox-check.mjs --cpfcnpj=<CPF ou CNPJ válido de teste>
```

O script cria um cliente e uma cobrança Pix de R$ 5,00, consulta por `externalReference`,
busca o QR e cancela. Anote o que aparecer de diferente do esperado, em especial:

- o **valor mínimo** aceito para uma cobrança Pix (ajuste `PAGAMENTO_VALOR_MINIMO_CENTAVOS`);
- se o `cpfCnpj` é realmente obrigatório para gerar a cobrança.

## 3. Webhook

O Asaas precisa alcançar uma URL pública. Em desenvolvimento use um túnel (por exemplo
`ngrok http 3000`).

1. No sandbox, Integrações → Webhooks → novo webhook:
   - URL: `https://<seu-endereço-público>/api/webhooks/pagamentos/asaas`
   - Token de autenticação (`authToken`): um valor longo e aleatório. O mesmo valor vai no
     `.env` como `ASAAS_WEBHOOK_TOKEN`.
   - Eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`,
     `PAYMENT_DELETED`, `PAYMENT_REFUNDED`.
2. O app responde `200` só depois de gravar o evento. **Quinze falhas seguidas pausam a fila
   de webhooks do Asaas**: se isso acontecer, reative a fila no painel.
3. Para simular o pagamento de um Pix no sandbox, siga o guia do Asaas
   ("Testar pagamento de QR Codes Pix").

## 4. Renovações

A rota `POST /api/cron/renovacoes` gera as cobranças de renovação (5 dias antes do
vencimento). Defina `CRON_SECRET` e agende no Coolify (Scheduled Task, 1x por dia):

```bash
curl -fsS -X POST https://<dominio>/api/cron/renovacoes -H "Authorization: Bearer $CRON_SECRET"
```

A rota é idempotente: rodar mais de uma vez no dia não duplica cobrança.

## 5. O que o Asaas faz sozinho

As notificações ao cliente ficam **ligadas** de propósito: o Asaas manda por e-mail o
link do Pix, o que serve de lembrete de renovação (o DocObra ainda não tem e-mail próprio).

## Antes de ir para produção

Troque a chave e `ASAAS_BASE_URL`, recrie o webhook na conta de produção com um novo
`authToken`, e valide de novo o valor mínimo.
````

- [ ] **Step 3: Verificar sintaxe e o recusar-fora-do-sandbox**

Run: `node --check scripts/asaas-sandbox-check.mjs`
Expected: sem saída (sintaxe válida).

Run: `ASAAS_API_KEY=x ASAAS_BASE_URL=https://api.asaas.com node scripts/asaas-sandbox-check.mjs --cpfcnpj=00000000000; echo "exit=$?"`
Expected: imprime `✖ Este script só roda no sandbox ...` e `exit=1` (sem fazer nenhuma chamada de rede).

Run: `node scripts/asaas-sandbox-check.mjs; echo "exit=$?"` (sem `ASAAS_API_KEY` no ambiente e sem a variável no `.env`, se for o caso)
Expected: `✖ ASAAS_API_KEY não definida ...` e `exit=1`. Se o `.env` já tiver uma chave, pule este comando.

- [ ] **Step 4: Commit**

```bash
git add scripts/asaas-sandbox-check.mjs docs/pagamentos-asaas.md
git commit -m "docs(pagamentos): script de verificacao do sandbox do Asaas e guia de configuracao"
```
