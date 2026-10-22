# Planos e permissões — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o catálogo de permissões, planos, assinatura, consumo por evento e a função `verificarPermissao`, sem pagamento e ainda sem aplicar o bloqueio nos pontos de uso.

**Architecture:** Tabelas Drizzle (um arquivo por entidade em `src/db/schema/`), funções puras em `src/lib/permissoes/` (janela e status derivado), queries em `src/db/queries/` e um script de seed idempotente em `scripts/seed-planos.mjs` (o projeto não tem `tsx`, e o `docker-entrypoint.sh` já roda scripts `.mjs`). Spec: `docs/superpowers/specs/2026-10-05-planos-permissoes-design.md`.

**Tech Stack:** Next.js (App Router), Drizzle ORM + Postgres (`drizzle-kit push`, sem migrations versionadas), Vitest com banco real `docobra-local-test`.

## Global Constraints

- Schema aplicado com `npm run db:push` (dev) e `drizzle-kit push` apontando pro banco de teste. **Não existe pasta `drizzle/`**.
- Testes de integração rodam contra `docobra-local-test` (o `vitest.setup.ts` aborta se `DATABASE_URL` não for esse). `fileParallelism: false`.
- Uma tabela Drizzle por arquivo em `src/db/schema/`; exportar tudo em `src/db/schema/index.ts`.
- Nomes de domínio em português (`empresaId`, `cicloDias`), colunas em `snake_case`. Imports com alias `@/`.
- Comentário só quando o PORQUÊ não é óbvio. Sem abstração além do que a tarefa pede.
- **Não commitar sozinho.** Ao fim de cada task, entregar o comando de commit pronto pro Victor rodar (regra dele neste projeto).
- Mensagens de commit em português, no estilo `feat(...)`/`test(...)`, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Convenção de limite: permissão `tipo = "limite"` com `valor` nulo significa **ilimitado**. `valor` e `janela_dias` sempre andam juntos (ambos nulos ou ambos preenchidos).
- Ciclo de 30 dias fixos (mensal) ou 360 (anual); janela em dias; milissegundos por dia = `86_400_000`.
- Fora desta fase: `cobranca`, `evento_pagamento`, `core/billing/`, `core/payments/`, qualquer bloqueio nos pontos de uso, tela de suporte. O campo `empresa.plano` continua existindo e **não é lido** por nada novo.
- Valores do seed (preços, limites, trial) são **provisórios**; o Victor define os reais antes de publicar.

---

### Task 1: Schema das 7 tabelas

**Files:**
- Create: `src/db/schema/permissao.ts`, `plano.ts`, `plano-permissao.ts`, `empresa-permissao.ts`, `assinatura.ts`, `assinatura-trecho.ts`, `consumo.ts`
- Modify: `src/db/schema/index.ts`
- Test: `src/db/__tests__/schema-permissoes.test.ts`

**Interfaces:**
- Produces (exportados por `@/db/schema`): `permissao`, `plano`, `planoPermissao`, `empresaPermissao`, `assinatura`, `assinaturaTrecho`, `consumo`; tipo `StatusAssinatura = "trial" | "ativa" | "cancelada"` (de `assinatura.ts`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/db/__tests__/schema-permissoes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  assinatura,
  assinaturaTrecho,
  consumo,
  empresa,
  permissao,
  plano,
  planoPermissao,
} from "@/db/schema";

const CHAVE_PERMISSAO = "teste.schema.permissao";
const CHAVE_PLANO = "teste-schema-plano";

async function limpar() {
  await db.delete(empresa);
  await db.delete(permissao).where(eq(permissao.chave, CHAVE_PERMISSAO));
  await db.delete(plano).where(eq(plano.chave, CHAVE_PLANO));
}

async function criarBase() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  const [novaPermissao] = await db
    .insert(permissao)
    .values({ chave: CHAVE_PERMISSAO, tipo: "limite" })
    .returning();
  const [novoPlano] = await db
    .insert(plano)
    .values({ chave: CHAVE_PLANO, nome: "Plano Teste", cicloDias: 30 })
    .returning();
  return { novaEmpresa, novaPermissao, novoPlano };
}

describe("schema de permissões", () => {
  beforeEach(limpar);
  afterEach(limpar);

  it("rejeita duas permissões com a mesma chave", async () => {
    await db.insert(permissao).values({ chave: CHAVE_PERMISSAO, tipo: "limite" });

    await expect(
      db.insert(permissao).values({ chave: CHAVE_PERMISSAO, tipo: "booleana" }),
    ).rejects.toThrow();
  });

  it("rejeita consumo repetido da mesma referência", async () => {
    const { novaEmpresa, novaPermissao } = await criarBase();
    const linha = {
      empresaId: novaEmpresa.id,
      permissaoId: novaPermissao.id,
      referencia: "item-1",
    };

    await db.insert(consumo).values(linha);

    await expect(db.insert(consumo).values(linha)).rejects.toThrow();
  });

  it("rejeita um segundo trecho vigente na mesma assinatura", async () => {
    const { novaEmpresa, novoPlano } = await criarBase();
    const [novaAssinatura] = await db
      .insert(assinatura)
      .values({ empresaId: novaEmpresa.id, venceEm: new Date("2027-01-01T00:00:00Z") })
      .returning();
    const trecho = { assinaturaId: novaAssinatura.id, planoId: novoPlano.id };

    await db.insert(assinaturaTrecho).values(trecho);

    await expect(db.insert(assinaturaTrecho).values(trecho)).rejects.toThrow();
  });

  it("rejeita vínculo com valor mas sem janela", async () => {
    const { novaPermissao, novoPlano } = await criarBase();

    await expect(
      db.insert(planoPermissao).values({
        planoId: novoPlano.id,
        permissaoId: novaPermissao.id,
        valor: 5,
        janelaDias: null,
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/db/__tests__/schema-permissoes.test.ts`
Expected: FAIL (as tabelas novas não são exportadas por `@/db/schema`).

- [ ] **Step 3: Criar os 7 arquivos de schema**

`src/db/schema/permissao.ts`:

```ts
import { pgTable, uuid, varchar, text } from "drizzle-orm/pg-core";

export const permissao = pgTable("permissao", {
  id: uuid("id").defaultRandom().primaryKey(),
  chave: varchar("chave", { length: 100 }).notNull().unique(),
  tipo: varchar("tipo", { length: 20 }).$type<"booleana" | "limite">().notNull(),
  descricao: text("descricao").notNull().default(""),
});
```

`src/db/schema/plano.ts`:

```ts
import { pgTable, uuid, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const plano = pgTable("plano", {
  id: uuid("id").defaultRandom().primaryKey(),
  chave: varchar("chave", { length: 50 }).notNull().unique(),
  nome: varchar("nome", { length: 100 }).notNull(),
  nivel: integer("nivel").notNull().default(0),
  cicloDias: integer("ciclo_dias").notNull(),
  precoCentavos: integer("preco_centavos").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  interno: boolean("interno").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

`src/db/schema/plano-permissao.ts`:

```ts
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
```

`src/db/schema/empresa-permissao.ts`:

```ts
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
  ],
);
```

`src/db/schema/assinatura.ts`:

```ts
import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

import { empresa } from "./empresa";

// Só estes três são gravados. "carencia" e "suspensa" são derivados de `vence_em`
// e da data de agora (ver src/lib/permissoes/status-assinatura.ts).
export type StatusAssinatura = "trial" | "ativa" | "cancelada";

export const assinatura = pgTable("assinatura", {
  id: uuid("id").defaultRandom().primaryKey(),
  empresaId: uuid("empresa_id")
    .notNull()
    .unique()
    .references(() => empresa.id, { onDelete: "cascade" }),
  inicio: timestamp("inicio", { withTimezone: true }).defaultNow().notNull(),
  status: varchar("status", { length: 20 }).$type<StatusAssinatura>().notNull().default("trial"),
  venceEm: timestamp("vence_em", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

`src/db/schema/assinatura-trecho.ts`:

```ts
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
```

`src/db/schema/consumo.ts`:

```ts
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
```

Em `src/db/schema/index.ts`, acrescentar ao final:

```ts
export * from "./permissao";
export * from "./plano";
export * from "./plano-permissao";
export * from "./empresa-permissao";
export * from "./assinatura";
export * from "./assinatura-trecho";
export * from "./consumo";
```

- [ ] **Step 4: Aplicar o schema no banco de dev e no de teste**

Run (dev): `npm run db:push`
Expected: cria as 7 tabelas, sem pedir confirmação de perda de dados.

Run (teste, Git Bash): `set -a; . ./.env.test; set +a; npx drizzle-kit push`
Expected: mesmas 7 tabelas criadas em `docobra-local-test`.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/db/__tests__/schema-permissoes.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Entregar o comando de commit**

```bash
git add src/db/schema src/db/__tests__/schema-permissoes.test.ts
git commit -m "feat(planos): schema de permissoes, planos, assinatura e consumo"
```

---

### Task 2: Cálculo de janela (função pura)

**Files:**
- Create: `src/lib/permissoes/janela.ts`
- Test: `src/lib/permissoes/__tests__/janela.test.ts`

**Interfaces:**
- Produces: `MS_POR_DIA: number`; `interface Janela { inicio: Date; fim: Date }`; `calcularJanela(ancora: Date, janelaDias: number, agora: Date): Janela`.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/permissoes/__tests__/janela.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MS_POR_DIA, calcularJanela } from "../janela";

const ANCORA = new Date("2026-03-01T00:00:00Z");
const depois = (dias: number) => new Date(ANCORA.getTime() + dias * MS_POR_DIA);

describe("calcularJanela", () => {
  it("no dia 0 a janela começa na âncora", () => {
    const janela = calcularJanela(ANCORA, 30, ANCORA);

    expect(janela.inicio).toEqual(ANCORA);
    expect(janela.fim).toEqual(depois(30));
  });

  it("dentro da primeira janela devolve a primeira janela", () => {
    const janela = calcularJanela(ANCORA, 30, depois(29));

    expect(janela.inicio).toEqual(ANCORA);
    expect(janela.fim).toEqual(depois(30));
  });

  it("exatamente na virada já é a janela seguinte", () => {
    const janela = calcularJanela(ANCORA, 30, depois(30));

    expect(janela.inicio).toEqual(depois(30));
    expect(janela.fim).toEqual(depois(60));
  });

  it("repete a janela várias vezes a partir da âncora", () => {
    const janela = calcularJanela(ANCORA, 30, depois(95));

    expect(janela.inicio).toEqual(depois(90));
    expect(janela.fim).toEqual(depois(120));
  });

  it("suporta janela de 360 dias", () => {
    const janela = calcularJanela(ANCORA, 360, depois(400));

    expect(janela.inicio).toEqual(depois(360));
    expect(janela.fim).toEqual(depois(720));
  });

  it("antes da âncora devolve a primeira janela", () => {
    const janela = calcularJanela(ANCORA, 30, depois(-5));

    expect(janela.inicio).toEqual(ANCORA);
    expect(janela.fim).toEqual(depois(30));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/permissoes/__tests__/janela.test.ts`
Expected: FAIL (`Cannot find module '../janela'`).

- [ ] **Step 3: Implementar**

`src/lib/permissoes/janela.ts`:

```ts
export const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface Janela {
  inicio: Date;
  fim: Date;
}

export function calcularJanela(ancora: Date, janelaDias: number, agora: Date): Janela {
  const duracao = janelaDias * MS_POR_DIA;
  const decorrido = Math.max(0, agora.getTime() - ancora.getTime());
  const indice = Math.floor(decorrido / duracao);
  const inicio = new Date(ancora.getTime() + indice * duracao);

  return { inicio, fim: new Date(inicio.getTime() + duracao) };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/permissoes/__tests__/janela.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Entregar o comando de commit**

```bash
git add src/lib/permissoes/janela.ts src/lib/permissoes/__tests__/janela.test.ts
git commit -m "feat(planos): calculo de janela de limite a partir do dia 0"
```

---

### Task 3: Status derivado da assinatura (função pura) + ajustes no spec

**Files:**
- Create: `src/lib/permissoes/status-assinatura.ts`
- Test: `src/lib/permissoes/__tests__/status-assinatura.test.ts`
- Modify: `docs/superpowers/specs/2026-10-05-planos-permissoes-design.md`

**Interfaces:**
- Consumes: `MS_POR_DIA` de `./janela`; `StatusAssinatura` de `@/db/schema/assinatura`.
- Produces: `type StatusEfetivo = StatusAssinatura | "carencia" | "suspensa"`; `CARENCIA_DIAS_PADRAO = 5`; `derivarStatus(assinatura: { status: StatusAssinatura; venceEm: Date }, agora: Date, carenciaDias?: number): StatusEfetivo`.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/permissoes/__tests__/status-assinatura.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MS_POR_DIA } from "../janela";
import { derivarStatus } from "../status-assinatura";

const VENCE_EM = new Date("2026-03-31T00:00:00Z");
const apos = (dias: number) => new Date(VENCE_EM.getTime() + dias * MS_POR_DIA);

describe("derivarStatus", () => {
  it("antes do vencimento mantém o status gravado", () => {
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(-1))).toBe("ativa");
    expect(derivarStatus({ status: "trial", venceEm: VENCE_EM }, apos(-1))).toBe("trial");
    expect(derivarStatus({ status: "cancelada", venceEm: VENCE_EM }, apos(-1))).toBe("cancelada");
  });

  it("assinatura ativa vencida entra em carência", () => {
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(0))).toBe("carencia");
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(4))).toBe("carencia");
  });

  it("passada a carência de 5 dias vira suspensa", () => {
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(5))).toBe("suspensa");
  });

  it("respeita uma carência customizada", () => {
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(0), 0)).toBe("suspensa");
    expect(derivarStatus({ status: "ativa", venceEm: VENCE_EM }, apos(9), 10)).toBe("carencia");
  });

  it("trial vencido não tem carência", () => {
    expect(derivarStatus({ status: "trial", venceEm: VENCE_EM }, apos(0))).toBe("suspensa");
  });

  it("cancelada vencida vira suspensa", () => {
    expect(derivarStatus({ status: "cancelada", venceEm: VENCE_EM }, apos(0))).toBe("suspensa");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/permissoes/__tests__/status-assinatura.test.ts`
Expected: FAIL (`Cannot find module '../status-assinatura'`).

- [ ] **Step 3: Implementar**

`src/lib/permissoes/status-assinatura.ts`:

```ts
import type { StatusAssinatura } from "@/db/schema/assinatura";
import { MS_POR_DIA } from "./janela";

export type StatusEfetivo = StatusAssinatura | "carencia" | "suspensa";

export const CARENCIA_DIAS_PADRAO = 5;

export function derivarStatus(
  assinatura: { status: StatusAssinatura; venceEm: Date },
  agora: Date,
  carenciaDias: number = CARENCIA_DIAS_PADRAO,
): StatusEfetivo {
  if (agora < assinatura.venceEm) return assinatura.status;

  const fimDaCarencia = assinatura.venceEm.getTime() + carenciaDias * MS_POR_DIA;
  if (assinatura.status === "ativa" && agora.getTime() < fimDaCarencia) return "carencia";

  return "suspensa";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/permissoes/__tests__/status-assinatura.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Alinhar o spec com as decisões tomadas ao planejar**

Em `docs/superpowers/specs/2026-10-05-planos-permissoes-design.md`, na seção "1. Modelo de dados", fazer estas três trocas (se o texto exato diferir, adaptar mantendo o sentido):

1. A linha da `assinatura` passa a:
   `- \`assinatura\`: empresa (uma por empresa), \`inicio\` (dia 0), \`status\` gravado (\`trial\` | \`ativa\` | \`cancelada\`), \`vence_em\`. \`carencia\` e \`suspensa\` não são gravados: são derivados de \`vence_em\` e da data de agora.`
2. Na lista de chaves de `permissao`, acrescentar `acervo.listar` (é a única que o plano `suspenso` concede).
3. Em `plano_permissao`, acrescentar: "Para `tipo = limite`, `valor` nulo significa ilimitado; `valor` e `janela_dias` são ambos nulos ou ambos preenchidos."

Acrescentar também, no fim da seção 4, a linha: "`cobranca` e `evento_pagamento` entram só nas Fases 3 e 4."

- [ ] **Step 6: Entregar o comando de commit**

```bash
git add src/lib/permissoes/status-assinatura.ts src/lib/permissoes/__tests__/status-assinatura.test.ts docs/superpowers/specs/2026-10-05-planos-permissoes-design.md
git commit -m "feat(planos): status derivado da assinatura (carencia e suspensa)"
```

---

### Task 4: Seed do catálogo e dos planos + preenchimento das empresas existentes

**Files:**
- Create: `scripts/seed-planos.mjs`, `scripts/seed-planos.d.mts`, `src/db/__tests__/helpers/semear-catalogo.ts`
- Test: `src/db/__tests__/seed-planos.test.ts`

**Interfaces:**
- Produces (`scripts/seed-planos.mjs`): `semearPlanos(client: pg.Client): Promise<void>` (idempotente: permissões são atualizadas, planos e vínculos só inseridos, para não sobrescrever preço editado depois); `preencherAssinaturasExistentes(client, opcoes?: { planoChave?: string; agora?: Date }): Promise<number>` (devolve quantas empresas ganharam assinatura; padrão `escritorio`, `ativa`, vence em 360 dias, origem `suporte`).
- Produces (`src/db/__tests__/helpers/semear-catalogo.ts`): `semearCatalogoNoBancoDeTeste(): Promise<void>`.

- [ ] **Step 1: Escrever o teste que falha**

`src/db/__tests__/seed-planos.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { Client } from "pg";

import { db } from "@/db";
import {
  assinatura,
  assinaturaTrecho,
  empresa,
  permissao,
  plano,
  planoPermissao,
} from "@/db/schema";
import { preencherAssinaturasExistentes, semearPlanos } from "../../../scripts/seed-planos.mjs";

const PLANOS = ["trial", "suspenso", "essencial", "escritorio"];

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await db.delete(empresa);
  await db.update(plano).set({ precoCentavos: 9900 }).where(eq(plano.chave, "essencial"));
});

describe("semearPlanos", () => {
  it("cria os planos e as permissões do catálogo", async () => {
    await semearPlanos(client);

    const planos = await db.select({ chave: plano.chave }).from(plano).where(inArray(plano.chave, PLANOS));
    expect(planos).toHaveLength(4);

    const [listar] = await db.select().from(permissao).where(eq(permissao.chave, "acervo.listar"));
    expect(listar.tipo).toBe("booleana");
  });

  it("é idempotente", async () => {
    await semearPlanos(client);
    const antes = await db.select().from(planoPermissao);

    await semearPlanos(client);
    const depois = await db.select().from(planoPermissao);

    expect(depois).toHaveLength(antes.length);
  });

  it("o plano suspenso só concede a listagem do acervo", async () => {
    await semearPlanos(client);

    const vinculos = await db
      .select({ chave: permissao.chave })
      .from(planoPermissao)
      .innerJoin(plano, eq(plano.id, planoPermissao.planoId))
      .innerJoin(permissao, eq(permissao.id, planoPermissao.permissaoId))
      .where(eq(plano.chave, "suspenso"));

    expect(vinculos).toEqual([{ chave: "acervo.listar" }]);
  });

  it("não sobrescreve um preço editado depois do primeiro seed", async () => {
    await semearPlanos(client);
    await db.update(plano).set({ precoCentavos: 1 }).where(eq(plano.chave, "essencial"));

    await semearPlanos(client);

    const [essencial] = await db.select().from(plano).where(eq(plano.chave, "essencial"));
    expect(essencial.precoCentavos).toBe(1);
  });
});

describe("preencherAssinaturasExistentes", () => {
  it("dá assinatura ativa do plano escritório a quem não tem, e só a quem não tem", async () => {
    await semearPlanos(client);
    const [semAssinatura] = await db.insert(empresa).values({ nome: "Sem Assinatura" }).returning();
    const agora = new Date("2026-06-15T12:00:00Z");

    const total = await preencherAssinaturasExistentes(client, { agora });

    expect(total).toBe(1);
    const [criada] = await db.select().from(assinatura).where(eq(assinatura.empresaId, semAssinatura.id));
    expect(criada.status).toBe("ativa");
    expect(criada.inicio).toEqual(agora);

    const [trecho] = await db
      .select({ chave: plano.chave, origem: assinaturaTrecho.origem, fim: assinaturaTrecho.fim })
      .from(assinaturaTrecho)
      .innerJoin(plano, eq(plano.id, assinaturaTrecho.planoId))
      .where(and(eq(assinaturaTrecho.assinaturaId, criada.id)));
    expect(trecho).toEqual({ chave: "escritorio", origem: "suporte", fim: null });

    expect(await preencherAssinaturasExistentes(client, { agora })).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/db/__tests__/seed-planos.test.ts`
Expected: FAIL (`Failed to resolve import "../../../scripts/seed-planos.mjs"`).

- [ ] **Step 3: Criar o script de seed**

`scripts/seed-planos.mjs`:

```js
#!/usr/bin/env node
/**
 * Semeia o catálogo de permissões e os planos, e dá uma assinatura às empresas
 * que ainda não têm (as que existiam antes dos planos). Idempotente.
 *
 * Os valores abaixo (preços, limites, trial) são PROVISÓRIOS.
 *
 * Planos e vínculos só são inseridos (ON CONFLICT DO NOTHING): rodar o seed de
 * novo não desfaz um preço ou limite que foi ajustado no banco depois.
 * Permissões são atualizadas (descrição/tipo), pois são catálogo de código.
 *
 * Uso:
 *   node scripts/seed-planos.mjs
 *   node scripts/seed-planos.mjs --plano=essencial   # plano das empresas existentes
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const VALIDADE_EMPRESAS_EXISTENTES_DIAS = 360;

const PERMISSOES = [
  { chave: "memorial.gerar", tipo: "limite", descricao: "Memoriais descritivos gerados" },
  { chave: "comunique-se.processar", tipo: "limite", descricao: "Comunique-se processados por IA" },
  { chave: "projetos.criar", tipo: "limite", descricao: "Projetos criados" },
  { chave: "memorial.audio", tipo: "booleana", descricao: "Entrada do memorial por áudio" },
  { chave: "acervo.listar", tipo: "booleana", descricao: "Ver a lista de projetos e documentos" },
  { chave: "acervo.abrir", tipo: "booleana", descricao: "Abrir projetos e documentos" },
  { chave: "acervo.baixar", tipo: "booleana", descricao: "Baixar PDFs e modelos" },
];

const limite = (chave, valor, janelaDias) => ({ chave, valor, janelaDias });
const liberada = (chave) => ({ chave, valor: null, janelaDias: null });

const ACERVO = [liberada("acervo.listar"), liberada("acervo.abrir"), liberada("acervo.baixar")];

const PLANOS = [
  {
    chave: "trial",
    nome: "Trial",
    nivel: 0,
    cicloDias: 14,
    precoCentavos: 0,
    interno: true,
    permissoes: [
      limite("memorial.gerar", 3, 14),
      limite("comunique-se.processar", 3, 14),
      limite("projetos.criar", 2, 14),
      liberada("memorial.audio"),
      ...ACERVO,
    ],
  },
  {
    chave: "suspenso",
    nome: "Leitura limitada",
    nivel: 0,
    cicloDias: 30,
    precoCentavos: 0,
    interno: true,
    permissoes: [liberada("acervo.listar")],
  },
  {
    chave: "essencial",
    nome: "Essencial",
    nivel: 1,
    cicloDias: 30,
    precoCentavos: 9900,
    interno: false,
    permissoes: [
      limite("memorial.gerar", 20, 30),
      limite("comunique-se.processar", 20, 30),
      limite("projetos.criar", 10, 30),
      liberada("memorial.audio"),
      ...ACERVO,
    ],
  },
  {
    chave: "escritorio",
    nome: "Escritório",
    nivel: 2,
    cicloDias: 30,
    precoCentavos: 24900,
    interno: false,
    permissoes: [
      limite("memorial.gerar", 90, 30),
      limite("comunique-se.processar", 90, 30),
      liberada("projetos.criar"),
      liberada("memorial.audio"),
      ...ACERVO,
    ],
  },
];

export async function semearPlanos(client) {
  for (const p of PERMISSOES) {
    await client.query(
      `INSERT INTO permissao (chave, tipo, descricao) VALUES ($1, $2, $3)
       ON CONFLICT (chave) DO UPDATE SET tipo = EXCLUDED.tipo, descricao = EXCLUDED.descricao`,
      [p.chave, p.tipo, p.descricao],
    );
  }

  for (const pl of PLANOS) {
    await client.query(
      `INSERT INTO plano (chave, nome, nivel, ciclo_dias, preco_centavos, interno)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (chave) DO NOTHING`,
      [pl.chave, pl.nome, pl.nivel, pl.cicloDias, pl.precoCentavos, pl.interno],
    );

    for (const v of pl.permissoes) {
      await client.query(
        `INSERT INTO plano_permissao (plano_id, permissao_id, valor, janela_dias)
         SELECT p.id, pe.id, $3::int, $4::int
         FROM plano p, permissao pe
         WHERE p.chave = $1 AND pe.chave = $2
         ON CONFLICT DO NOTHING`,
        [pl.chave, v.chave, v.valor, v.janelaDias],
      );
    }
  }
}

export async function preencherAssinaturasExistentes(
  client,
  { planoChave = "escritorio", agora = new Date() } = {},
) {
  const { rows: planos } = await client.query("SELECT id FROM plano WHERE chave = $1", [planoChave]);
  if (planos.length === 0) {
    throw new Error(`Plano "${planoChave}" não encontrado. Rode semearPlanos antes.`);
  }

  const { rows: empresas } = await client.query(
    `SELECT e.id FROM empresa e
     LEFT JOIN assinatura a ON a.empresa_id = e.id
     WHERE a.id IS NULL`,
  );

  const venceEm = new Date(agora.getTime() + VALIDADE_EMPRESAS_EXISTENTES_DIAS * MS_POR_DIA);

  for (const empresa of empresas) {
    await client.query("BEGIN");
    try {
      const { rows } = await client.query(
        `INSERT INTO assinatura (empresa_id, inicio, status, vence_em)
         VALUES ($1, $2, 'ativa', $3) RETURNING id`,
        [empresa.id, agora, venceEm],
      );
      await client.query(
        `INSERT INTO assinatura_trecho (assinatura_id, plano_id, inicio, origem)
         VALUES ($1, $2, $3, 'suporte')`,
        [rows[0].id, planos[0].id, agora],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  return empresas.length;
}

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function readEnvFile() {
  const file = path.join(process.cwd(), ".env");
  if (!existsSync(file)) return {};

  const out = {};
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const env = { ...(await readEnvFile()), ...process.env };

  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL não encontrada (nem no ambiente, nem no .env).");
    process.exit(1);
  }

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    await semearPlanos(client);
    console.log(`Catálogo: ${PERMISSOES.length} permissões, ${PLANOS.length} planos (idempotente).`);

    const total = await preencherAssinaturasExistentes(client, {
      planoChave: args.plano ?? "escritorio",
    });
    console.log(`Empresas que ganharam assinatura: ${total}.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

`scripts/seed-planos.d.mts` (tipos pro TypeScript importar o `.mjs` sem `any` implícito):

```ts
import type { Client } from "pg";

export function semearPlanos(client: Client): Promise<void>;

export function preencherAssinaturasExistentes(
  client: Client,
  opcoes?: { planoChave?: string; agora?: Date },
): Promise<number>;
```

`src/db/__tests__/helpers/semear-catalogo.ts`:

```ts
import { Client } from "pg";

import { semearPlanos } from "../../../../scripts/seed-planos.mjs";

export async function semearCatalogoNoBancoDeTeste(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await semearPlanos(client);
  } finally {
    await client.end();
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/db/__tests__/seed-planos.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Entregar o comando de commit**

```bash
git add scripts/seed-planos.mjs scripts/seed-planos.d.mts src/db/__tests__
git commit -m "feat(planos): seed de catalogo e planos com preenchimento das empresas existentes"
```

---

### Task 5: Queries de assinatura

**Files:**
- Create: `src/db/queries/assinatura.ts`
- Test: `src/db/queries/__tests__/assinatura.test.ts`

**Interfaces:**
- Consumes: `MS_POR_DIA` de `@/lib/permissoes/janela`; `StatusAssinatura` do schema; `semearCatalogoNoBancoDeTeste` (só nos testes).
- Produces:
  - `type Executor = Pick<typeof db, "select" | "insert">` (aceita `db` ou a `tx` de uma transação).
  - `criarAssinatura(executor: Executor, input: { empresaId: string; planoChave: string; status: StatusAssinatura; origem: "autoatendimento" | "suporte"; inicio?: Date; venceEm?: Date }): Promise<{ id: string }>` — `inicio` padrão = agora; `venceEm` padrão = `inicio + plano.cicloDias`; lança `Error` se o plano não existe.
  - `criarAssinaturaTrial(executor: Executor, empresaId: string, agora?: Date): Promise<{ id: string }>`.
  - `interface AssinaturaVigente { id: string; inicio: Date; status: StatusAssinatura; venceEm: Date; planoId: string; planoChave: string }`.
  - `buscarAssinaturaVigente(empresaId: string): Promise<AssinaturaVigente | null>`.

- [ ] **Step 1: Escrever o teste que falha**

`src/db/queries/__tests__/assinatura.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { empresa } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { semearCatalogoNoBancoDeTeste } from "../../__tests__/helpers/semear-catalogo";
import { buscarAssinaturaVigente, criarAssinatura, criarAssinaturaTrial } from "../assinatura";

const AGORA = new Date("2026-06-15T12:00:00Z");

async function limparBanco() {
  await db.delete(empresa);
}

async function novaEmpresa() {
  const [criada] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  return criada.id;
}

describe("assinatura", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("criarAssinatura grava assinatura e trecho vigente, com vencimento pelo ciclo do plano", async () => {
    const empresaId = await novaEmpresa();

    await criarAssinatura(db, {
      empresaId,
      planoChave: "essencial",
      status: "ativa",
      origem: "autoatendimento",
      inicio: AGORA,
    });

    const vigente = await buscarAssinaturaVigente(empresaId);
    expect(vigente?.planoChave).toBe("essencial");
    expect(vigente?.status).toBe("ativa");
    expect(vigente?.inicio).toEqual(AGORA);
    expect(vigente?.venceEm).toEqual(new Date(AGORA.getTime() + 30 * MS_POR_DIA));
  });

  it("criarAssinaturaTrial usa o plano trial e vence em 14 dias", async () => {
    const empresaId = await novaEmpresa();

    await criarAssinaturaTrial(db, empresaId, AGORA);

    const vigente = await buscarAssinaturaVigente(empresaId);
    expect(vigente?.planoChave).toBe("trial");
    expect(vigente?.status).toBe("trial");
    expect(vigente?.venceEm).toEqual(new Date(AGORA.getTime() + 14 * MS_POR_DIA));
  });

  it("buscarAssinaturaVigente devolve null para empresa sem assinatura", async () => {
    const empresaId = await novaEmpresa();

    expect(await buscarAssinaturaVigente(empresaId)).toBeNull();
  });

  it("lança erro claro quando o plano não existe", async () => {
    const empresaId = await novaEmpresa();

    await expect(
      criarAssinatura(db, {
        empresaId,
        planoChave: "nao-existe",
        status: "ativa",
        origem: "suporte",
      }),
    ).rejects.toThrow('Plano "nao-existe" não encontrado');
  });

  it("rejeita uma segunda assinatura para a mesma empresa", async () => {
    const empresaId = await novaEmpresa();
    await criarAssinaturaTrial(db, empresaId, AGORA);

    await expect(criarAssinaturaTrial(db, empresaId, AGORA)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/db/queries/__tests__/assinatura.test.ts`
Expected: FAIL (`Cannot find module '../assinatura'`).

- [ ] **Step 3: Implementar**

`src/db/queries/assinatura.ts`:

```ts
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { assinatura, assinaturaTrecho, plano, type StatusAssinatura } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";

export type Executor = Pick<typeof db, "select" | "insert">;

export interface CriarAssinaturaInput {
  empresaId: string;
  planoChave: string;
  status: StatusAssinatura;
  origem: "autoatendimento" | "suporte";
  inicio?: Date;
  venceEm?: Date;
}

export async function criarAssinatura(
  executor: Executor,
  { empresaId, planoChave, status, origem, inicio = new Date(), venceEm }: CriarAssinaturaInput,
): Promise<{ id: string }> {
  const [planoEncontrado] = await executor
    .select({ id: plano.id, cicloDias: plano.cicloDias })
    .from(plano)
    .where(eq(plano.chave, planoChave))
    .limit(1);

  if (!planoEncontrado) {
    throw new Error(`Plano "${planoChave}" não encontrado. Rode "node scripts/seed-planos.mjs".`);
  }

  const [nova] = await executor
    .insert(assinatura)
    .values({
      empresaId,
      inicio,
      status,
      venceEm: venceEm ?? new Date(inicio.getTime() + planoEncontrado.cicloDias * MS_POR_DIA),
    })
    .returning({ id: assinatura.id });

  await executor
    .insert(assinaturaTrecho)
    .values({ assinaturaId: nova.id, planoId: planoEncontrado.id, inicio, origem });

  return nova;
}

export function criarAssinaturaTrial(
  executor: Executor,
  empresaId: string,
  agora: Date = new Date(),
): Promise<{ id: string }> {
  return criarAssinatura(executor, {
    empresaId,
    planoChave: "trial",
    status: "trial",
    origem: "autoatendimento",
    inicio: agora,
  });
}

export interface AssinaturaVigente {
  id: string;
  inicio: Date;
  status: StatusAssinatura;
  venceEm: Date;
  planoId: string;
  planoChave: string;
}

export async function buscarAssinaturaVigente(empresaId: string): Promise<AssinaturaVigente | null> {
  const [linha] = await db
    .select({
      id: assinatura.id,
      inicio: assinatura.inicio,
      status: assinatura.status,
      venceEm: assinatura.venceEm,
      planoId: plano.id,
      planoChave: plano.chave,
    })
    .from(assinatura)
    .innerJoin(
      assinaturaTrecho,
      and(eq(assinaturaTrecho.assinaturaId, assinatura.id), isNull(assinaturaTrecho.fim)),
    )
    .innerJoin(plano, eq(plano.id, assinaturaTrecho.planoId))
    .where(eq(assinatura.empresaId, empresaId))
    .limit(1);

  return linha ?? null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/db/queries/__tests__/assinatura.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Entregar o comando de commit**

```bash
git add src/db/queries/assinatura.ts src/db/queries/__tests__/assinatura.test.ts
git commit -m "feat(planos): queries de assinatura e trial"
```

---

### Task 6: Queries de permissão e consumo + `verificarPermissao`

**Files:**
- Create: `src/db/queries/permissao.ts`, `src/db/queries/consumo.ts`, `src/lib/permissoes/verificar-permissao.ts`
- Test: `src/lib/permissoes/__tests__/verificar-permissao.test.ts`

**Interfaces:**
- Consumes: `buscarAssinaturaVigente`, `criarAssinatura` (Task 5); `calcularJanela`, `Janela`, `MS_POR_DIA` (Task 2); `derivarStatus` (Task 3).
- Produces:
  - `src/db/queries/permissao.ts`: `buscarPermissaoPorChave(chave): Promise<{ id: string; tipo: "booleana" | "limite" } | null>`; `buscarPlanoPorChave(chave): Promise<{ id: string } | null>`; `buscarSobrescrita(empresaId, permissaoId, agora): Promise<{ valor: number | null; janelaDias: number | null; inicio: Date } | null>`; `buscarVinculoDoPlano(planoId, permissaoId): Promise<{ valor: number | null; janelaDias: number | null } | null>`; `somarConsumo(empresaId, permissaoId, inicio: Date, fim: Date): Promise<number>`.
  - `src/db/queries/consumo.ts`: `registrarConsumo(empresaId: string, chave: string, referencia: string, opcoes?: { quantidade?: number; agora?: Date }): Promise<boolean>` (`false` quando a referência já tinha sido registrada).
  - `src/lib/permissoes/verificar-permissao.ts`: `interface ResultadoPermissao { permitido: boolean; limite: number | null; usado: number; restante: number | null; janela: Janela | null }`; `verificarPermissao(empresaId: string, chave: string, agora?: Date): Promise<ResultadoPermissao>`.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/permissoes/__tests__/verificar-permissao.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { empresa, empresaPermissao, permissao } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { MS_POR_DIA } from "../janela";
import { verificarPermissao } from "../verificar-permissao";

const AGORA = new Date("2026-06-15T12:00:00Z");
const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

async function limparBanco() {
  await db.delete(empresa);
}

async function novaEmpresa() {
  const [criada] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  return criada.id;
}

async function assinar(
  empresaId: string,
  planoChave: string,
  opcoes: { status?: "trial" | "ativa" | "cancelada"; inicio?: Date; venceEm?: Date } = {},
) {
  await criarAssinatura(db, {
    empresaId,
    planoChave,
    status: opcoes.status ?? "ativa",
    origem: "suporte",
    inicio: opcoes.inicio ?? AGORA,
    venceEm: opcoes.venceEm ?? emDias(30),
  });
}

async function idDaPermissao(chave: string) {
  const [linha] = await db.select({ id: permissao.id }).from(permissao).where(eq(permissao.chave, chave));
  return linha.id;
}

describe("verificarPermissao", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("nega quando a empresa não tem assinatura", async () => {
    const empresaId = await novaEmpresa();

    const resultado = await verificarPermissao(empresaId, "memorial.gerar", AGORA);

    expect(resultado.permitido).toBe(false);
  });

  it("lança erro para uma chave que não existe no catálogo", async () => {
    const empresaId = await novaEmpresa();

    await expect(verificarPermissao(empresaId, "nao.existe", AGORA)).rejects.toThrow(
      'Permissão desconhecida: "nao.existe"',
    );
  });

  it("limite: mostra o que resta e a janela, e bloqueia ao esgotar", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "trial", { status: "trial", venceEm: emDias(14) });

    const antes = await verificarPermissao(empresaId, "memorial.gerar", AGORA);
    expect(antes).toMatchObject({ permitido: true, limite: 3, usado: 0, restante: 3 });
    expect(antes.janela).toEqual({ inicio: AGORA, fim: emDias(14) });

    for (const referencia of ["a", "b", "c"]) {
      await registrarConsumo(empresaId, "memorial.gerar", referencia, { agora: AGORA });
    }

    const depois = await verificarPermissao(empresaId, "memorial.gerar", AGORA);
    expect(depois).toMatchObject({ permitido: false, usado: 3, restante: 0 });
  });

  it("limite: consumo de uma janela anterior não conta na atual", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "essencial", { inicio: emDias(-40), venceEm: emDias(100) });

    await registrarConsumo(empresaId, "memorial.gerar", "velho-1", { agora: emDias(-35) });
    await registrarConsumo(empresaId, "memorial.gerar", "velho-2", { agora: emDias(-35) });
    await registrarConsumo(empresaId, "memorial.gerar", "novo-1", { agora: emDias(-2) });

    const resultado = await verificarPermissao(empresaId, "memorial.gerar", AGORA);

    expect(resultado).toMatchObject({ permitido: true, limite: 20, usado: 1, restante: 19 });
    expect(resultado.janela).toEqual({ inicio: emDias(-10), fim: emDias(20) });
  });

  it("limite sem valor é ilimitado", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "escritorio");

    const resultado = await verificarPermissao(empresaId, "projetos.criar", AGORA);

    expect(resultado).toEqual({ permitido: true, limite: null, usado: 0, restante: null, janela: null });
  });

  it("booleana: concede ou nega conforme o plano", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "trial", { status: "trial", venceEm: emDias(14) });

    expect((await verificarPermissao(empresaId, "memorial.audio", AGORA)).permitido).toBe(true);
  });

  it("carência: ainda usa o plano normal", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "essencial", { venceEm: emDias(-2) });

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).permitido).toBe(true);
  });

  it("suspensa: resolve pelo plano suspenso (só lista o acervo)", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "escritorio", { venceEm: emDias(-10) });

    expect((await verificarPermissao(empresaId, "acervo.listar", AGORA)).permitido).toBe(true);
    expect((await verificarPermissao(empresaId, "acervo.abrir", AGORA)).permitido).toBe(false);
    expect((await verificarPermissao(empresaId, "acervo.baixar", AGORA)).permitido).toBe(false);
    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).permitido).toBe(false);
  });

  it("sobrescrita da empresa vence o plano e usa o próprio início como âncora", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "trial", { status: "trial", venceEm: emDias(14) });
    await db.insert(empresaPermissao).values({
      empresaId,
      permissaoId: await idDaPermissao("memorial.gerar"),
      valor: 50,
      janelaDias: 30,
      inicio: emDias(-1),
      motivo: "piloto",
    });

    const resultado = await verificarPermissao(empresaId, "memorial.gerar", AGORA);

    expect(resultado).toMatchObject({ permitido: true, limite: 50, restante: 50 });
    expect(resultado.janela).toEqual({ inicio: emDias(-1), fim: emDias(29) });
  });

  it("sobrescrita expirada ou ainda não iniciada é ignorada", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "trial", { status: "trial", venceEm: emDias(14) });
    const permissaoId = await idDaPermissao("memorial.gerar");
    await db.insert(empresaPermissao).values({
      empresaId,
      permissaoId,
      valor: 50,
      janelaDias: 30,
      inicio: emDias(-10),
      expiraEm: emDias(-1),
    });

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).limite).toBe(3);

    await db
      .update(empresaPermissao)
      .set({ inicio: emDias(5), expiraEm: null })
      .where(eq(empresaPermissao.empresaId, empresaId));

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).limite).toBe(3);
  });

  it("sobrescrita também vale para empresa suspensa", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "escritorio", { venceEm: emDias(-10) });
    await db.insert(empresaPermissao).values({
      empresaId,
      permissaoId: await idDaPermissao("memorial.gerar"),
      valor: 5,
      janelaDias: 30,
      inicio: emDias(-1),
    });

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).permitido).toBe(true);
  });
});

describe("registrarConsumo", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("é idempotente por referência", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "essencial");

    const primeira = await registrarConsumo(empresaId, "memorial.gerar", "item-1", { agora: AGORA });
    const repetida = await registrarConsumo(empresaId, "memorial.gerar", "item-1", { agora: AGORA });

    expect(primeira).toBe(true);
    expect(repetida).toBe(false);
    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).usado).toBe(1);
  });

  it("soma a quantidade informada", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "essencial");

    await registrarConsumo(empresaId, "memorial.gerar", "item-1", { quantidade: 3, agora: AGORA });

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).usado).toBe(3);
  });

  it("lança erro para uma chave desconhecida", async () => {
    const empresaId = await novaEmpresa();

    await expect(registrarConsumo(empresaId, "nao.existe", "x")).rejects.toThrow(
      'Permissão desconhecida: "nao.existe"',
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/permissoes/__tests__/verificar-permissao.test.ts`
Expected: FAIL (`Failed to resolve import "@/db/queries/consumo"`).

- [ ] **Step 3: Implementar as queries**

`src/db/queries/permissao.ts`:

```ts
import { and, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { consumo, empresaPermissao, permissao, plano, planoPermissao } from "@/db/schema";

export async function buscarPermissaoPorChave(chave: string) {
  const [linha] = await db
    .select({ id: permissao.id, tipo: permissao.tipo })
    .from(permissao)
    .where(eq(permissao.chave, chave))
    .limit(1);

  return linha ?? null;
}

export async function buscarPlanoPorChave(chave: string) {
  const [linha] = await db.select({ id: plano.id }).from(plano).where(eq(plano.chave, chave)).limit(1);

  return linha ?? null;
}

export async function buscarSobrescrita(empresaId: string, permissaoId: string, agora: Date) {
  const [linha] = await db
    .select({
      valor: empresaPermissao.valor,
      janelaDias: empresaPermissao.janelaDias,
      inicio: empresaPermissao.inicio,
    })
    .from(empresaPermissao)
    .where(
      and(
        eq(empresaPermissao.empresaId, empresaId),
        eq(empresaPermissao.permissaoId, permissaoId),
        lte(empresaPermissao.inicio, agora),
        or(isNull(empresaPermissao.expiraEm), gt(empresaPermissao.expiraEm, agora)),
      ),
    )
    .limit(1);

  return linha ?? null;
}

export async function buscarVinculoDoPlano(planoId: string, permissaoId: string) {
  const [linha] = await db
    .select({ valor: planoPermissao.valor, janelaDias: planoPermissao.janelaDias })
    .from(planoPermissao)
    .where(and(eq(planoPermissao.planoId, planoId), eq(planoPermissao.permissaoId, permissaoId)))
    .limit(1);

  return linha ?? null;
}

export async function somarConsumo(
  empresaId: string,
  permissaoId: string,
  inicio: Date,
  fim: Date,
): Promise<number> {
  const [linha] = await db
    .select({ total: sql<number>`coalesce(sum(${consumo.quantidade}), 0)::int` })
    .from(consumo)
    .where(
      and(
        eq(consumo.empresaId, empresaId),
        eq(consumo.permissaoId, permissaoId),
        gte(consumo.ocorridoEm, inicio),
        lt(consumo.ocorridoEm, fim),
      ),
    );

  return linha.total;
}
```

`src/db/queries/consumo.ts`:

```ts
import { db } from "@/db";
import { consumo } from "@/db/schema";
import { buscarPermissaoPorChave } from "./permissao";

export async function registrarConsumo(
  empresaId: string,
  chave: string,
  referencia: string,
  { quantidade = 1, agora = new Date() }: { quantidade?: number; agora?: Date } = {},
): Promise<boolean> {
  const permissaoEncontrada = await buscarPermissaoPorChave(chave);
  if (!permissaoEncontrada) throw new Error(`Permissão desconhecida: "${chave}".`);

  const inseridos = await db
    .insert(consumo)
    .values({
      empresaId,
      permissaoId: permissaoEncontrada.id,
      quantidade,
      ocorridoEm: agora,
      referencia,
    })
    .onConflictDoNothing()
    .returning({ id: consumo.id });

  return inseridos.length > 0;
}
```

- [ ] **Step 4: Implementar `verificarPermissao`**

`src/lib/permissoes/verificar-permissao.ts`:

```ts
import { buscarAssinaturaVigente } from "@/db/queries/assinatura";
import {
  buscarPermissaoPorChave,
  buscarPlanoPorChave,
  buscarSobrescrita,
  buscarVinculoDoPlano,
  somarConsumo,
} from "@/db/queries/permissao";
import { calcularJanela, type Janela } from "./janela";
import { derivarStatus } from "./status-assinatura";

const PLANO_SUSPENSO = "suspenso";

export interface ResultadoPermissao {
  permitido: boolean;
  limite: number | null;
  usado: number;
  restante: number | null;
  janela: Janela | null;
}

const NEGADA: ResultadoPermissao = {
  permitido: false,
  limite: null,
  usado: 0,
  restante: null,
  janela: null,
};

interface Concessao {
  valor: number | null;
  janelaDias: number | null;
  ancora: Date;
}

async function resolverConcessao(
  empresaId: string,
  permissaoId: string,
  agora: Date,
): Promise<Concessao | null> {
  const sobrescrita = await buscarSobrescrita(empresaId, permissaoId, agora);
  if (sobrescrita) {
    return { valor: sobrescrita.valor, janelaDias: sobrescrita.janelaDias, ancora: sobrescrita.inicio };
  }

  const assinatura = await buscarAssinaturaVigente(empresaId);
  if (!assinatura) return null;

  let planoId = assinatura.planoId;
  if (derivarStatus(assinatura, agora) === "suspensa") {
    const suspenso = await buscarPlanoPorChave(PLANO_SUSPENSO);
    if (!suspenso) {
      throw new Error(`Plano "${PLANO_SUSPENSO}" não encontrado. Rode "node scripts/seed-planos.mjs".`);
    }
    planoId = suspenso.id;
  }

  const vinculo = await buscarVinculoDoPlano(planoId, permissaoId);
  if (!vinculo) return null;

  return { valor: vinculo.valor, janelaDias: vinculo.janelaDias, ancora: assinatura.inicio };
}

export async function verificarPermissao(
  empresaId: string,
  chave: string,
  agora: Date = new Date(),
): Promise<ResultadoPermissao> {
  const permissao = await buscarPermissaoPorChave(chave);
  if (!permissao) throw new Error(`Permissão desconhecida: "${chave}".`);

  const concessao = await resolverConcessao(empresaId, permissao.id, agora);
  if (!concessao) return NEGADA;

  if (concessao.valor === null || concessao.janelaDias === null) {
    return { permitido: true, limite: null, usado: 0, restante: null, janela: null };
  }

  const janela = calcularJanela(concessao.ancora, concessao.janelaDias, agora);
  const usado = await somarConsumo(empresaId, permissao.id, janela.inicio, janela.fim);
  const restante = Math.max(0, concessao.valor - usado);

  return { permitido: restante > 0, limite: concessao.valor, usado, restante, janela };
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/permissoes/__tests__/verificar-permissao.test.ts`
Expected: PASS (13 testes).

- [ ] **Step 6: Entregar o comando de commit**

```bash
git add src/db/queries/permissao.ts src/db/queries/consumo.ts src/lib/permissoes/verificar-permissao.ts src/lib/permissoes/__tests__/verificar-permissao.test.ts
git commit -m "feat(planos): verificarPermissao e registro de consumo"
```

---

### Task 7: Trial no cadastro e seed no start do container

**Files:**
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/api/auth/register/__tests__/route.test.ts`
- Modify: `docker-entrypoint.sh`

**Interfaces:**
- Consumes: `criarAssinaturaTrial(executor, empresaId)` (Task 5), `semearCatalogoNoBancoDeTeste` (Task 4), `buscarAssinaturaVigente` (Task 5).

- [ ] **Step 1: Escrever o teste que falha**

Em `src/app/api/auth/register/__tests__/route.test.ts`:

1. Trocar a primeira linha de import por:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
```

2. Acrescentar os imports abaixo dos já existentes:

```ts
import { buscarAssinaturaVigente } from "@/db/queries/assinatura";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
```

3. Dentro de `describe("POST /api/auth/register", () => {`, antes do `beforeEach(limparBanco);`, acrescentar:

```ts
  beforeAll(semearCatalogoNoBancoDeTeste);
```

4. Acrescentar este teste dentro do mesmo `describe`, logo depois do primeiro `it`:

```ts
  it("cria uma assinatura de trial para a empresa nova", async () => {
    await POST(criarRequest(payloadValido));

    const [empresaCriada] = await db.select().from(empresa);
    const vigente = await buscarAssinaturaVigente(empresaCriada.id);

    expect(vigente?.planoChave).toBe("trial");
    expect(vigente?.status).toBe("trial");
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/api/auth/register`
Expected: FAIL só no teste novo (`vigente` é `null`).

- [ ] **Step 3: Implementar no cadastro**

Em `src/app/api/auth/register/route.ts`, acrescentar o import:

```ts
import { criarAssinaturaTrial } from "@/db/queries/assinatura";
```

e, dentro de `db.transaction`, logo depois de criar a empresa, inserir a chamada:

```ts
        const [novaEmpresa] = await tx.insert(empresa).values({ nome: nomeEmpresa }).returning();
        await criarAssinaturaTrial(tx, novaEmpresa.id);
        const [criado] = await tx
```

(as linhas `const [criado] = await tx ...` seguintes ficam como estão).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/api/auth/register`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Rodar o seed no start do container**

Em `docker-entrypoint.sh`, logo depois da linha `node scripts/seed-usuario.mjs || true`, acrescentar:

```sh

echo "==> Semeando planos e permissoes (idempotente)"
node scripts/seed-planos.mjs
```

Sem `|| true`: o `set -e` do script derruba o container se o seed falhar, porque o cadastro depende do plano `trial` existir. A ordem importa: o seed de usuário vem antes para que a empresa do usuário de teste também receba assinatura.

- [ ] **Step 6: Entregar o comando de commit**

```bash
git add src/app/api/auth/register docker-entrypoint.sh
git commit -m "feat(planos): trial no cadastro e seed de planos no start do container"
```

---

### Task 8: Verificação final e seed no banco de dev

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npm test`
Expected: tudo PASS, incluindo os testes anteriores à Fase 1 (nenhuma regressão).

- [ ] **Step 2: Lint e tipos**

Run: `npm run lint`
Expected: sem erros novos.

Run: `npx tsc --noEmit`
Expected: sem erros (em particular, o import de `scripts/seed-planos.mjs` nos testes resolve pelo `.d.mts`).

- [ ] **Step 3: Semear o banco de dev**

Run: `node scripts/seed-planos.mjs`
Expected:

```text
Catálogo: 7 permissões, 4 planos (idempotente).
Empresas que ganharam assinatura: <N>.
```

`<N>` é o número de empresas de dev que não tinham assinatura (cada uma entra no plano `escritorio`, `ativa`, vencendo em 360 dias, origem `suporte`).

- [ ] **Step 4: Conferir a resolução na mão**

Run:

```bash
node -e "const {Client}=require('pg');require('dotenv').config();(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const r=await c.query(\"SELECT e.nome, p.chave AS plano, a.status, a.vence_em FROM assinatura a JOIN empresa e ON e.id=a.empresa_id JOIN assinatura_trecho t ON t.assinatura_id=a.id AND t.fim IS NULL JOIN plano p ON p.id=t.plano_id\");console.table(r.rows);await c.end()})()"
```

Expected: uma linha por empresa, todas com `plano = escritorio` e `status = ativa`.

- [ ] **Step 5: Rodar o seed uma segunda vez**

Run: `node scripts/seed-planos.mjs`
Expected: `Empresas que ganharam assinatura: 0.` (idempotente).

- [ ] **Step 6: Registrar os pontos em aberto para a Fase 2**

Sem código. Anotar para o Victor, no resumo final:

- Nenhum ponto de uso consulta `verificarPermissao` ainda; a Fase 2 aplica o bloqueio.
- **Antes de ligar o bloqueio na Fase 2:** o trial dura 14 dias e a Fase 4 (renovação) ainda não existe. Sem uma forma de pagar, quem passar do trial cai em leitura limitada sem saída. Na Fase 2, definir se o suporte estende `vence_em` na mão ou se o trial ganha duração maior até o pagamento existir.
- Os valores do seed (preços 9900/24900, limites 20/90, trial de 3 documentos em 14 dias) são provisórios.
