# Planos e permissões — Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar `verificarPermissao` nos pontos de uso que gastam IA ou definem limite (projetos, memoriais, Comunique-se), mostrar o uso ao cliente e dar ao suporte um script para ajustar o plano de uma empresa.

**Architecture:** Um helper `exigirPermissao` devolve o 403 padronizado (ou `null`) e é chamado nas rotas de API antes do trabalho caro; o consumo é registrado só no sucesso. Um endpoint `GET /api/permissoes` + hook React Query alimentam um cabeçalho de uso nos módulos. A lógica de texto/estado da interface vive em funções puras testáveis (o projeto não tem jsdom). O suporte usa `scripts/admin-plano.mjs`, em `.mjs` como os outros scripts (não há `tsx`).

**Tech Stack:** Next.js (App Router), Drizzle + Postgres, React Query, Vitest com banco real `docobra-local-test`, scripts Node `.mjs` com `pg`.

Spec: `docs/superpowers/specs/2026-10-22-planos-fase-2-design.md`. Fase 1 (já na `main`): `docs/superpowers/plans/2026-10-05-planos-fase-1.md`.

## Global Constraints

- Executar numa branch própria a partir da `main` (ex.: `feat/planos-fase-2`). **Nunca commitar na `main`, nunca dar push nem merge sem o Victor pedir.** Os commits dos passos "Commit" são na branch de feature e terminam com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (texto literal, como parágrafo final).
- Schema aplicado com `npm run db:push` (dev) e `set -a; . ./.env.test; set +a; npx drizzle-kit push` (teste). Não existe pasta `drizzle/`. O `drizzle-kit push` recria algumas constraints (PKs compostas, `consumo_referencia_unica`) a cada execução e aplica sem pedir confirmação; isso é conhecido e não é falha.
- Testes de integração rodam contra `docobra-local-test`; `fileParallelism: false`; **nunca rodar duas execuções de teste ao mesmo tempo** (banco compartilhado).
- Comentário só quando o PORQUÊ não é óbvio. Sem abstração além do que a tarefa pede. Nomes de domínio em português, imports com alias `@/`, uma tabela por arquivo de schema.
- Contrato de bloqueio (verbatim do spec): HTTP 403 com corpo `{ error: string, codigo: "LIMITE_ATINGIDO" | "PERMISSAO_NEGADA", permissao: string, renovaEm: string | null }`. `renovaEm` = fim da janela atual em ISO 8601, ou `null` quando não há janela. `LIMITE_ATINGIDO` quando um limite esgotou; `PERMISSAO_NEGADA` quando a permissão não está no plano.
- Permissões checadas (somente estas quatro): `memorial.gerar`, `comunique-se.processar`, `projetos.criar`, `memorial.audio`. As de acervo (`acervo.*`) **não** são checadas nesta fase.
- Consumo registrado só no sucesso, com o ID do item criado como referência. Comunique-se criado à mão ou reimportado do modelo exportado (PDF com checklist embutido) **não** checa nem consome. Apagar projeto não devolve cota.
- Variáveis de ambiente novas: `ASSINATURA_SUSPENSAO_ATIVA` (padrão `false`; com `false` nunca se troca para o plano `suspenso`) e `SUPORTE_EMAIL` (sem padrão; o botão de contato só aparece se estiver definida).
- Ajuste do suporte **mantém o dia 0 e o consumo** ao trocar de plano; não gera cobrança.
- Fora desta fase: pagamento/billing, permissões de acervo, tela de admin, papéis de usuário, o comportamento do `drizzle-kit push`.
- O projeto não tem `jsdom`/Testing Library: **não adicionar**. Componentes React são finos e verificados no navegador (Task 13); a lógica testável fica em funções puras.

## File Structure

Criar:
- `src/lib/permissoes/permissoes-de-uso.ts` — as 4 chaves, tipo e rótulos.
- `src/lib/permissoes/exigir-permissao.ts` — helper do 403 padronizado.
- `src/lib/permissoes/permissoes-da-empresa.ts` — resultado serializável das 4 permissões de uma empresa.
- `src/lib/permissoes/descrever-uso.ts` — estado/texto do cabeçalho de uso e `mailto` do suporte (puro).
- `src/lib/permissoes/contexto-de-planos.ts` — junta permissões + dados de contato para as páginas.
- `src/app/api/permissoes/route.ts` — `GET /api/permissoes`.
- `src/hooks/use-permissoes.ts` — `usePermissoes` e `usePermissaoDeUso`.
- `src/components/common/uso-do-modulo.tsx` — cabeçalho de uso.
- `scripts/admin-plano.mjs` (+ `.d.mts`) — ajuste manual pelo suporte.
- Testes ao lado de cada um (ver cada task).

Modificar: `src/db/schema/plano-permissao.ts`, `src/db/schema/empresa-permissao.ts`, `scripts/seed-planos.mjs` (+ `.d.mts`), `scripts/seed-usuario.mjs`, `docker-entrypoint.sh`, `src/lib/permissoes/verificar-permissao.ts`, as rotas `projetos`, `memoriais`, `memoriais/[id]/retry`, `comunique-se`, `comunique-se/[id]/retry`, os 5 hooks de mutação, as páginas `dashboard/{memorial,comunique-se,projetos}/page.tsx`, os componentes `novo-memorial-drawer`, `novo-memorial-form`, `novo-comunique-se-drawer`, `novo-projeto-dialog`, `.env.example`, `package.json`.

---

### Task 1: `CHECK (janela_dias > 0)` nas tabelas de vínculo

**Files:**
- Modify: `src/db/schema/plano-permissao.ts`, `src/db/schema/empresa-permissao.ts`
- Test: `src/db/__tests__/schema-permissoes.test.ts`

**Interfaces:**
- Produces: constraints `plano_permissao_janela_positiva` e `empresa_permissao_janela_positiva` no banco (nenhuma assinatura TypeScript muda).

- [ ] **Step 1: Escrever os testes que falham**

Em `src/db/__tests__/schema-permissoes.test.ts`, acrescentar `empresaPermissao` à lista de imports de `@/db/schema` e estes dois testes dentro do `describe("schema de permissões", ...)`:

```ts
  it("rejeita janela do vínculo do plano igual a zero", async () => {
    const { novaPermissao, novoPlano } = await criarBase();

    await expect(
      db.insert(planoPermissao).values({
        planoId: novoPlano.id,
        permissaoId: novaPermissao.id,
        valor: 5,
        janelaDias: 0,
      }),
    ).rejects.toThrow();
  });

  it("rejeita janela da sobrescrita da empresa igual a zero", async () => {
    const { novaEmpresa, novaPermissao } = await criarBase();

    await expect(
      db.insert(empresaPermissao).values({
        empresaId: novaEmpresa.id,
        permissaoId: novaPermissao.id,
        valor: 5,
        janelaDias: 0,
      }),
    ).rejects.toThrow();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/db/__tests__/schema-permissoes.test.ts`
Expected: os 2 testes novos FALHAM (o insert com `janelaDias: 0` ainda é aceito); os 4 anteriores passam.

- [ ] **Step 3: Implementar**

Em `src/db/schema/plano-permissao.ts`, logo depois do `check("plano_permissao_valor_janela", ...)`, dentro do array de constraints, acrescentar:

```ts
    check("plano_permissao_janela_positiva", sql`${table.janelaDias} is null or ${table.janelaDias} > 0`),
```

Em `src/db/schema/empresa-permissao.ts`, logo depois do `check("empresa_permissao_valor_janela", ...)`, acrescentar:

```ts
    check("empresa_permissao_janela_positiva", sql`${table.janelaDias} is null or ${table.janelaDias} > 0`),
```

- [ ] **Step 4: Aplicar o schema no dev e no teste**

Run (dev): `npm run db:push`
Run (teste, Git Bash): `set -a; . ./.env.test; set +a; npx drizzle-kit push`
Expected: ambos terminam com `[✓] Changes applied` (as duas constraints novas entram; recriações de PK/unique que aparecerem são o comportamento conhecido).

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/db/__tests__/schema-permissoes.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/plano-permissao.ts src/db/schema/empresa-permissao.ts src/db/__tests__/schema-permissoes.test.ts
git commit -m "feat(planos): janela dos vinculos deve ser positiva"
```

---

### Task 2: Backfill do seed só com flag e à prova de corrida

**Files:**
- Modify (reescrever inteiro): `scripts/seed-planos.mjs`, `scripts/seed-planos.d.mts`
- Test: `src/db/__tests__/seed-planos.test.ts`

**Interfaces:**
- Produces (`scripts/seed-planos.mjs`):
  - `semearPlanos(client: pg.Client): Promise<void>` (inalterada);
  - `criarAssinaturaInicial(client: pg.Client, opcoes: { empresaId: string; planoChave?: string; agora?: Date }): Promise<boolean>` — cria assinatura `ativa` (vence em 360 dias) + trecho vigente de origem `suporte`; devolve `false` e não faz nada se a empresa já tem assinatura; lança `Error` se o plano não existe; **não abre transação** (o chamador decide);
  - `preencherAssinaturasExistentes(client, opcoes?: { planoChave?: string; agora?: Date }): Promise<number>` — chama `criarAssinaturaInicial` por empresa sem assinatura, cada uma em sua transação; devolve quantas foram criadas;
  - `lerOpcoes(argv: string[]): { planoChave: string; preencherExistentes: boolean }`.
- O `main` só preenche empresas existentes com `--preencher-existentes`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/db/__tests__/seed-planos.test.ts`, trocar a linha de import do script por:

```ts
import {
  criarAssinaturaInicial,
  lerOpcoes,
  preencherAssinaturasExistentes,
  semearPlanos,
} from "../../../scripts/seed-planos.mjs";
```

e acrescentar, no fim do arquivo, estes blocos:

```ts
describe("lerOpcoes", () => {
  it("por padrão não preenche empresas existentes e usa o plano escritorio", () => {
    expect(lerOpcoes([])).toEqual({ planoChave: "escritorio", preencherExistentes: false });
  });

  it("lê --preencher-existentes e --plano", () => {
    expect(lerOpcoes(["--preencher-existentes", "--plano=essencial"])).toEqual({
      planoChave: "essencial",
      preencherExistentes: true,
    });
  });
});

describe("criarAssinaturaInicial", () => {
  it("devolve false e não duplica quando a empresa já tem assinatura", async () => {
    await semearPlanos(client);
    const [nova] = await db.insert(empresa).values({ nome: "Com Assinatura" }).returning();

    expect(await criarAssinaturaInicial(client, { empresaId: nova.id })).toBe(true);
    expect(await criarAssinaturaInicial(client, { empresaId: nova.id })).toBe(false);

    const assinaturas = await db.select().from(assinatura).where(eq(assinatura.empresaId, nova.id));
    expect(assinaturas).toHaveLength(1);
    const trechos = await db
      .select()
      .from(assinaturaTrecho)
      .where(eq(assinaturaTrecho.assinaturaId, assinaturas[0].id));
    expect(trechos).toHaveLength(1);
  });

  it("lança erro claro quando o plano não existe", async () => {
    const [nova] = await db.insert(empresa).values({ nome: "Sem Plano" }).returning();

    await expect(
      criarAssinaturaInicial(client, { empresaId: nova.id, planoChave: "nao-existe" }),
    ).rejects.toThrow('Plano "nao-existe" não encontrado');
  });
});

describe("preencherAssinaturasExistentes (concorrência)", () => {
  it("duas execuções simultâneas não quebram nem duplicam", async () => {
    await semearPlanos(client);
    await db
      .insert(empresa)
      .values([{ nome: "A" }, { nome: "B" }, { nome: "C" }, { nome: "D" }, { nome: "E" }]);
    const outro = new Client({ connectionString: process.env.DATABASE_URL });
    await outro.connect();

    try {
      const [a, b] = await Promise.all([
        preencherAssinaturasExistentes(client),
        preencherAssinaturasExistentes(outro),
      ]);
      expect(a + b).toBe(5);
    } finally {
      await outro.end();
    }

    expect(await db.select().from(assinatura)).toHaveLength(5);
    expect(await db.select().from(assinaturaTrecho)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/db/__tests__/seed-planos.test.ts`
Expected: FAIL (`criarAssinaturaInicial`/`lerOpcoes` não existem no módulo).

- [ ] **Step 3: Reescrever `scripts/seed-planos.mjs`**

Substituir o arquivo inteiro por:

```js
#!/usr/bin/env node
/**
 * Semeia o catálogo de permissões e os planos. Idempotente.
 *
 * Os valores abaixo (preços, limites, trial) são PROVISÓRIOS.
 *
 * Planos e vínculos só são inseridos (ON CONFLICT DO NOTHING): rodar o seed de
 * novo não desfaz um preço ou limite que foi ajustado no banco depois.
 * Permissões são atualizadas (descrição/tipo), pois são catálogo de código.
 *
 * Empresas que já existiam antes dos planos só ganham assinatura com
 * --preencher-existentes; sem a flag, nenhuma empresa é alterada.
 *
 * Uso:
 *   node scripts/seed-planos.mjs
 *   node scripts/seed-planos.mjs --preencher-existentes [--plano=essencial]
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

// Não abre transação: assinatura e trecho são dois INSERTs, e quem chama decide
// o escopo (o seed de usuário já está dentro de uma).
export async function criarAssinaturaInicial(
  client,
  { empresaId, planoChave = "escritorio", agora = new Date() },
) {
  const { rows: planos } = await client.query("SELECT id FROM plano WHERE chave = $1", [planoChave]);
  if (planos.length === 0) {
    throw new Error(`Plano "${planoChave}" não encontrado. Rode "node scripts/seed-planos.mjs".`);
  }

  const venceEm = new Date(agora.getTime() + VALIDADE_EMPRESAS_EXISTENTES_DIAS * MS_POR_DIA);
  const { rows } = await client.query(
    `INSERT INTO assinatura (empresa_id, inicio, status, vence_em)
     VALUES ($1, $2, 'ativa', $3)
     ON CONFLICT (empresa_id) DO NOTHING
     RETURNING id`,
    [empresaId, agora, venceEm],
  );
  if (rows.length === 0) return false;

  await client.query(
    `INSERT INTO assinatura_trecho (assinatura_id, plano_id, inicio, origem)
     VALUES ($1, $2, $3, 'suporte')`,
    [rows[0].id, planos[0].id, agora],
  );
  return true;
}

export async function preencherAssinaturasExistentes(
  client,
  { planoChave = "escritorio", agora = new Date() } = {},
) {
  const { rows: empresas } = await client.query(
    `SELECT e.id FROM empresa e
     LEFT JOIN assinatura a ON a.empresa_id = e.id
     WHERE a.id IS NULL`,
  );

  let criadas = 0;
  for (const empresa of empresas) {
    await client.query("BEGIN");
    try {
      if (await criarAssinaturaInicial(client, { empresaId: empresa.id, planoChave, agora })) {
        criadas += 1;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  return criadas;
}

export function lerOpcoes(argv) {
  const opcoes = { planoChave: "escritorio", preencherExistentes: false };
  for (const arg of argv) {
    if (arg === "--preencher-existentes") opcoes.preencherExistentes = true;
    const plano = arg.match(/^--plano=(.+)$/);
    if (plano) opcoes.planoChave = plano[1];
  }
  return opcoes;
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
  const opcoes = lerOpcoes(process.argv.slice(2));
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

    if (opcoes.preencherExistentes) {
      const total = await preencherAssinaturasExistentes(client, { planoChave: opcoes.planoChave });
      console.log(`Empresas que ganharam assinatura: ${total}.`);
    } else {
      console.log("Empresas existentes não foram alteradas (use --preencher-existentes).");
    }
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

Substituir `scripts/seed-planos.d.mts` por:

```ts
import type { Client } from "pg";

export function semearPlanos(client: Client): Promise<void>;

export function criarAssinaturaInicial(
  client: Client,
  opcoes: { empresaId: string; planoChave?: string; agora?: Date },
): Promise<boolean>;

export function preencherAssinaturasExistentes(
  client: Client,
  opcoes?: { planoChave?: string; agora?: Date },
): Promise<number>;

export function lerOpcoes(argv: string[]): { planoChave: string; preencherExistentes: boolean };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/db/__tests__/seed-planos.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os anteriores).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-planos.mjs scripts/seed-planos.d.mts src/db/__tests__/seed-planos.test.ts
git commit -m "fix(planos): backfill do seed so com flag e a prova de corrida"
```

---

### Task 3: `seed-usuario` cria a assinatura; seed de planos roda antes no container

**Files:**
- Modify (reescrever inteiro): `scripts/seed-usuario.mjs`
- Create: `scripts/seed-usuario.d.mts`
- Modify (reescrever inteiro): `docker-entrypoint.sh` (manter finais de linha LF)
- Test: `src/db/__tests__/seed-usuario.test.ts`

**Interfaces:**
- Consumes: `criarAssinaturaInicial(client, { empresaId })` de `scripts/seed-planos.mjs` (Task 2).
- Produces: `criarUsuarioComEmpresa(client: pg.Client, dados: { nome: string; email: string; senha: string; nomeEmpresa: string }): Promise<{ empresaId: string; usuarioId: string }>` — cria empresa, usuário `admin` e a assinatura `escritorio` (`ativa`) numa transação.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/db/__tests__/seed-usuario.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Client } from "pg";

import { db } from "@/db";
import { assinatura, assinaturaTrecho, empresa, plano, usuario } from "@/db/schema";
import { criarUsuarioComEmpresa } from "../../../scripts/seed-usuario.mjs";
import { semearCatalogoNoBancoDeTeste } from "./helpers/semear-catalogo";

let client: Client;

beforeAll(async () => {
  await semearCatalogoNoBancoDeTeste();
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await db.delete(usuario);
  await db.delete(empresa);
});

describe("criarUsuarioComEmpresa", () => {
  it("cria empresa, usuário admin e a assinatura ativa do plano escritorio", async () => {
    const { empresaId, usuarioId } = await criarUsuarioComEmpresa(client, {
      nome: "Dev",
      email: "dev-seed@docobra.com",
      senha: "123456",
      nomeEmpresa: "Empresa Dev Seed",
    });

    const [usuarioCriado] = await db.select().from(usuario).where(eq(usuario.id, usuarioId));
    expect(usuarioCriado.empresaId).toBe(empresaId);
    expect(usuarioCriado.papel).toBe("admin");

    const [assinaturaCriada] = await db.select().from(assinatura).where(eq(assinatura.empresaId, empresaId));
    expect(assinaturaCriada.status).toBe("ativa");

    const [trecho] = await db
      .select({ plano: plano.chave, fim: assinaturaTrecho.fim })
      .from(assinaturaTrecho)
      .innerJoin(plano, eq(plano.id, assinaturaTrecho.planoId))
      .where(eq(assinaturaTrecho.assinaturaId, assinaturaCriada.id));
    expect(trecho).toEqual({ plano: "escritorio", fim: null });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/db/__tests__/seed-usuario.test.ts`
Expected: FAIL (`criarUsuarioComEmpresa` não é exportado).

- [ ] **Step 3: Reescrever `scripts/seed-usuario.mjs`**

Substituir o arquivo inteiro por:

```js
#!/usr/bin/env node
/**
 * Cria uma empresa + usuário base (com assinatura do plano escritorio) para
 * login manual em dev, sem passar pela tela de registro. Idempotente: se o
 * email já existir, só informa e sai — não duplica nem sobrescreve.
 *
 * Precisa que os planos já tenham sido semeados (scripts/seed-planos.mjs).
 *
 * Uso:
 *   node scripts/seed-usuario.mjs
 *   node scripts/seed-usuario.mjs --email=dev@docobra.com --senha=123456 --empresa="Minha Empresa" --nome="Dev"
 *
 * Roda tanto no container do app (tem node + as deps já instaladas) quanto
 * em qualquer lugar com DATABASE_URL apontando pro Postgres certo — lê do
 * ambiente ou cai no .env do projeto.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import bcrypt from "bcryptjs";

import { criarAssinaturaInicial } from "./seed-planos.mjs";

const ROOT = process.cwd();
const SALT_ROUNDS = 12; // mesmo valor de src/lib/auth/password.ts

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function readEnvFile() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return {};

  const out = {};
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

export async function criarUsuarioComEmpresa(client, { nome, email, senha, nomeEmpresa }) {
  const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

  await client.query("BEGIN");
  try {
    const { rows: empresaRows } = await client.query(
      "INSERT INTO empresa (nome) VALUES ($1) RETURNING id",
      [nomeEmpresa],
    );
    const empresaId = empresaRows[0].id;

    const { rows: usuarioRows } = await client.query(
      `INSERT INTO usuario (nome, email, senha_hash, empresa_id, papel)
       VALUES ($1, $2, $3, $4, 'admin')
       RETURNING id`,
      [nome, email, senhaHash, empresaId],
    );

    await criarAssinaturaInicial(client, { empresaId });

    await client.query("COMMIT");
    return { empresaId, usuarioId: usuarioRows[0].id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const args = parseArgs();
  const env = { ...(await readEnvFile()), ...process.env };

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL não encontrada (nem no ambiente, nem no .env).");
    process.exit(1);
  }

  const email = args.email ?? "dev@docobra.com";
  const senha = args.senha ?? "123456";
  const nomeEmpresa = args.empresa ?? "Empresa Dev";
  const nome = args.nome ?? "Usuário Dev";

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const existente = await client.query("SELECT id FROM usuario WHERE email = $1", [email]);
    if (existente.rows.length > 0) {
      console.log(`Usuário "${email}" já existe (id ${existente.rows[0].id}). Nada a fazer.`);
      return;
    }

    const { empresaId, usuarioId } = await criarUsuarioComEmpresa(client, {
      nome,
      email,
      senha,
      nomeEmpresa,
    });

    console.log("Usuário criado com sucesso:");
    console.log(`  empresa: ${nomeEmpresa} (${empresaId})`);
    console.log(`  usuario: ${nome} (${usuarioId})`);
    console.log(`  email:   ${email}`);
    console.log(`  senha:   ${senha}`);
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

Criar `scripts/seed-usuario.d.mts`:

```ts
import type { Client } from "pg";

export function criarUsuarioComEmpresa(
  client: Client,
  dados: { nome: string; email: string; senha: string; nomeEmpresa: string },
): Promise<{ empresaId: string; usuarioId: string }>;
```

- [ ] **Step 4: Reordenar o container (seed de planos antes do de usuário)**

Substituir `docker-entrypoint.sh` por (mantendo **LF**, sem CRLF):

```sh
#!/bin/sh
set -e

echo "==> Aplicando schema no banco (drizzle-kit push)"
npx drizzle-kit push --force

echo "==> Semeando planos e permissoes (idempotente)"
node scripts/seed-planos.mjs

echo "==> Garantindo usuario de teste (dev@docobra.com / 123456)"
node scripts/seed-usuario.mjs || true

echo "==> Iniciando o servidor Next.js na porta ${PORT:-3000}"
exec npm run start -- -p "${PORT:-3000}"
```

O usuário de dev precisa que os planos existam antes (por isso a ordem nova), e o seed de planos deixou de preencher empresas sozinho.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/db/__tests__/seed-usuario.test.ts src/db/__tests__/seed-planos.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `grep -c $'\r' docker-entrypoint.sh`
Expected: `0` (nenhum CR).

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-usuario.mjs scripts/seed-usuario.d.mts docker-entrypoint.sh src/db/__tests__/seed-usuario.test.ts
git commit -m "feat(planos): seed de usuario cria assinatura e seed de planos roda antes no container"
```

---

### Task 4: Suspensão por data desligável em `verificarPermissao`

**Files:**
- Modify (reescrever inteiro): `src/lib/permissoes/verificar-permissao.ts`
- Modify: `src/lib/permissoes/__tests__/verificar-permissao.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `interface OpcoesVerificacao { suspensaoAtiva?: boolean }` e `verificarPermissao(empresaId: string, chave: string, agora?: Date, opcoes?: OpcoesVerificacao): Promise<ResultadoPermissao>`. Sem a opção, lê `process.env.ASSINATURA_SUSPENSAO_ATIVA === "true"` (padrão desligado). Com a suspensão desligada, nunca troca para o plano `suspenso`.

- [ ] **Step 1: Atualizar e acrescentar testes**

Em `src/lib/permissoes/__tests__/verificar-permissao.test.ts`:

1. Trocar a linha `import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";` por:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
```

2. Logo abaixo de `const emDias = ...`, acrescentar:

```ts
const COM_SUSPENSAO = { suspensaoAtiva: true };
```

3. Substituir o teste `suspensa: resolve pelo plano suspenso (só lista o acervo)` inteiro por:

```ts
  it("suspensa (suspensão ligada): resolve pelo plano suspenso (só lista o acervo)", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "escritorio", { venceEm: emDias(-10) });

    expect((await verificarPermissao(empresaId, "acervo.listar", AGORA, COM_SUSPENSAO)).permitido).toBe(true);
    expect((await verificarPermissao(empresaId, "acervo.abrir", AGORA, COM_SUSPENSAO)).permitido).toBe(false);
    expect((await verificarPermissao(empresaId, "acervo.baixar", AGORA, COM_SUSPENSAO)).permitido).toBe(false);
    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA, COM_SUSPENSAO)).permitido).toBe(false);
  });

  it("com a suspensão desligada (padrão), a empresa vencida segue com o plano normal", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "escritorio", { venceEm: emDias(-10) });

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).permitido).toBe(true);
    expect((await verificarPermissao(empresaId, "acervo.abrir", AGORA)).permitido).toBe(true);
  });

  it("a variável ASSINATURA_SUSPENSAO_ATIVA liga a suspensão quando a opção não é passada", async () => {
    vi.stubEnv("ASSINATURA_SUSPENSAO_ATIVA", "true");
    try {
      const empresaId = await novaEmpresa();
      await assinar(empresaId, "escritorio", { venceEm: emDias(-10) });

      expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).permitido).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
```

4. No teste `sobrescrita também vale para empresa suspensa`, trocar a última linha de asserção por:

```ts
    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA, COM_SUSPENSAO)).permitido).toBe(true);
```

(sem a opção ligada o teste deixaria de provar que a sobrescrita vence a suspensão).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/permissoes/__tests__/verificar-permissao.test.ts`
Expected: FAIL nos testes novos/ajustados (a função ainda ignora a quarta posição e sempre suspende).

- [ ] **Step 3: Implementar**

Substituir `src/lib/permissoes/verificar-permissao.ts` inteiro por:

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

export interface OpcoesVerificacao {
  suspensaoAtiva?: boolean;
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

// Sem pagamento ainda (Fase 4), a suspensão por data fica desligada: só as cotas valem.
function suspensaoLigada(opcoes: OpcoesVerificacao): boolean {
  return opcoes.suspensaoAtiva ?? process.env.ASSINATURA_SUSPENSAO_ATIVA === "true";
}

async function resolverConcessao(
  empresaId: string,
  permissaoId: string,
  agora: Date,
  suspensaoAtiva: boolean,
): Promise<Concessao | null> {
  const sobrescrita = await buscarSobrescrita(empresaId, permissaoId, agora);
  if (sobrescrita) {
    return { valor: sobrescrita.valor, janelaDias: sobrescrita.janelaDias, ancora: sobrescrita.inicio };
  }

  const assinatura = await buscarAssinaturaVigente(empresaId);
  if (!assinatura) return null;

  let planoId = assinatura.planoId;
  if (suspensaoAtiva && derivarStatus(assinatura, agora) === "suspensa") {
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
  opcoes: OpcoesVerificacao = {},
): Promise<ResultadoPermissao> {
  const permissao = await buscarPermissaoPorChave(chave);
  if (!permissao) throw new Error(`Permissão desconhecida: "${chave}".`);

  const concessao = await resolverConcessao(empresaId, permissao.id, agora, suspensaoLigada(opcoes));
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

Em `.env.example`, acrescentar ao final:

```bash

# Planos: enquanto o pagamento não existe, a suspensão por data de vencimento
# fica desligada (só as cotas valem). Ligue ("true") quando existir como pagar.
ASSINATURA_SUSPENSAO_ATIVA="false"
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/permissoes/__tests__/verificar-permissao.test.ts`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissoes/verificar-permissao.ts src/lib/permissoes/__tests__/verificar-permissao.test.ts .env.example
git commit -m "feat(planos): suspensao por data desligavel (ASSINATURA_SUSPENSAO_ATIVA)"
```

---

### Task 5: Chaves de uso e helper `exigirPermissao` (403 padronizado)

**Files:**
- Create: `src/lib/permissoes/permissoes-de-uso.ts`, `src/lib/permissoes/exigir-permissao.ts`
- Test: `src/lib/permissoes/__tests__/exigir-permissao.test.ts`

**Interfaces:**
- Consumes: `verificarPermissao` (Task 4), `registrarConsumo`/`criarAssinatura` só nos testes.
- Produces:
  - `PERMISSOES_DE_USO` (tupla readonly das 4 chaves), `type PermissaoDeUso`, `ROTULOS_DE_USO: Record<PermissaoDeUso, string>`;
  - `type CodigoBloqueio = "LIMITE_ATINGIDO" | "PERMISSAO_NEGADA"`; `interface CorpoBloqueio { error: string; codigo: CodigoBloqueio; permissao: PermissaoDeUso; renovaEm: string | null }`;
  - `exigirPermissao(empresaId: string, chave: PermissaoDeUso, agora?: Date): Promise<NextResponse<CorpoBloqueio> | null>` — `null` quando permitido; senão a resposta 403.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/permissoes/__tests__/exigir-permissao.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { empresa } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { exigirPermissao } from "../exigir-permissao";
import { MS_POR_DIA } from "../janela";

const AGORA = new Date("2026-06-15T12:00:00Z");

async function limparBanco() {
  await db.delete(empresa);
}

async function novaEmpresa() {
  const [criada] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  return criada.id;
}

describe("exigirPermissao", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("devolve null quando a permissão é concedida", async () => {
    const empresaId = await novaEmpresa();
    await criarAssinatura(db, { empresaId, planoChave: "escritorio", status: "ativa", origem: "suporte", inicio: AGORA });

    expect(await exigirPermissao(empresaId, "projetos.criar", AGORA)).toBeNull();
  });

  it("limite esgotado: 403 LIMITE_ATINGIDO com a data de renovação", async () => {
    const empresaId = await novaEmpresa();
    await criarAssinatura(db, { empresaId, planoChave: "trial", status: "trial", origem: "suporte", inicio: AGORA });
    for (const referencia of ["a", "b", "c"]) {
      await registrarConsumo(empresaId, "memorial.gerar", referencia, { agora: AGORA });
    }

    const resposta = await exigirPermissao(empresaId, "memorial.gerar", AGORA);

    expect(resposta?.status).toBe(403);
    expect(await resposta?.json()).toEqual({
      error: "Você atingiu o limite do seu plano para gerar memoriais. A cota renova em 29/06/2026.",
      codigo: "LIMITE_ATINGIDO",
      permissao: "memorial.gerar",
      renovaEm: new Date(AGORA.getTime() + 14 * MS_POR_DIA).toISOString(),
    });
  });

  it("permissão fora do plano (sem assinatura): 403 PERMISSAO_NEGADA sem renovaEm", async () => {
    const empresaId = await novaEmpresa();

    const resposta = await exigirPermissao(empresaId, "memorial.gerar", AGORA);

    expect(resposta?.status).toBe(403);
    expect(await resposta?.json()).toEqual({
      error: "Seu plano não inclui gerar memoriais.",
      codigo: "PERMISSAO_NEGADA",
      permissao: "memorial.gerar",
      renovaEm: null,
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/permissoes/__tests__/exigir-permissao.test.ts`
Expected: FAIL (`Cannot find module '../exigir-permissao'`).

- [ ] **Step 3: Implementar**

`src/lib/permissoes/permissoes-de-uso.ts`:

```ts
export const PERMISSOES_DE_USO = [
  "memorial.gerar",
  "comunique-se.processar",
  "projetos.criar",
  "memorial.audio",
] as const;

export type PermissaoDeUso = (typeof PERMISSOES_DE_USO)[number];

export const ROTULOS_DE_USO: Record<PermissaoDeUso, string> = {
  "memorial.gerar": "gerar memoriais",
  "comunique-se.processar": "processar Comunique-se",
  "projetos.criar": "criar projetos",
  "memorial.audio": "usar o memorial por áudio",
};
```

`src/lib/permissoes/exigir-permissao.ts`:

```ts
import { NextResponse } from "next/server";

import { ROTULOS_DE_USO, type PermissaoDeUso } from "./permissoes-de-uso";
import { verificarPermissao } from "./verificar-permissao";

export type CodigoBloqueio = "LIMITE_ATINGIDO" | "PERMISSAO_NEGADA";

export interface CorpoBloqueio {
  error: string;
  codigo: CodigoBloqueio;
  permissao: PermissaoDeUso;
  renovaEm: string | null;
}

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export async function exigirPermissao(
  empresaId: string,
  chave: PermissaoDeUso,
  agora: Date = new Date(),
): Promise<NextResponse<CorpoBloqueio> | null> {
  const resultado = await verificarPermissao(empresaId, chave, agora);
  if (resultado.permitido) return null;

  const rotulo = ROTULOS_DE_USO[chave];
  const renovaEm = resultado.janela?.fim ?? null;

  const corpo: CorpoBloqueio =
    resultado.limite !== null
      ? {
          error: `Você atingiu o limite do seu plano para ${rotulo}.${
            renovaEm ? ` A cota renova em ${formatarData(renovaEm)}.` : ""
          }`,
          codigo: "LIMITE_ATINGIDO",
          permissao: chave,
          renovaEm: renovaEm?.toISOString() ?? null,
        }
      : {
          error: `Seu plano não inclui ${rotulo}.`,
          codigo: "PERMISSAO_NEGADA",
          permissao: chave,
          renovaEm: null,
        };

  return NextResponse.json(corpo, { status: 403 });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/permissoes/__tests__/exigir-permissao.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissoes/permissoes-de-uso.ts src/lib/permissoes/exigir-permissao.ts src/lib/permissoes/__tests__/exigir-permissao.test.ts
git commit -m "feat(planos): helper exigirPermissao com o 403 padronizado"
```

---

### Task 6: Checagem e consumo em `POST /api/projetos`

**Files:**
- Modify: `src/app/api/projetos/route.ts` (POST)
- Modify: `src/app/api/projetos/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `exigirPermissao(empresaId, "projetos.criar")` (Task 5), `registrarConsumo(empresaId, chave, referencia)` (Fase 1).

- [ ] **Step 1: Ajustar os helpers do teste e escrever os testes que falham**

Em `src/app/api/projetos/__tests__/route.test.ts`:

1. Trocar o import do vitest por:
```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
```
2. Trocar `import { empresa, projeto, usuario } from "@/db/schema";` por:
```ts
import { consumo, empresa, projeto, usuario } from "@/db/schema";
import { criarAssinatura } from "@/db/queries/assinatura";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
```
3. Trocar a assinatura `async function criarSessao() {` por `async function criarSessao(planoChave = "escritorio") {` e, dentro dela, substituir o trecho final por:
```ts
  await criarAssinatura(db, {
    empresaId: novaEmpresa.id,
    planoChave,
    status: "ativa",
    origem: "suporte",
  });

  const token = await assinarToken({
    userId: novoUsuario.id,
    empresaId: novaEmpresa.id,
    papel: novoUsuario.papel,
  });

  return { empresaId: novaEmpresa.id, token };
```
4. Logo acima de `describe("POST /api/projetos", () => {`, acrescentar:
```ts
beforeAll(semearCatalogoNoBancoDeTeste);

```
5. Dentro de `describe("POST /api/projetos", ...)`, acrescentar ao final do bloco:

```ts
  it("bloqueia com 403 LIMITE_ATINGIDO quando a cota de projetos do plano acabou", async () => {
    const { token } = await criarSessao("trial");

    expect((await POST(criarRequest({ nome: "Projeto 1", endereco: "Rua A, 1" }, token))).status).toBe(201);
    expect((await POST(criarRequest({ nome: "Projeto 2", endereco: "Rua A, 2" }, token))).status).toBe(201);
    const terceira = await POST(criarRequest({ nome: "Projeto 3", endereco: "Rua A, 3" }, token));

    expect(terceira.status).toBe(403);
    const corpo = await terceira.json();
    expect(corpo.codigo).toBe("LIMITE_ATINGIDO");
    expect(corpo.permissao).toBe("projetos.criar");
    expect(await db.select().from(projeto)).toHaveLength(2);
  });

  it("registra o consumo do projeto criado, com o id do projeto como referência", async () => {
    const { token } = await criarSessao();

    const response = await POST(criarRequest({ nome: "Casa", endereco: "Rua X, 1" }, token));
    const { projeto: criado } = await response.json();

    const consumos = await db.select().from(consumo);
    expect(consumos).toHaveLength(1);
    expect(consumos[0].referencia).toBe(criado.id);
  });

  it("dados inválidos continuam 400 mesmo com a cota esgotada", async () => {
    const { token } = await criarSessao("trial");
    await POST(criarRequest({ nome: "Projeto 1", endereco: "Rua A, 1" }, token));
    await POST(criarRequest({ nome: "Projeto 2", endereco: "Rua A, 2" }, token));

    const response = await POST(criarRequest({}, token));

    expect(response.status).toBe(400);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/api/projetos`
Expected: FAIL nos 2 primeiros testes novos (a rota ainda não bloqueia nem consome); os demais passam.

- [ ] **Step 3: Implementar**

Em `src/app/api/projetos/route.ts`, acrescentar aos imports:

```ts
import { registrarConsumo } from "@/db/queries/consumo";
import { exigirPermissao } from "@/lib/permissoes/exigir-permissao";
```

e, no `POST`, substituir:

```ts
    const projeto = await criarProjeto({ ...parsed.data, empresaId: sessao.empresaId });
    return NextResponse.json({ projeto }, { status: 201 });
```

por:

```ts
    const bloqueio = await exigirPermissao(sessao.empresaId, "projetos.criar");
    if (bloqueio) return bloqueio;

    const projeto = await criarProjeto({ ...parsed.data, empresaId: sessao.empresaId });
    await registrarConsumo(sessao.empresaId, "projetos.criar", projeto.id);
    return NextResponse.json({ projeto }, { status: 201 });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/api/projetos`
Expected: PASS (todos, incluindo GET).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projetos
git commit -m "feat(planos): limite de projetos no POST /api/projetos"
```

---

### Task 7: Checagem e consumo nos memoriais (criar e retry)

**Files:**
- Modify: `src/app/api/memoriais/route.ts` (POST), `src/app/api/memoriais/[id]/retry/route.ts`
- Modify: `src/app/api/memoriais/__tests__/route.test.ts`
- Create: `src/app/api/memoriais/[id]/retry/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `exigirPermissao` (Task 5), `registrarConsumo` (Fase 1), `criarMemorialRascunho` (`src/db/queries/memorial.ts`).

- [ ] **Step 1: Ajustar o teste da rota de criação e escrever os que falham**

Em `src/app/api/memoriais/__tests__/route.test.ts`:

1. Trocar o import do vitest por:
```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
```
2. Trocar `import { empresa, memorialDescritivo, projeto, usuario } from "@/db/schema";` por:
```ts
import { eq } from "drizzle-orm";

import { consumo, empresa, memorialDescritivo, plano, planoPermissao, permissao, projeto, usuario } from "@/db/schema";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
```
3. Em `limparBanco`, acrescentar ao final (depois de `await db.delete(empresa);`):
```ts
  await db.delete(plano).where(eq(plano.chave, "teste-sem-audio"));
```
4. Substituir a função `criarSessaoComProjeto` inteira por:
```ts
async function criarPlanoSemAudio() {
  const [planoCriado] = await db
    .insert(plano)
    .values({ chave: "teste-sem-audio", nome: "Teste sem áudio", cicloDias: 30 })
    .returning();
  const [permissaoGerar] = await db.select().from(permissao).where(eq(permissao.chave, "memorial.gerar"));
  await db
    .insert(planoPermissao)
    .values({ planoId: planoCriado.id, permissaoId: permissaoGerar.id, valor: 10, janelaDias: 30 });
}

async function criarSessaoComProjeto(planoChave = "escritorio") {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave, status: "ativa", origem: "suporte" });
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, projetoId: novoProjeto.id, empresaId: novaEmpresa.id };
}
```
5. Logo acima de `describe("POST /api/memoriais", () => {`, acrescentar:
```ts
beforeAll(semearCatalogoNoBancoDeTeste);

```
6. Dentro de `describe("POST /api/memoriais", ...)`, antes do `});` que fecha o bloco, acrescentar:

```ts
  it("bloqueia com 403 LIMITE_ATINGIDO e não chama a IA quando a cota acabou", async () => {
    vi.mocked(gerarMemorial).mockClear();
    const { token, projetoId, empresaId } = await criarSessaoComProjeto("trial");
    for (const referencia of ["a", "b", "c"]) {
      await registrarConsumo(empresaId, "memorial.gerar", referencia);
    }

    const response = await POST(
      criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).codigo).toBe("LIMITE_ATINGIDO");
    expect(gerarMemorial).not.toHaveBeenCalled();
  });

  it("registra o consumo com o id do memorial gerado", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(gerarMemorial).mockResolvedValue({
      id: "memorial-123",
      numero: 1,
      status: "gerado",
      documentoGeradoUrl: "/api/memoriais/memorial-123/pdf",
    });

    const response = await POST(
      criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(201);
    const consumos = await db.select().from(consumo);
    expect(consumos).toHaveLength(1);
    expect(consumos[0].referencia).toBe("memorial-123");
  });

  it("não consome quando a geração falha", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(gerarMemorial).mockRejectedValue(new CriacaoParcialError("falhou", "memorial-123"));

    await POST(criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token));

    expect(await db.select().from(consumo)).toHaveLength(0);
  });

  it("modo áudio em plano sem memorial.audio: 403 PERMISSAO_NEGADA e não chama a IA", async () => {
    vi.mocked(gerarMemorial).mockClear();
    await criarPlanoSemAudio();
    const { token, projetoId } = await criarSessaoComProjeto("teste-sem-audio");

    const response = await POST(
      criarRequest(
        {
          projetoId,
          tipoConstrucao: "residencial",
          modoEspecificacoes: "audio",
          audioBase64: "QUJD",
          audioMimeType: "audio/webm",
        },
        token,
      ),
    );

    expect(response.status).toBe(403);
    const corpo = await response.json();
    expect(corpo.codigo).toBe("PERMISSAO_NEGADA");
    expect(corpo.permissao).toBe("memorial.audio");
    expect(gerarMemorial).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Criar o teste da rota de retry (falha: a rota ainda não checa)**

Criar `src/app/api/memoriais/[id]/retry/__tests__/route.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { criarMemorialRascunho } from "@/db/queries/memorial";
import { consumo, empresa, memorialDescritivo, projeto, usuario } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

vi.mock("@/lib/memorial/gerar", () => ({
  regerarMemorial: vi.fn(),
}));

import { regerarMemorial } from "@/lib/memorial/gerar";
import { POST } from "@/app/api/memoriais/[id]/retry/route";

async function limparBanco() {
  await db.delete(memorialDescritivo);
  await db.delete(projeto);
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarMemorialPendente(planoChave: string) {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave, status: "ativa", origem: "suporte" });
  const memorial = await criarMemorialRascunho({
    projetoId: novoProjeto.id,
    empresaId: novaEmpresa.id,
    respostasFormularioJson: { tipoConstrucao: "residencial" },
  });
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, memorialId: memorial.id, empresaId: novaEmpresa.id };
}

function criarRequest(id: string, token: string) {
  return new NextRequest(`http://localhost/api/memoriais/${id}/retry`, {
    method: "POST",
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

describe("POST /api/memoriais/[id]/retry", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(async () => {
    await limparBanco();
    vi.mocked(regerarMemorial).mockReset();
  });
  afterEach(limparBanco);

  it("bloqueia com 403 LIMITE_ATINGIDO e não chama a IA quando a cota acabou", async () => {
    const { token, memorialId, empresaId } = await criarMemorialPendente("trial");
    for (const referencia of ["a", "b", "c"]) {
      await registrarConsumo(empresaId, "memorial.gerar", referencia);
    }

    const response = await POST(criarRequest(memorialId, token), { params: Promise.resolve({ id: memorialId }) });

    expect(response.status).toBe(403);
    expect((await response.json()).codigo).toBe("LIMITE_ATINGIDO");
    expect(regerarMemorial).not.toHaveBeenCalled();
  });

  it("registra o consumo com o id do memorial quando o retry dá certo", async () => {
    const { token, memorialId } = await criarMemorialPendente("escritorio");
    vi.mocked(regerarMemorial).mockResolvedValue({
      id: memorialId,
      numero: 1,
      status: "gerado",
      documentoGeradoUrl: `/api/memoriais/${memorialId}/pdf`,
    });

    const response = await POST(criarRequest(memorialId, token), { params: Promise.resolve({ id: memorialId }) });

    expect(response.status).toBe(200);
    const consumos = await db.select().from(consumo);
    expect(consumos).toHaveLength(1);
    expect(consumos[0].referencia).toBe(memorialId);
  });

  it("não consome quando o retry falha", async () => {
    const { token, memorialId } = await criarMemorialPendente("escritorio");
    vi.mocked(regerarMemorial).mockRejectedValue(new Error("falhou"));

    const response = await POST(criarRequest(memorialId, token), { params: Promise.resolve({ id: memorialId }) });

    expect(response.status).toBe(500);
    expect(await db.select().from(consumo)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/app/api/memoriais`
Expected: FAIL nos testes novos de bloqueio e de consumo (as rotas ainda não checam nem consomem); os antigos passam.

- [ ] **Step 4: Implementar a rota de criação**

Em `src/app/api/memoriais/route.ts`, acrescentar aos imports:

```ts
import { registrarConsumo } from "@/db/queries/consumo";
import { exigirPermissao } from "@/lib/permissoes/exigir-permissao";
```

e, no `POST`, substituir o trecho:

```ts
    const nomes = await buscarNomesUsuarioEEmpresa(sessao.userId);
    const resultado = await gerarMemorial(parsed.data, {
      empresaId: sessao.empresaId,
      projetoNome: projetoEncontrado.nome,
      projetoEndereco: projetoEncontrado.endereco,
      empresaNome: nomes?.empresaNome ?? "",
      usuarioNome: nomes?.usuarioNome ?? "",
    });
    return NextResponse.json({ memorial: resultado }, { status: 201 });
```

por:

```ts
    if (parsed.data.modoEspecificacoes === "audio") {
      const bloqueioAudio = await exigirPermissao(sessao.empresaId, "memorial.audio");
      if (bloqueioAudio) return bloqueioAudio;
    }
    const bloqueio = await exigirPermissao(sessao.empresaId, "memorial.gerar");
    if (bloqueio) return bloqueio;

    const nomes = await buscarNomesUsuarioEEmpresa(sessao.userId);
    const resultado = await gerarMemorial(parsed.data, {
      empresaId: sessao.empresaId,
      projetoNome: projetoEncontrado.nome,
      projetoEndereco: projetoEncontrado.endereco,
      empresaNome: nomes?.empresaNome ?? "",
      usuarioNome: nomes?.usuarioNome ?? "",
    });
    await registrarConsumo(sessao.empresaId, "memorial.gerar", resultado.id);
    return NextResponse.json({ memorial: resultado }, { status: 201 });
```

- [ ] **Step 5: Implementar a rota de retry**

Em `src/app/api/memoriais/[id]/retry/route.ts`, acrescentar aos imports:

```ts
import { registrarConsumo } from "@/db/queries/consumo";
import { exigirPermissao } from "@/lib/permissoes/exigir-permissao";
```

Substituir `    const nomes = await buscarNomesUsuarioEEmpresa(sessao.userId);\n    const resultado = await regerarMemorial(` por:

```ts
    const bloqueio = await exigirPermissao(sessao.empresaId, "memorial.gerar");
    if (bloqueio) return bloqueio;

    const nomes = await buscarNomesUsuarioEEmpresa(sessao.userId);
    const resultado = await regerarMemorial(
```

e substituir `    return NextResponse.json({ memorial: resultado });` por:

```ts
    await registrarConsumo(sessao.empresaId, "memorial.gerar", resultado.id);
    return NextResponse.json({ memorial: resultado });
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run src/app/api/memoriais`
Expected: PASS (testes novos e antigos).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/memoriais
git commit -m "feat(planos): limite e consumo de memoriais (criar e retry) e permissao de audio"
```

---

### Task 8: Checagem e consumo no Comunique-se (criar e retry)

**Files:**
- Modify: `src/app/api/comunique-se/route.ts` (POST), `src/app/api/comunique-se/[id]/retry/route.ts`
- Modify: `src/app/api/comunique-se/__tests__/route.test.ts`
- Create: `src/app/api/comunique-se/[id]/retry/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `exigirPermissao` (Task 5), `registrarConsumo`, `detectarModeloEmbutido(pdfBuffer): Promise<{descricao: string; concluida: boolean}[] | null>` (`@/lib/comunique-se/modelo-detectar`), `criarComuniqueSeProcessando` e `marcarComoErro` (`@/db/queries/comunique-se`).

- [ ] **Step 1: Ajustar o teste da rota de criação e escrever os que falham**

Em `src/app/api/comunique-se/__tests__/route.test.ts`:

1. Trocar o import do vitest por:
```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
```
2. Trocar `import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";` por:
```ts
import { comuniqueSe, consumo, empresa, projeto, usuario } from "@/db/schema";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
```
3. Logo depois do `vi.mock("@/lib/comunique-se/processar", ...)`, acrescentar:
```ts
vi.mock("@/lib/comunique-se/modelo-detectar", () => ({
  detectarModeloEmbutido: vi.fn(),
}));

import { detectarModeloEmbutido } from "@/lib/comunique-se/modelo-detectar";
```
4. Substituir `criarSessaoComProjeto` inteira por:
```ts
async function criarSessaoComProjeto(planoChave = "escritorio") {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave, status: "ativa", origem: "suporte" });
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, projetoId: novoProjeto.id, empresaId: novaEmpresa.id };
}

async function esgotarCota(empresaId: string) {
  for (const referencia of ["a", "b", "c"]) {
    await registrarConsumo(empresaId, "comunique-se.processar", referencia);
  }
}
```
5. Em `describe("POST /api/comunique-se", ...)`, acrescentar `beforeAll(semearCatalogoNoBancoDeTeste);` como primeira linha do bloco e, dentro do `beforeEach`, depois de `vi.mocked(criarComuniqueSeManual).mockReset();`, acrescentar `vi.mocked(detectarModeloEmbutido).mockReset();`. No `describe("GET /api/comunique-se", ...)`, acrescentar `beforeAll(semearCatalogoNoBancoDeTeste);` como primeira linha também (os testes de GET criam sessão com assinatura).
6. Antes do `});` que fecha o `describe("POST /api/comunique-se", ...)`, acrescentar:

```ts
  it("PDF: bloqueia com 403 LIMITE_ATINGIDO e não processa quando a cota acabou", async () => {
    const { token, projetoId, empresaId } = await criarSessaoComProjeto("trial");
    await esgotarCota(empresaId);

    const response = await POST(
      criarRequestPost({ modoCriacao: "pdf", projetoId, pdfBase64: PDF_BASE64_FAKE }, token),
    );

    expect(response.status).toBe(403);
    const corpo = await response.json();
    expect(corpo.codigo).toBe("LIMITE_ATINGIDO");
    expect(corpo.permissao).toBe("comunique-se.processar");
    expect(processarComuniqueSe).not.toHaveBeenCalled();
  });

  it("PDF: registra o consumo com o id do Comunique-se processado", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(processarComuniqueSe).mockResolvedValue({
      id: "cs-123",
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: "/api/comunique-se/cs-123/pdf",
    });

    const response = await POST(
      criarRequestPost({ modoCriacao: "pdf", projetoId, pdfBase64: PDF_BASE64_FAKE }, token),
    );

    expect(response.status).toBe(201);
    const consumos = await db.select().from(consumo);
    expect(consumos).toHaveLength(1);
    expect(consumos[0].referencia).toBe("cs-123");
  });

  it("PDF: não consome quando o processamento falha", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(processarComuniqueSe).mockRejectedValue(new CriacaoParcialError("falhou", "cs-123"));

    await POST(criarRequestPost({ modoCriacao: "pdf", projetoId, pdfBase64: PDF_BASE64_FAKE }, token));

    expect(await db.select().from(consumo)).toHaveLength(0);
  });

  it("PDF com modelo embutido (exportado pelo DocObra) não checa nem consome, mesmo com a cota esgotada", async () => {
    const { token, projetoId, empresaId } = await criarSessaoComProjeto("trial");
    await esgotarCota(empresaId);
    vi.mocked(detectarModeloEmbutido).mockResolvedValue([{ descricao: "Apresentar ART", concluida: false }]);
    vi.mocked(processarComuniqueSe).mockResolvedValue({
      id: "cs-importado",
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: "/api/comunique-se/cs-importado/pdf",
    });

    const response = await POST(
      criarRequestPost({ modoCriacao: "pdf", projetoId, pdfBase64: PDF_BASE64_FAKE }, token),
    );

    expect(response.status).toBe(201);
    expect(await db.select().from(consumo)).toHaveLength(3);
  });

  it("modo manual não checa nem consome, mesmo com a cota esgotada", async () => {
    const { token, projetoId, empresaId } = await criarSessaoComProjeto("trial");
    await esgotarCota(empresaId);
    vi.mocked(criarComuniqueSeManual).mockResolvedValue({
      id: "cs-manual",
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: null,
    });

    const response = await POST(
      criarRequestPost({ modoCriacao: "manual", projetoId, itens: [{ descricao: "Apresentar ART" }] }, token),
    );

    expect(response.status).toBe(201);
    expect(await db.select().from(consumo)).toHaveLength(3);
  });
```

- [ ] **Step 2: Criar o teste da rota de retry**

Criar `src/app/api/comunique-se/[id]/retry/__tests__/route.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { criarComuniqueSeProcessando, marcarComoErro } from "@/db/queries/comunique-se";
import { registrarConsumo } from "@/db/queries/consumo";
import { comuniqueSe, consumo, empresa, projeto, usuario } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

vi.mock("@/lib/comunique-se/processar", () => ({
  reprocessarComuniqueSe: vi.fn(),
}));

import { reprocessarComuniqueSe } from "@/lib/comunique-se/processar";
import { POST } from "@/app/api/comunique-se/[id]/retry/route";

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(usuario);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarComuniqueSeComErro(planoChave: string) {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave, status: "ativa", origem: "suporte" });

  const id = randomUUID();
  await criarComuniqueSeProcessando({
    id,
    projetoId: novoProjeto.id,
    empresaId: novaEmpresa.id,
    pdfOriginalUrl: `/api/comunique-se/${id}/pdf`,
  });
  await marcarComoErro(id);

  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, id, empresaId: novaEmpresa.id };
}

function criarRequest(id: string, token: string) {
  return new NextRequest(`http://localhost/api/comunique-se/${id}/retry`, {
    method: "POST",
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

describe("POST /api/comunique-se/[id]/retry", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(async () => {
    await limparBanco();
    vi.mocked(reprocessarComuniqueSe).mockReset();
  });
  afterEach(limparBanco);

  it("bloqueia com 403 LIMITE_ATINGIDO e não reprocessa quando a cota acabou", async () => {
    const { token, id, empresaId } = await criarComuniqueSeComErro("trial");
    for (const referencia of ["a", "b", "c"]) {
      await registrarConsumo(empresaId, "comunique-se.processar", referencia);
    }

    const response = await POST(criarRequest(id, token), { params: Promise.resolve({ id }) });

    expect(response.status).toBe(403);
    expect((await response.json()).codigo).toBe("LIMITE_ATINGIDO");
    expect(reprocessarComuniqueSe).not.toHaveBeenCalled();
  });

  it("registra o consumo com o id do Comunique-se quando o retry dá certo", async () => {
    const { token, id } = await criarComuniqueSeComErro("escritorio");
    vi.mocked(reprocessarComuniqueSe).mockResolvedValue({
      id,
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: `/api/comunique-se/${id}/pdf`,
    });

    const response = await POST(criarRequest(id, token), { params: Promise.resolve({ id }) });

    expect(response.status).toBe(200);
    const consumos = await db.select().from(consumo);
    expect(consumos).toHaveLength(1);
    expect(consumos[0].referencia).toBe(id);
  });

  it("não consome quando o retry falha", async () => {
    const { token, id } = await criarComuniqueSeComErro("escritorio");
    vi.mocked(reprocessarComuniqueSe).mockRejectedValue(new Error("falhou"));

    const response = await POST(criarRequest(id, token), { params: Promise.resolve({ id }) });

    expect(response.status).toBe(500);
    expect(await db.select().from(consumo)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/app/api/comunique-se`
Expected: FAIL nos testes novos de bloqueio e consumo; os antigos passam.

- [ ] **Step 4: Implementar a rota de criação**

Em `src/app/api/comunique-se/route.ts`, acrescentar aos imports:

```ts
import { registrarConsumo } from "@/db/queries/consumo";
import { exigirPermissao } from "@/lib/permissoes/exigir-permissao";
import { detectarModeloEmbutido } from "@/lib/comunique-se/modelo-detectar";
```

e substituir:

```ts
    const resultado = await processarComuniqueSe({
      projetoId: parsed.data.projetoId,
      empresaId: sessao.empresaId,
      pdfBuffer,
    });
    return NextResponse.json({ comuniqueSe: resultado }, { status: 201 });
```

por:

```ts
    // PDF exportado pelo DocObra traz o checklist embutido e pula a IA: não gasta cota.
    const modeloEmbutido = Boolean(await detectarModeloEmbutido(pdfBuffer));
    if (!modeloEmbutido) {
      const bloqueio = await exigirPermissao(sessao.empresaId, "comunique-se.processar");
      if (bloqueio) return bloqueio;
    }

    const resultado = await processarComuniqueSe({
      projetoId: parsed.data.projetoId,
      empresaId: sessao.empresaId,
      pdfBuffer,
    });
    if (!modeloEmbutido) {
      await registrarConsumo(sessao.empresaId, "comunique-se.processar", resultado.id);
    }
    return NextResponse.json({ comuniqueSe: resultado }, { status: 201 });
```

- [ ] **Step 5: Implementar a rota de retry**

Em `src/app/api/comunique-se/[id]/retry/route.ts`, acrescentar aos imports:

```ts
import { registrarConsumo } from "@/db/queries/consumo";
import { exigirPermissao } from "@/lib/permissoes/exigir-permissao";
```

e substituir:

```ts
    const resultado = await reprocessarComuniqueSe(
      comuniqueSeEncontrado.id,
      comuniqueSeEncontrado.numero,
      comuniqueSeEncontrado.pdfOriginalUrl,
    );
    return NextResponse.json({ comuniqueSe: resultado });
```

por:

```ts
    const bloqueio = await exigirPermissao(sessao.empresaId, "comunique-se.processar");
    if (bloqueio) return bloqueio;

    const resultado = await reprocessarComuniqueSe(
      comuniqueSeEncontrado.id,
      comuniqueSeEncontrado.numero,
      comuniqueSeEncontrado.pdfOriginalUrl,
    );
    await registrarConsumo(sessao.empresaId, "comunique-se.processar", resultado.id);
    return NextResponse.json({ comuniqueSe: resultado });
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run src/app/api/comunique-se`
Expected: PASS (testes novos e antigos).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/comunique-se
git commit -m "feat(planos): limite e consumo do Comunique-se (criar e retry), sem cobrar modelo embutido nem manual"
```

---

### Task 9: `GET /api/permissoes`, hook e invalidação nas mutações

**Files:**
- Create: `src/lib/permissoes/permissoes-da-empresa.ts`, `src/app/api/permissoes/route.ts`, `src/hooks/use-permissoes.ts`
- Modify: `src/hooks/use-criar-projeto.ts`, `src/hooks/use-criar-memorial.ts`, `src/hooks/use-criar-comunique-se.ts`, `src/hooks/use-retry-memorial.ts`, `src/hooks/use-retry-comunique-se.ts`
- Test: `src/lib/permissoes/__tests__/permissoes-da-empresa.test.ts`, `src/app/api/permissoes/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `PERMISSOES_DE_USO`, `PermissaoDeUso` (Task 5), `verificarPermissao` (Task 4).
- Produces:
  - `interface PermissaoSerializada { permitido: boolean; limite: number | null; usado: number; restante: number | null; renovaEm: string | null }`;
  - `type PermissoesDaEmpresa = Record<PermissaoDeUso, PermissaoSerializada>`;
  - `carregarPermissoesDaEmpresa(empresaId: string, agora?: Date): Promise<PermissoesDaEmpresa>`;
  - `GET /api/permissoes` → `PermissoesDaEmpresa` (401 sem sessão);
  - `usePermissoes(dadosIniciais?: PermissoesDaEmpresa)` (query key `["permissoes"]`) e `usePermissaoDeUso(chave: PermissaoDeUso, dadosIniciais?: PermissoesDaEmpresa): PermissaoSerializada | undefined`.

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/permissoes/__tests__/permissoes-da-empresa.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { empresa } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { MS_POR_DIA } from "../janela";
import { carregarPermissoesDaEmpresa } from "../permissoes-da-empresa";
import { PERMISSOES_DE_USO } from "../permissoes-de-uso";

const AGORA = new Date("2026-06-15T12:00:00Z");

async function limparBanco() {
  await db.delete(empresa);
}

async function novaEmpresa() {
  const [criada] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  return criada.id;
}

describe("carregarPermissoesDaEmpresa", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("devolve as quatro permissões de uso, com datas em ISO", async () => {
    const empresaId = await novaEmpresa();
    await criarAssinatura(db, { empresaId, planoChave: "trial", status: "trial", origem: "suporte", inicio: AGORA });
    await registrarConsumo(empresaId, "projetos.criar", "p1", { agora: AGORA });

    const permissoes = await carregarPermissoesDaEmpresa(empresaId, AGORA);

    expect(Object.keys(permissoes).sort()).toEqual([...PERMISSOES_DE_USO].sort());
    expect(permissoes["projetos.criar"]).toEqual({
      permitido: true,
      limite: 2,
      usado: 1,
      restante: 1,
      renovaEm: new Date(AGORA.getTime() + 14 * MS_POR_DIA).toISOString(),
    });
    expect(permissoes["memorial.audio"]).toEqual({
      permitido: true,
      limite: null,
      usado: 0,
      restante: null,
      renovaEm: null,
    });
  });

  it("empresa sem assinatura: todas negadas", async () => {
    const empresaId = await novaEmpresa();

    const permissoes = await carregarPermissoesDaEmpresa(empresaId, AGORA);

    for (const chave of PERMISSOES_DE_USO) {
      expect(permissoes[chave].permitido).toBe(false);
    }
  });
});
```

`src/app/api/permissoes/__tests__/route.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { empresa, usuario } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { GET } from "@/app/api/permissoes/route";

async function limparBanco() {
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarEmpresaComSessao(nome: string, email: string) {
  const [novaEmpresa] = await db.insert(empresa).values({ nome }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome, email, senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave: "trial", status: "trial", origem: "suporte" });
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { empresaId: novaEmpresa.id, token };
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/permissoes", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("GET /api/permissoes", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await GET(criarRequest());

    expect(response.status).toBe(401);
  });

  it("devolve só as permissões da empresa da sessão", async () => {
    const { token } = await criarEmpresaComSessao("Empresa A", "a@teste.com");
    const outra = await criarEmpresaComSessao("Empresa B", "b@teste.com");
    for (const referencia of ["x", "y", "z"]) {
      await registrarConsumo(outra.empresaId, "memorial.gerar", referencia);
    }

    const response = await GET(criarRequest(token));

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo["memorial.gerar"]).toMatchObject({ permitido: true, limite: 3, usado: 0, restante: 3 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/permissoes/__tests__/permissoes-da-empresa.test.ts src/app/api/permissoes`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar a lib e a rota**

`src/lib/permissoes/permissoes-da-empresa.ts`:

```ts
import { PERMISSOES_DE_USO, type PermissaoDeUso } from "./permissoes-de-uso";
import { verificarPermissao } from "./verificar-permissao";

export interface PermissaoSerializada {
  permitido: boolean;
  limite: number | null;
  usado: number;
  restante: number | null;
  renovaEm: string | null;
}

export type PermissoesDaEmpresa = Record<PermissaoDeUso, PermissaoSerializada>;

export async function carregarPermissoesDaEmpresa(
  empresaId: string,
  agora: Date = new Date(),
): Promise<PermissoesDaEmpresa> {
  const resultados = await Promise.all(
    PERMISSOES_DE_USO.map((chave) => verificarPermissao(empresaId, chave, agora)),
  );

  const entradas = PERMISSOES_DE_USO.map((chave, indice) => {
    const resultado = resultados[indice];
    const serializada: PermissaoSerializada = {
      permitido: resultado.permitido,
      limite: resultado.limite,
      usado: resultado.usado,
      restante: resultado.restante,
      renovaEm: resultado.janela ? resultado.janela.fim.toISOString() : null,
    };
    return [chave, serializada] as const;
  });

  return Object.fromEntries(entradas) as PermissoesDaEmpresa;
}
```

`src/app/api/permissoes/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { carregarPermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    return NextResponse.json(await carregarPermissoesDaEmpresa(sessao.empresaId));
  } catch (error) {
    console.error("[GET /api/permissoes]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/permissoes/__tests__/permissoes-da-empresa.test.ts src/app/api/permissoes`
Expected: PASS.

- [ ] **Step 5: Criar o hook de consulta**

`src/hooks/use-permissoes.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import type { PermissaoDeUso } from "@/lib/permissoes/permissoes-de-uso";
import type { PermissaoSerializada, PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";

async function buscarPermissoes(): Promise<PermissoesDaEmpresa> {
  const response = await fetch("/api/permissoes");

  if (!response.ok) {
    throw new Error("Erro ao carregar o uso do plano.");
  }

  return response.json();
}

export function usePermissoes(dadosIniciais?: PermissoesDaEmpresa) {
  return useQuery({
    queryKey: ["permissoes"],
    queryFn: buscarPermissoes,
    initialData: dadosIniciais,
  });
}

export function usePermissaoDeUso(
  chave: PermissaoDeUso,
  dadosIniciais?: PermissoesDaEmpresa,
): PermissaoSerializada | undefined {
  const { data } = usePermissoes(dadosIniciais);
  return data?.[chave];
}
```

- [ ] **Step 6: Invalidar `["permissoes"]` depois de cada mutação (sucesso ou erro)**

Em cada um dos 5 hooks abaixo, trocar o import `import { useMutation } from "@tanstack/react-query";` por `import { useMutation, useQueryClient } from "@tanstack/react-query";` e a função exportada final conforme:

`src/hooks/use-criar-projeto.ts`:
```ts
export function useCriarProjeto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: criarProjetoRequest,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["permissoes"] }),
  });
}
```

`src/hooks/use-criar-memorial.ts`:
```ts
export function useCriarMemorial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: criarMemorialRequest,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["permissoes"] }),
  });
}
```

`src/hooks/use-criar-comunique-se.ts`:
```ts
export function useCriarComuniqueSe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: criarComuniqueSeRequest,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["permissoes"] }),
  });
}
```

`src/hooks/use-retry-memorial.ts`:
```ts
export function useRetryMemorial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retryMemorialRequest,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["permissoes"] }),
  });
}
```

`src/hooks/use-retry-comunique-se.ts`:
```ts
export function useRetryComuniqueSe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retryComuniqueSeRequest,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["permissoes"] }),
  });
}
```

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/lib/permissoes/permissoes-da-empresa.ts src/lib/permissoes/__tests__/permissoes-da-empresa.test.ts src/app/api/permissoes src/hooks
git commit -m "feat(planos): GET /api/permissoes, hook usePermissoes e invalidacao nas mutacoes"
```

---

### Task 10: Lógica pura do cabeçalho de uso, `mailto` e contexto das páginas

**Files:**
- Create: `src/lib/permissoes/descrever-uso.ts`, `src/lib/permissoes/contexto-de-planos.ts`
- Modify: `.env.example`
- Test: `src/lib/permissoes/__tests__/descrever-uso.test.ts`, `src/lib/permissoes/__tests__/contexto-de-planos.test.ts`

**Interfaces:**
- Consumes: `PermissaoSerializada`, `PermissoesDaEmpresa`, `carregarPermissoesDaEmpresa` (Task 9); `buscarNomesUsuarioEEmpresa` (`@/db/queries/usuario`); `buscarAssinaturaVigente` (`@/db/queries/assinatura`).
- Produces:
  - `type EstadoUso = "ilimitado" | "normal" | "perto" | "estourado" | "negado"`; `interface DescricaoUso { estado: EstadoUso; texto: string; percentual: number | null }`; `descreverUso(permissao: PermissaoSerializada, unidade: string, agora?: Date): DescricaoUso`;
  - `montarMailtoSuporte(dados: { email: string; empresaNome: string; planoChave: string | null; motivo: string }): string`;
  - `interface ContatoSuporte { email: string | null; empresaNome: string; planoChave: string | null }`; `interface ContextoDePlanos { permissoes: PermissoesDaEmpresa; contatoSuporte: ContatoSuporte }`; `carregarContextoDePlanos(sessao: { userId: string; empresaId: string }): Promise<ContextoDePlanos>`.

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/permissoes/__tests__/descrever-uso.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { descreverUso, montarMailtoSuporte } from "../descrever-uso";
import type { PermissaoSerializada } from "../permissoes-da-empresa";
import { MS_POR_DIA } from "../janela";

const AGORA = new Date("2026-06-15T12:00:00Z");
const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA).toISOString();

function limite(usado: number, valor: number, renovaEm: string | null = emDias(8)): PermissaoSerializada {
  return { permitido: usado < valor, limite: valor, usado, restante: Math.max(0, valor - usado), renovaEm };
}

describe("descreverUso", () => {
  it("normal: mostra usado de limite e quando renova, com o percentual", () => {
    expect(descreverUso(limite(12, 90), "documentos", AGORA)).toEqual({
      estado: "normal",
      texto: "12 de 90 documentos · renova em 8 dias",
      percentual: 13,
    });
  });

  it("perto: restante de 20% ou menos do limite", () => {
    expect(descreverUso(limite(72, 90), "documentos", AGORA).estado).toBe("perto");
    expect(descreverUso(limite(71, 90), "documentos", AGORA).estado).toBe("normal");
  });

  it("estourado: cota esgotada, com 100%", () => {
    expect(descreverUso(limite(90, 90), "documentos", AGORA)).toEqual({
      estado: "estourado",
      texto: "90 de 90 documentos · renova em 8 dias",
      percentual: 100,
    });
  });

  it("renova em 1 dia usa o singular", () => {
    expect(descreverUso(limite(1, 3, emDias(1)), "projetos", AGORA).texto).toBe(
      "1 de 3 projetos · renova em 1 dia",
    );
  });

  it("sem data de renovação, não fala em renovação", () => {
    expect(descreverUso(limite(1, 3, null), "projetos", AGORA).texto).toBe("1 de 3 projetos");
  });

  it("ilimitado: sem barra", () => {
    const ilimitada: PermissaoSerializada = {
      permitido: true,
      limite: null,
      usado: 0,
      restante: null,
      renovaEm: null,
    };

    expect(descreverUso(ilimitada, "projetos", AGORA)).toEqual({
      estado: "ilimitado",
      texto: "Sem limite no seu plano",
      percentual: null,
    });
  });

  it("negado: a permissão não está no plano", () => {
    const negada: PermissaoSerializada = {
      permitido: false,
      limite: null,
      usado: 0,
      restante: null,
      renovaEm: null,
    };

    expect(descreverUso(negada, "documentos", AGORA)).toEqual({
      estado: "negado",
      texto: "Não incluído no seu plano",
      percentual: null,
    });
  });
});

describe("montarMailtoSuporte", () => {
  it("monta o mailto com assunto e corpo codificados", () => {
    const url = montarMailtoSuporte({
      email: "suporte@docobra.com",
      empresaNome: "Ancar Engenharia",
      planoChave: "trial",
      motivo: "Atingi o limite de gerar memoriais",
    });

    expect(url.startsWith("mailto:suporte@docobra.com?")).toBe(true);
    const parametros = new URLSearchParams(url.split("?")[1]);
    expect(parametros.get("subject")).toBe("Mudança de plano — DocObra");
    expect(parametros.get("body")).toBe(
      "Olá! Quero mudar de plano no DocObra.\n\nEmpresa: Ancar Engenharia\nPlano atual: trial\nMotivo: Atingi o limite de gerar memoriais\n",
    );
  });

  it("sem plano conhecido, escreve 'não identificado'", () => {
    const url = montarMailtoSuporte({
      email: "suporte@docobra.com",
      empresaNome: "X",
      planoChave: null,
      motivo: "m",
    });

    const parametros = new URLSearchParams(url.split("?")[1]);
    expect(parametros.get("body")).toContain("Plano atual: não identificado");
  });
});
```

`src/lib/permissoes/__tests__/contexto-de-planos.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { empresa, usuario } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { carregarContextoDePlanos } from "../contexto-de-planos";

async function limparBanco() {
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarSessao() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave: "trial", status: "trial", origem: "suporte" });
  return { userId: novoUsuario.id, empresaId: novaEmpresa.id };
}

describe("carregarContextoDePlanos", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(async () => {
    vi.unstubAllEnvs();
    await limparBanco();
  });

  it("junta as permissões e os dados de contato do suporte", async () => {
    vi.stubEnv("SUPORTE_EMAIL", "suporte@docobra.com");
    const sessao = await criarSessao();

    const contexto = await carregarContextoDePlanos(sessao);

    expect(contexto.permissoes["memorial.gerar"].limite).toBe(3);
    expect(contexto.contatoSuporte).toEqual({
      email: "suporte@docobra.com",
      empresaNome: "Ancar Engenharia",
      planoChave: "trial",
    });
  });

  it("sem SUPORTE_EMAIL definida, o email é null", async () => {
    vi.stubEnv("SUPORTE_EMAIL", "");
    const sessao = await criarSessao();

    const contexto = await carregarContextoDePlanos(sessao);

    expect(contexto.contatoSuporte.email).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/permissoes/__tests__/descrever-uso.test.ts src/lib/permissoes/__tests__/contexto-de-planos.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`src/lib/permissoes/descrever-uso.ts`:

```ts
import { MS_POR_DIA } from "./janela";
import type { PermissaoSerializada } from "./permissoes-da-empresa";

export type EstadoUso = "ilimitado" | "normal" | "perto" | "estourado" | "negado";

export interface DescricaoUso {
  estado: EstadoUso;
  texto: string;
  percentual: number | null;
}

const LIMIAR_PERTO = 0.2;

function textoRenovacao(renovaEm: string | null, agora: Date): string {
  if (!renovaEm) return "";
  const dias = Math.max(1, Math.ceil((new Date(renovaEm).getTime() - agora.getTime()) / MS_POR_DIA));
  return ` · renova em ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function descreverUso(
  permissao: PermissaoSerializada,
  unidade: string,
  agora: Date = new Date(),
): DescricaoUso {
  if (!permissao.permitido && permissao.limite === null) {
    return { estado: "negado", texto: "Não incluído no seu plano", percentual: null };
  }
  if (permissao.limite === null) {
    return { estado: "ilimitado", texto: "Sem limite no seu plano", percentual: null };
  }

  const texto = `${permissao.usado} de ${permissao.limite} ${unidade}${textoRenovacao(permissao.renovaEm, agora)}`;
  if (!permissao.permitido) {
    return { estado: "estourado", texto, percentual: 100 };
  }

  const percentual = Math.min(100, Math.round((permissao.usado / permissao.limite) * 100));
  const perto = permissao.restante !== null && permissao.restante / permissao.limite <= LIMIAR_PERTO;
  return { estado: perto ? "perto" : "normal", texto, percentual };
}

export function montarMailtoSuporte(dados: {
  email: string;
  empresaNome: string;
  planoChave: string | null;
  motivo: string;
}): string {
  const assunto = "Mudança de plano — DocObra";
  const corpo =
    "Olá! Quero mudar de plano no DocObra.\n\n" +
    `Empresa: ${dados.empresaNome}\n` +
    `Plano atual: ${dados.planoChave ?? "não identificado"}\n` +
    `Motivo: ${dados.motivo}\n`;

  return `mailto:${dados.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}
```

`src/lib/permissoes/contexto-de-planos.ts`:

```ts
import { buscarAssinaturaVigente } from "@/db/queries/assinatura";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { carregarPermissoesDaEmpresa, type PermissoesDaEmpresa } from "./permissoes-da-empresa";

export interface ContatoSuporte {
  email: string | null;
  empresaNome: string;
  planoChave: string | null;
}

export interface ContextoDePlanos {
  permissoes: PermissoesDaEmpresa;
  contatoSuporte: ContatoSuporte;
}

export async function carregarContextoDePlanos(sessao: {
  userId: string;
  empresaId: string;
}): Promise<ContextoDePlanos> {
  const [permissoes, nomes, assinatura] = await Promise.all([
    carregarPermissoesDaEmpresa(sessao.empresaId),
    buscarNomesUsuarioEEmpresa(sessao.userId),
    buscarAssinaturaVigente(sessao.empresaId),
  ]);

  return {
    permissoes,
    contatoSuporte: {
      email: process.env.SUPORTE_EMAIL || null,
      empresaNome: nomes?.empresaNome ?? "",
      planoChave: assinatura?.planoChave ?? null,
    },
  };
}
```

Em `.env.example`, acrescentar ao final:

```bash

# Planos: email que recebe os pedidos de mudança de plano (botão "Falar com o
# suporte" quando a cota acaba). Sem valor, o botão não aparece.
SUPORTE_EMAIL=""
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/permissoes/__tests__/descrever-uso.test.ts src/lib/permissoes/__tests__/contexto-de-planos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissoes/descrever-uso.ts src/lib/permissoes/contexto-de-planos.ts src/lib/permissoes/__tests__/descrever-uso.test.ts src/lib/permissoes/__tests__/contexto-de-planos.test.ts .env.example
git commit -m "feat(planos): logica do cabecalho de uso, mailto do suporte e contexto das paginas"
```

---

### Task 11: Interface — cabeçalho de uso, botões bloqueados e aba de áudio

**Files:**
- Create: `src/components/common/uso-do-modulo.tsx`
- Modify: `src/app/dashboard/memorial/page.tsx`, `src/app/dashboard/memorial/novo-memorial-drawer.tsx`, `src/app/dashboard/memorial/novo-memorial-form.tsx`
- Modify: `src/app/dashboard/comunique-se/page.tsx`, `src/app/dashboard/comunique-se/novo-comunique-se-drawer.tsx`
- Modify: `src/app/dashboard/projetos/page.tsx`, `src/app/dashboard/projetos/novo-projeto-dialog.tsx`

**Interfaces:**
- Consumes: `usePermissoes`, `usePermissaoDeUso` (Task 9); `descreverUso`, `montarMailtoSuporte` (Task 10); `carregarContextoDePlanos`, `ContatoSuporte` (Task 10); `PermissoesDaEmpresa`; `PermissaoDeUso`, `ROTULOS_DE_USO` (Task 5).
- Produces: `<UsoDoModulo chave unidade permissoesIniciais contatoSuporte />`; `NovoMemorialDrawer`, `NovoComuniqueSeDrawer` e `NovoProjetoDialog` ganham a prop opcional `permissoesIniciais?: PermissoesDaEmpresa`; `NovoMemorialForm` ganha `audioPermitido?: boolean` (padrão `true`).

Não há teste automatizado de componente (o projeto não tem jsdom; a lógica de texto/estado já está testada na Task 10). A verificação visual é a Task 13.

- [ ] **Step 1: Criar o cabeçalho de uso**

`src/components/common/uso-do-modulo.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { usePermissoes } from "@/hooks/use-permissoes";
import { descreverUso, montarMailtoSuporte, type EstadoUso } from "@/lib/permissoes/descrever-uso";
import type { ContatoSuporte } from "@/lib/permissoes/contexto-de-planos";
import type { PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";
import { ROTULOS_DE_USO, type PermissaoDeUso } from "@/lib/permissoes/permissoes-de-uso";

interface UsoDoModuloProps {
  chave: PermissaoDeUso;
  unidade: string;
  permissoesIniciais: PermissoesDaEmpresa;
  contatoSuporte: ContatoSuporte;
}

const COR_DA_BARRA: Record<EstadoUso, string> = {
  ilimitado: "bg-primary",
  normal: "bg-primary",
  perto: "bg-amber-500",
  estourado: "bg-destructive",
  negado: "bg-destructive",
};

export function UsoDoModulo({ chave, unidade, permissoesIniciais, contatoSuporte }: UsoDoModuloProps) {
  const { data } = usePermissoes(permissoesIniciais);
  const permissao = (data ?? permissoesIniciais)[chave];
  const uso = descreverUso(permissao, unidade);
  const bloqueado = uso.estado === "estourado" || uso.estado === "negado";

  const motivo =
    uso.estado === "negado"
      ? `Quero ter acesso a: ${ROTULOS_DE_USO[chave]}`
      : `Atingi o limite do plano para ${ROTULOS_DE_USO[chave]}`;

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="grid gap-1">
        <span className={bloqueado ? "font-medium text-destructive" : "text-muted-foreground"}>{uso.texto}</span>
        {uso.percentual !== null && (
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-[width] ${COR_DA_BARRA[uso.estado]}`}
              style={{ width: `${uso.percentual}%` }}
            />
          </div>
        )}
      </div>
      {bloqueado && contatoSuporte.email && (
        <Button asChild variant="outline" size="sm">
          <a
            href={montarMailtoSuporte({
              email: contatoSuporte.email,
              empresaNome: contatoSuporte.empresaNome,
              planoChave: contatoSuporte.planoChave,
              motivo,
            })}
          >
            Falar com o suporte
          </a>
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Memorial — página, drawer e formulário**

`src/app/dashboard/memorial/page.tsx`: acrescentar aos imports

```tsx
import { UsoDoModulo } from "@/components/common/uso-do-modulo";
import { carregarContextoDePlanos } from "@/lib/permissoes/contexto-de-planos";
```

Acrescentar o carregamento do contexto logo depois da linha `const sessao = await getSessionUser();` (o `Promise.all` existente de memoriais e projetos **não muda**; uma linha separada evita a inferência confusa de uma tupla condicional com `null`):

```tsx
  const contexto = sessao ? await carregarContextoDePlanos(sessao) : null;
```

e substituir o cabeçalho

```tsx
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Memorial Descritivo</h1>
        <NovoMemorialDrawer projetos={projetos} />
      </div>
```

por

```tsx
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Memorial Descritivo</h1>
        <div className="flex items-center gap-4">
          {contexto && (
            <UsoDoModulo
              chave="memorial.gerar"
              unidade="documentos"
              permissoesIniciais={contexto.permissoes}
              contatoSuporte={contexto.contatoSuporte}
            />
          )}
          <NovoMemorialDrawer projetos={projetos} permissoesIniciais={contexto?.permissoes} />
        </div>
      </div>
```

`src/app/dashboard/memorial/novo-memorial-drawer.tsx`: acrescentar aos imports

```tsx
import { usePermissaoDeUso } from "@/hooks/use-permissoes";
import type { PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";
```

Trocar a interface e o início do componente:

```tsx
interface NovoMemorialDrawerProps {
  projetos: Projeto[];
  permissoesIniciais?: PermissoesDaEmpresa;
}

export function NovoMemorialDrawer({ projetos, permissoesIniciais }: NovoMemorialDrawerProps) {
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const queryClient = useQueryClient();
  const gerar = usePermissaoDeUso("memorial.gerar", permissoesIniciais);
  const audio = usePermissaoDeUso("memorial.audio", permissoesIniciais);
```

Trocar `<Button>Novo memorial</Button>` por:

```tsx
        <Button disabled={gerar ? !gerar.permitido : false}>Novo memorial</Button>
```

e `<NovoMemorialForm projetos={projetos} onSuccess={handleSuccess} onPendingChange={setEnviando} />` por:

```tsx
          <NovoMemorialForm
            projetos={projetos}
            onSuccess={handleSuccess}
            onPendingChange={setEnviando}
            audioPermitido={audio ? audio.permitido : true}
          />
```

`src/app/dashboard/memorial/novo-memorial-form.tsx`: trocar a interface de props e a assinatura:

```tsx
interface NovoMemorialFormProps {
  projetos: Projeto[];
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
  audioPermitido?: boolean;
}

export function NovoMemorialForm({ projetos, onSuccess, onPendingChange, audioPermitido = true }: NovoMemorialFormProps) {
```

e substituir o botão de áudio e o que vem logo depois (o `</div>` que fecha o `flex gap-2`):

```tsx
          <Button type="button" variant={modo === "audio" ? "default" : "outline"} onClick={() => setModo("audio")}>
            Gravar áudio
          </Button>
        </div>
```

por:

```tsx
          <Button
            type="button"
            variant={modo === "audio" ? "default" : "outline"}
            disabled={!audioPermitido}
            onClick={() => setModo("audio")}
          >
            Gravar áudio
          </Button>
        </div>
        {!audioPermitido && <p className="text-xs text-muted-foreground">Seu plano não inclui o memorial por áudio.</p>}
```

- [ ] **Step 3: Comunique-se — página e drawer**

`src/app/dashboard/comunique-se/page.tsx`: acrescentar aos imports

```tsx
import { UsoDoModulo } from "@/components/common/uso-do-modulo";
import { carregarContextoDePlanos } from "@/lib/permissoes/contexto-de-planos";
```

Acrescentar, logo depois da linha `const sessao = await getSessionUser();` (o `Promise.all` existente **não muda**):

```tsx
  const contexto = sessao ? await carregarContextoDePlanos(sessao) : null;
```

e substituir o cabeçalho

```tsx
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Comunique-se</h1>
        <NovoComuniqueSeDrawer projetos={projetos} />
      </div>
```

por

```tsx
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Comunique-se</h1>
        <div className="flex items-center gap-4">
          {contexto && (
            <UsoDoModulo
              chave="comunique-se.processar"
              unidade="processamentos por IA"
              permissoesIniciais={contexto.permissoes}
              contatoSuporte={contexto.contatoSuporte}
            />
          )}
          <NovoComuniqueSeDrawer projetos={projetos} />
        </div>
      </div>
```

**Não editar** `src/app/dashboard/comunique-se/novo-comunique-se-drawer.tsx`: o Comunique-se criado à mão não consome cota, então o botão "Novo Comunique-se" **continua habilitado** mesmo com a cota de IA esgotada (diferente do memorial e do projeto, onde todo caminho de criação consome). Quando o envio de PDF esbarra no limite, o 403 aparece na mensagem de erro do formulário (os hooks já repassam `data.error`).

- [ ] **Step 4: Projetos — página e diálogo**

`src/app/dashboard/projetos/novo-projeto-dialog.tsx`: acrescentar aos imports

```tsx
import { usePermissaoDeUso } from "@/hooks/use-permissoes";
import type { PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";
```

Trocar `export function NovoProjetoDialog() {` e as linhas seguintes até `const criar = useCriarProjeto();` por:

```tsx
interface NovoProjetoDialogProps {
  permissoesIniciais?: PermissoesDaEmpresa;
}

export function NovoProjetoDialog({ permissoesIniciais }: NovoProjetoDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const criar = useCriarProjeto();
  const permissao = usePermissaoDeUso("projetos.criar", permissoesIniciais);
```

e `<Button>Novo projeto</Button>` por:

```tsx
        <Button disabled={permissao ? !permissao.permitido : false}>Novo projeto</Button>
```

`src/app/dashboard/projetos/page.tsx`: acrescentar aos imports

```tsx
import { UsoDoModulo } from "@/components/common/uso-do-modulo";
import { carregarContextoDePlanos } from "@/lib/permissoes/contexto-de-planos";
```

Acrescentar, logo depois da linha `const sessao = await getSessionUser();` (o `Promise.all` existente de página e total **não muda**):

```tsx
  const contexto = sessao ? await carregarContextoDePlanos(sessao) : null;
```

Substituir, no cabeçalho, `        <NovoProjetoDialog />\n      </div>\n\n      {total === 0 ? (` por:

```tsx
        <div className="flex items-center gap-4">
          {contexto && (
            <UsoDoModulo
              chave="projetos.criar"
              unidade="projetos"
              permissoesIniciais={contexto.permissoes}
              contatoSuporte={contexto.contatoSuporte}
            />
          )}
          <NovoProjetoDialog permissoesIniciais={contexto?.permissoes} />
        </div>
      </div>

      {total === 0 ? (
```

e, no estado vazio, trocar o segundo `<NovoProjetoDialog />` por `<NovoProjetoDialog permissoesIniciais={contexto?.permissoes} />`. Trocar também o `<div className="flex items-center justify-between">` do cabeçalho de projetos por `<div className="flex items-center justify-between gap-4">`.

- [ ] **Step 5: Tipos, lint e suíte relacionada**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npx eslint src/components/common/uso-do-modulo.tsx src/app/dashboard/memorial src/app/dashboard/comunique-se src/app/dashboard/projetos src/hooks`
Expected: sem erros nos arquivos tocados.

- [ ] **Step 6: Commit**

```bash
git add src/components/common/uso-do-modulo.tsx src/app/dashboard
git commit -m "feat(planos): cabecalho de uso nos modulos, botoes bloqueados e aba de audio condicionada ao plano"
```

---

### Task 12: Script de ajuste manual pelo suporte (`admin-plano`)

**Files:**
- Create: `scripts/admin-plano.mjs`, `scripts/admin-plano.d.mts`
- Modify: `package.json`
- Test: `src/db/__tests__/admin-plano.test.ts`

**Interfaces:**
- Produces (`scripts/admin-plano.mjs`):
  - `janelaAtual(ancora: Date, janelaDias: number, agora: Date): { inicio: Date; fim: Date }` (mesma regra de `calcularJanela`; duplicada porque o script é `.mjs` sem acesso ao TypeScript);
  - `mostrarEmpresa(client, email, opcoes?: { agora?: Date })` → `{ empresa: { id, nome }, assinatura: { status, inicio, venceEm, plano }, permissoes: { chave, origem: "sobrescrita" | "plano", valor, janelaDias, usado, janela }[] }`;
  - `trocarPlano(client, email, planoChave, opcoes?: { agora?: Date })` → `{ de, para, statusAnterior, statusNovo }` — fecha o trecho vigente e abre outro (origem `suporte`), mantém dia 0 e consumo; se a assinatura era `trial` e o plano de destino não é interno, o status passa a `ativa`;
  - `definirCota(client, email, { permissao, valor, janelaDias, expiraEm?, motivo?, agora? })` — upsert em `empresa_permissao` (`valor` e `janelaDias` ambos `null` = ilimitado; o início da sobrescrita passa a ser `agora`);
  - `estenderVencimento(client, email, dias, opcoes?: { agora?: Date })` → `{ venceEm }`;
  - `lerArgumentos(argv: string[])` → `{ acao, email, plano, permissao, valor, janelaDias, expiraEm, motivo, dias }`.
- Todas as funções lançam `Error` com mensagem clara para email, plano ou permissão inexistente.

- [ ] **Step 1: Escrever o teste que falha**

`src/db/__tests__/admin-plano.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Client } from "pg";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { assinatura, assinaturaTrecho, empresa, empresaPermissao, plano, usuario } from "@/db/schema";
import { calcularJanela, MS_POR_DIA } from "@/lib/permissoes/janela";
import { verificarPermissao } from "@/lib/permissoes/verificar-permissao";
import {
  definirCota,
  estenderVencimento,
  janelaAtual,
  lerArgumentos,
  mostrarEmpresa,
  trocarPlano,
} from "../../../scripts/admin-plano.mjs";
import { semearCatalogoNoBancoDeTeste } from "./helpers/semear-catalogo";

const AGORA = new Date("2026-06-15T12:00:00Z");
const EMAIL = "cliente@teste.com";

let client: Client;

beforeAll(async () => {
  await semearCatalogoNoBancoDeTeste();
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await db.delete(usuario);
  await db.delete(empresa);
});

async function criarCliente(planoChave: string, status: "trial" | "ativa" = "trial") {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Empresa Cliente" }).returning();
  await db
    .insert(usuario)
    .values({ nome: "Cliente", email: EMAIL, senhaHash: "hash-fake", empresaId: novaEmpresa.id });
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave, status, origem: "suporte", inicio: AGORA });
  return novaEmpresa.id;
}

describe("janelaAtual", () => {
  it("é idêntica a calcularJanela", () => {
    const ancora = new Date("2026-03-01T00:00:00Z");
    for (const [janelaDias, dias] of [[30, 0], [30, 29], [30, 30], [30, 95], [360, 400], [30, -5]] as const) {
      const agora = new Date(ancora.getTime() + dias * MS_POR_DIA);
      expect(janelaAtual(ancora, janelaDias, agora)).toEqual(calcularJanela(ancora, janelaDias, agora));
    }
  });
});

describe("lerArgumentos", () => {
  it("lê a ação e as opções nomeadas", () => {
    expect(
      lerArgumentos([
        "cota",
        "--email=a@b.com",
        "--permissao=memorial.gerar",
        "--valor=50",
        "--janela-dias=30",
        "--expira-em=2026-12-31",
        "--motivo=piloto",
      ]),
    ).toEqual({
      acao: "cota",
      email: "a@b.com",
      permissao: "memorial.gerar",
      valor: 50,
      janelaDias: 30,
      expiraEm: new Date("2026-12-31"),
      motivo: "piloto",
    });
  });

  it("valor=ilimitado vira null", () => {
    expect(lerArgumentos(["cota", "--valor=ilimitado"]).valor).toBeNull();
  });

  it("lê --plano e --dias", () => {
    expect(lerArgumentos(["trocar-plano", "--plano=essencial"]).plano).toBe("essencial");
    expect(lerArgumentos(["estender", "--dias=10"]).dias).toBe(10);
  });
});

describe("mostrarEmpresa", () => {
  it("mostra plano, vencimento, uso na janela e sobrescritas", async () => {
    const empresaId = await criarCliente("trial");
    await registrarConsumo(empresaId, "memorial.gerar", "m1", { agora: AGORA });
    await definirCota(client, EMAIL, { permissao: "projetos.criar", valor: 50, janelaDias: 30, agora: AGORA });

    const resultado = await mostrarEmpresa(client, EMAIL, { agora: AGORA });

    expect(resultado.empresa.nome).toBe("Empresa Cliente");
    expect(resultado.assinatura.plano).toBe("trial");
    expect(resultado.assinatura.status).toBe("trial");
    const gerar = resultado.permissoes.find((p) => p.chave === "memorial.gerar");
    expect(gerar).toMatchObject({ origem: "plano", valor: 3, janelaDias: 14, usado: 1 });
    const projetos = resultado.permissoes.find((p) => p.chave === "projetos.criar");
    expect(projetos).toMatchObject({ origem: "sobrescrita", valor: 50, janelaDias: 30, usado: 0 });
  });

  it("lança erro claro para email inexistente", async () => {
    await expect(mostrarEmpresa(client, "ninguem@teste.com")).rejects.toThrow(
      'Nenhum usuário com o email "ninguem@teste.com"',
    );
  });
});

describe("trocarPlano", () => {
  it("fecha o trecho, abre outro e mantém o dia 0 e o consumo", async () => {
    const empresaId = await criarCliente("trial");
    await registrarConsumo(empresaId, "memorial.gerar", "m1", { agora: AGORA });
    const depois = new Date(AGORA.getTime() + 5 * MS_POR_DIA);

    const resultado = await trocarPlano(client, EMAIL, "essencial", { agora: depois });

    expect(resultado).toEqual({ de: "trial", para: "essencial", statusAnterior: "trial", statusNovo: "ativa" });
    const [assinaturaAtual] = await db.select().from(assinatura).where(eq(assinatura.empresaId, empresaId));
    expect(assinaturaAtual.inicio).toEqual(AGORA);
    expect(assinaturaAtual.status).toBe("ativa");

    const trechos = await db
      .select({ plano: plano.chave, inicio: assinaturaTrecho.inicio, fim: assinaturaTrecho.fim, origem: assinaturaTrecho.origem })
      .from(assinaturaTrecho)
      .innerJoin(plano, eq(plano.id, assinaturaTrecho.planoId))
      .where(eq(assinaturaTrecho.assinaturaId, assinaturaAtual.id));
    expect(trechos).toHaveLength(2);
    expect(trechos.find((t) => t.plano === "trial")?.fim).toEqual(depois);
    expect(trechos.find((t) => t.plano === "essencial")).toMatchObject({ fim: null, origem: "suporte" });

    const verificada = await verificarPermissao(empresaId, "memorial.gerar", depois);
    expect(verificada).toMatchObject({ limite: 20, usado: 1 });
  });

  it("não muda o status de uma assinatura já ativa", async () => {
    await criarCliente("essencial", "ativa");

    const resultado = await trocarPlano(client, EMAIL, "escritorio", { agora: AGORA });

    expect(resultado.statusNovo).toBe("ativa");
  });

  it("rejeita o plano em que a empresa já está", async () => {
    await criarCliente("trial");

    await expect(trocarPlano(client, EMAIL, "trial", { agora: AGORA })).rejects.toThrow(
      'A empresa já está no plano "trial"',
    );
  });

  it("rejeita plano inexistente", async () => {
    await criarCliente("trial");

    await expect(trocarPlano(client, EMAIL, "nao-existe", { agora: AGORA })).rejects.toThrow(
      'Plano "nao-existe" não encontrado',
    );
  });
});

describe("definirCota", () => {
  it("cria a sobrescrita e a verificarPermissao passa a usá-la", async () => {
    const empresaId = await criarCliente("trial");

    await definirCota(client, EMAIL, {
      permissao: "memorial.gerar",
      valor: 50,
      janelaDias: 30,
      motivo: "piloto",
      agora: AGORA,
    });

    const [linha] = await db.select().from(empresaPermissao).where(eq(empresaPermissao.empresaId, empresaId));
    expect(linha).toMatchObject({ valor: 50, janelaDias: 30, motivo: "piloto" });
    expect(await verificarPermissao(empresaId, "memorial.gerar", AGORA)).toMatchObject({ limite: 50, restante: 50 });
  });

  it("atualiza a sobrescrita existente", async () => {
    const empresaId = await criarCliente("trial");
    await definirCota(client, EMAIL, { permissao: "memorial.gerar", valor: 50, janelaDias: 30, agora: AGORA });

    await definirCota(client, EMAIL, { permissao: "memorial.gerar", valor: 80, janelaDias: 60, agora: AGORA });

    const linhas = await db.select().from(empresaPermissao).where(eq(empresaPermissao.empresaId, empresaId));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ valor: 80, janelaDias: 60 });
  });

  it("valor e janela nulos significam ilimitado", async () => {
    const empresaId = await criarCliente("trial");

    await definirCota(client, EMAIL, { permissao: "memorial.gerar", valor: null, janelaDias: null, agora: AGORA });

    expect(await verificarPermissao(empresaId, "memorial.gerar", AGORA)).toMatchObject({ permitido: true, limite: null });
  });

  it("rejeita valor sem janela e janela sem valor", async () => {
    await criarCliente("trial");

    await expect(
      definirCota(client, EMAIL, { permissao: "memorial.gerar", valor: 5, janelaDias: null }),
    ).rejects.toThrow("valor e janela-dias");
    await expect(
      definirCota(client, EMAIL, { permissao: "memorial.gerar", valor: null, janelaDias: 30 }),
    ).rejects.toThrow("valor e janela-dias");
  });

  it("rejeita permissão inexistente", async () => {
    await criarCliente("trial");

    await expect(
      definirCota(client, EMAIL, { permissao: "nao.existe", valor: 5, janelaDias: 30 }),
    ).rejects.toThrow('Permissão "nao.existe" não encontrada');
  });
});

describe("estenderVencimento", () => {
  it("soma os dias ao vencimento", async () => {
    const empresaId = await criarCliente("trial");
    const [antes] = await db.select().from(assinatura).where(eq(assinatura.empresaId, empresaId));

    const resultado = await estenderVencimento(client, EMAIL, 10, { agora: AGORA });

    expect(resultado.venceEm).toEqual(new Date(antes.venceEm.getTime() + 10 * MS_POR_DIA));
  });

  it("rejeita dias que não sejam inteiro positivo", async () => {
    await criarCliente("trial");

    await expect(estenderVencimento(client, EMAIL, 0)).rejects.toThrow("inteiro positivo");
    await expect(estenderVencimento(client, EMAIL, -3)).rejects.toThrow("inteiro positivo");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/db/__tests__/admin-plano.test.ts`
Expected: FAIL (`Failed to resolve import "../../../scripts/admin-plano.mjs"`).

- [ ] **Step 3: Implementar `scripts/admin-plano.mjs`**

```js
#!/usr/bin/env node
/**
 * Ajuste manual do plano de uma empresa pelo suporte. A empresa é identificada
 * pelo email de um usuário dela.
 *
 * Uso:
 *   node scripts/admin-plano.mjs mostrar --email=<usuario>
 *   node scripts/admin-plano.mjs trocar-plano --email=<usuario> --plano=<chave>
 *   node scripts/admin-plano.mjs cota --email=<usuario> --permissao=<chave> --valor=<n|ilimitado> --janela-dias=<n> [--expira-em=<data>] [--motivo=<texto>]
 *   node scripts/admin-plano.mjs estender --email=<usuario> --dias=<n>
 *
 * trocar-plano mantém o dia 0 e o consumo e não gera cobrança.
 * cota recomeça a janela da sobrescrita a partir de agora.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Mesma regra de src/lib/permissoes/janela.ts (calcularJanela); o teste garante que não divergem.
export function janelaAtual(ancora, janelaDias, agora) {
  const duracao = janelaDias * MS_POR_DIA;
  const decorrido = Math.max(0, agora.getTime() - ancora.getTime());
  const indice = Math.floor(decorrido / duracao);
  const inicio = new Date(ancora.getTime() + indice * duracao);
  return { inicio, fim: new Date(inicio.getTime() + duracao) };
}

async function buscarEmpresaPorEmail(client, email) {
  const { rows } = await client.query(
    `SELECT u.empresa_id AS "empresaId", e.nome AS "empresaNome"
     FROM usuario u JOIN empresa e ON e.id = u.empresa_id
     WHERE u.email = $1`,
    [email],
  );
  if (rows.length === 0) throw new Error(`Nenhum usuário com o email "${email}".`);
  return rows[0];
}

async function buscarAssinatura(client, empresaId) {
  const { rows } = await client.query(
    `SELECT a.id, a.inicio, a.status, a.vence_em AS "venceEm",
            t.id AS "trechoId", t.plano_id AS "planoId", p.chave AS "planoChave"
     FROM assinatura a
     JOIN assinatura_trecho t ON t.assinatura_id = a.id AND t.fim IS NULL
     JOIN plano p ON p.id = t.plano_id
     WHERE a.empresa_id = $1`,
    [empresaId],
  );
  if (rows.length === 0) throw new Error("A empresa não tem assinatura.");
  return rows[0];
}

export async function mostrarEmpresa(client, email, { agora = new Date() } = {}) {
  const empresa = await buscarEmpresaPorEmail(client, email);
  const assinatura = await buscarAssinatura(client, empresa.empresaId);

  const { rows: doPlano } = await client.query(
    `SELECT pe.id AS "permissaoId", pe.chave, pp.valor, pp.janela_dias AS "janelaDias"
     FROM plano_permissao pp JOIN permissao pe ON pe.id = pp.permissao_id
     WHERE pp.plano_id = $1`,
    [assinatura.planoId],
  );
  const { rows: sobrescritas } = await client.query(
    `SELECT pe.id AS "permissaoId", pe.chave, ep.valor, ep.janela_dias AS "janelaDias", ep.inicio
     FROM empresa_permissao ep JOIN permissao pe ON pe.id = ep.permissao_id
     WHERE ep.empresa_id = $1 AND ep.inicio <= $2 AND (ep.expira_em IS NULL OR ep.expira_em > $2)`,
    [empresa.empresaId, agora],
  );

  const concessoes = new Map();
  for (const linha of doPlano) {
    concessoes.set(linha.chave, { ...linha, origem: "plano", ancora: assinatura.inicio });
  }
  for (const linha of sobrescritas) {
    concessoes.set(linha.chave, { ...linha, origem: "sobrescrita", ancora: linha.inicio });
  }

  const permissoes = [];
  for (const concessao of concessoes.values()) {
    let usado = null;
    let janela = null;
    if (concessao.valor !== null && concessao.janelaDias !== null) {
      janela = janelaAtual(concessao.ancora, concessao.janelaDias, agora);
      const { rows } = await client.query(
        `SELECT COALESCE(SUM(quantidade), 0)::int AS total FROM consumo
         WHERE empresa_id = $1 AND permissao_id = $2 AND ocorrido_em >= $3 AND ocorrido_em < $4`,
        [empresa.empresaId, concessao.permissaoId, janela.inicio, janela.fim],
      );
      usado = rows[0].total;
    }
    permissoes.push({
      chave: concessao.chave,
      origem: concessao.origem,
      valor: concessao.valor,
      janelaDias: concessao.janelaDias,
      usado,
      janela,
    });
  }
  permissoes.sort((a, b) => a.chave.localeCompare(b.chave));

  return {
    empresa: { id: empresa.empresaId, nome: empresa.empresaNome },
    assinatura: {
      status: assinatura.status,
      inicio: assinatura.inicio,
      venceEm: assinatura.venceEm,
      plano: assinatura.planoChave,
    },
    permissoes,
  };
}

export async function trocarPlano(client, email, planoChave, { agora = new Date() } = {}) {
  const empresa = await buscarEmpresaPorEmail(client, email);
  const assinatura = await buscarAssinatura(client, empresa.empresaId);

  const { rows: planos } = await client.query("SELECT id, interno FROM plano WHERE chave = $1", [planoChave]);
  if (planos.length === 0) throw new Error(`Plano "${planoChave}" não encontrado.`);
  if (planos[0].id === assinatura.planoId) {
    throw new Error(`A empresa já está no plano "${planoChave}".`);
  }

  const statusNovo =
    assinatura.status === "trial" && !planos[0].interno ? "ativa" : assinatura.status;

  await client.query("BEGIN");
  try {
    await client.query("UPDATE assinatura_trecho SET fim = $1 WHERE id = $2", [agora, assinatura.trechoId]);
    await client.query(
      `INSERT INTO assinatura_trecho (assinatura_id, plano_id, inicio, origem)
       VALUES ($1, $2, $3, 'suporte')`,
      [assinatura.id, planos[0].id, agora],
    );
    if (statusNovo !== assinatura.status) {
      await client.query("UPDATE assinatura SET status = $1, updated_at = $2 WHERE id = $3", [
        statusNovo,
        agora,
        assinatura.id,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  return { de: assinatura.planoChave, para: planoChave, statusAnterior: assinatura.status, statusNovo };
}

export async function definirCota(
  client,
  email,
  { permissao, valor, janelaDias, expiraEm = null, motivo = "", agora = new Date() },
) {
  if ((valor === null) !== (janelaDias === null)) {
    throw new Error("valor e janela-dias devem vir juntos (ou ambos ilimitado).");
  }

  const empresa = await buscarEmpresaPorEmail(client, email);
  const { rows } = await client.query("SELECT id FROM permissao WHERE chave = $1", [permissao]);
  if (rows.length === 0) throw new Error(`Permissão "${permissao}" não encontrada.`);

  await client.query(
    `INSERT INTO empresa_permissao (empresa_id, permissao_id, valor, janela_dias, inicio, expira_em, motivo)
     VALUES ($1, $2, $3::int, $4::int, $5, $6, $7)
     ON CONFLICT (empresa_id, permissao_id) DO UPDATE SET
       valor = EXCLUDED.valor,
       janela_dias = EXCLUDED.janela_dias,
       inicio = EXCLUDED.inicio,
       expira_em = EXCLUDED.expira_em,
       motivo = EXCLUDED.motivo`,
    [empresa.empresaId, rows[0].id, valor, janelaDias, agora, expiraEm, motivo],
  );
}

export async function estenderVencimento(client, email, dias, { agora = new Date() } = {}) {
  if (!Number.isInteger(dias) || dias <= 0) {
    throw new Error("--dias deve ser um inteiro positivo.");
  }

  const empresa = await buscarEmpresaPorEmail(client, email);
  const assinatura = await buscarAssinatura(client, empresa.empresaId);

  const { rows } = await client.query(
    `UPDATE assinatura SET vence_em = vence_em + ($1::int * interval '1 day'), updated_at = $2
     WHERE id = $3
     RETURNING vence_em AS "venceEm"`,
    [dias, agora, assinatura.id],
  );
  return { venceEm: rows[0].venceEm };
}

export function lerArgumentos(argv) {
  const [acao, ...resto] = argv;
  const args = { acao };

  for (const arg of resto) {
    const match = arg.match(/^--([a-z-]+)=(.*)$/);
    if (!match) continue;
    const [, nome, valor] = match;

    if (nome === "email") args.email = valor;
    else if (nome === "plano") args.plano = valor;
    else if (nome === "permissao") args.permissao = valor;
    else if (nome === "valor") args.valor = valor === "ilimitado" ? null : Number(valor);
    else if (nome === "janela-dias") args.janelaDias = Number(valor);
    else if (nome === "expira-em") args.expiraEm = new Date(valor);
    else if (nome === "motivo") args.motivo = valor;
    else if (nome === "dias") args.dias = Number(valor);
  }

  return args;
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

function exigir(valor, flag) {
  if (valor === undefined) throw new Error(`Faltou ${flag}.`);
  return valor;
}

async function main() {
  const args = lerArgumentos(process.argv.slice(2));
  const env = { ...(await readEnvFile()), ...process.env };

  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL não encontrada (nem no ambiente, nem no .env).");
    process.exit(1);
  }

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    const email = exigir(args.email, "--email");

    if (args.acao === "mostrar") {
      console.log(JSON.stringify(await mostrarEmpresa(client, email), null, 2));
    } else if (args.acao === "trocar-plano") {
      const resultado = await trocarPlano(client, email, exigir(args.plano, "--plano"));
      console.log(JSON.stringify(resultado, null, 2));
      if (resultado.statusAnterior !== resultado.statusNovo) {
        console.log('O status passou de trial para ativa; ajuste o vencimento com a ação "estender" se precisar.');
      }
    } else if (args.acao === "cota") {
      await definirCota(client, email, {
        permissao: exigir(args.permissao, "--permissao"),
        valor: exigir(args.valor, "--valor"),
        janelaDias: args.valor === null ? null : exigir(args.janelaDias, "--janela-dias"),
        expiraEm: args.expiraEm ?? null,
        motivo: args.motivo ?? "",
      });
      console.log("Cota definida.");
    } else if (args.acao === "estender") {
      console.log(JSON.stringify(await estenderVencimento(client, email, exigir(args.dias, "--dias")), null, 2));
    } else {
      throw new Error('Ação desconhecida. Use: mostrar, trocar-plano, cota ou estender.');
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
```

`scripts/admin-plano.d.mts`:

```ts
import type { Client } from "pg";

export interface Janela {
  inicio: Date;
  fim: Date;
}

export function janelaAtual(ancora: Date, janelaDias: number, agora: Date): Janela;

export interface PermissaoMostrada {
  chave: string;
  origem: "sobrescrita" | "plano";
  valor: number | null;
  janelaDias: number | null;
  usado: number | null;
  janela: Janela | null;
}

export interface EmpresaMostrada {
  empresa: { id: string; nome: string };
  assinatura: { status: string; inicio: Date; venceEm: Date; plano: string };
  permissoes: PermissaoMostrada[];
}

export function mostrarEmpresa(client: Client, email: string, opcoes?: { agora?: Date }): Promise<EmpresaMostrada>;

export function trocarPlano(
  client: Client,
  email: string,
  planoChave: string,
  opcoes?: { agora?: Date },
): Promise<{ de: string; para: string; statusAnterior: string; statusNovo: string }>;

export interface OpcoesCota {
  permissao: string;
  valor: number | null;
  janelaDias: number | null;
  expiraEm?: Date | null;
  motivo?: string;
  agora?: Date;
}

export function definirCota(client: Client, email: string, opcoes: OpcoesCota): Promise<void>;

export function estenderVencimento(
  client: Client,
  email: string,
  dias: number,
  opcoes?: { agora?: Date },
): Promise<{ venceEm: Date }>;

export interface Argumentos {
  acao: string | undefined;
  email?: string;
  plano?: string;
  permissao?: string;
  valor?: number | null;
  janelaDias?: number;
  expiraEm?: Date;
  motivo?: string;
  dias?: number;
}

export function lerArgumentos(argv: string[]): Argumentos;
```

Em `package.json`, no bloco `"scripts"`, depois de `"seed:planos": "node scripts/seed-planos.mjs"`, acrescentar (com vírgula na linha anterior):

```json
    "admin:plano": "node scripts/admin-plano.mjs"
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/db/__tests__/admin-plano.test.ts`
Expected: PASS (todos os testes).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add scripts/admin-plano.mjs scripts/admin-plano.d.mts src/db/__tests__/admin-plano.test.ts package.json
git commit -m "feat(planos): script admin-plano para o suporte ajustar plano, cota e vencimento"
```

---

### Task 13: Verificação final e checagem visual no navegador

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Suíte inteira, tipos e lint**

Run: `npm test`
Expected: tudo PASS, sem regressão nos testes anteriores.

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npx eslint $(git diff --name-only main...HEAD | grep -E '\.(ts|tsx|mjs)$' | tr '\n' ' ')`
Expected: sem erros nos arquivos desta branch (o lint do projeto tem 12 erros antigos em arquivos que não são desta fase; não corrigir).

- [ ] **Step 2: Subir o app e preparar duas contas**

Run (em segundo plano): `npm run dev` (porta 3000).

Criar uma conta nova pela tela `/register` (cai no plano `trial`, com `SUPORTE_EMAIL` definida no `.env` do ambiente de teste, p. ex. `SUPORTE_EMAIL="suporte@docobra.com"`; reiniciar o dev server depois de editar o `.env`). Usar uma segunda conta de dev (plano `escritorio`) como contraste.

- [ ] **Step 3: Conferir a interface (conta trial)**

Verificar, olhando as telas (Playwright ou navegador):
1. `/dashboard/projetos`: cabeçalho mostra "0 de 2 projetos · renova em 14 dias" com a barra vazia.
2. Criar 2 projetos: após o 2º, o texto vira "2 de 2 projetos · ..." em vermelho, a barra fica cheia, o botão "Novo projeto" fica **desabilitado** e aparece "Falar com o suporte".
3. Clicar em "Falar com o suporte" abre o cliente de email com assunto "Mudança de plano — DocObra" e o corpo com a empresa, "Plano atual: trial" e o motivo.
4. `/dashboard/memorial` e `/dashboard/comunique-se`: cabeçalho mostra "0 de 3 documentos · renova em 14 dias" e "0 de 3 processamentos por IA · ...".
5. Abrir "Novo memorial": a aba "Gravar áudio" está habilitada (o trial inclui áudio).
6. Conta `escritorio`: `/dashboard/projetos` mostra "Sem limite no seu plano" e o botão fica sempre habilitado.

- [ ] **Step 4: Conferir o suporte ajustando o plano**

Run: `npm run admin:plano -- mostrar --email=<email da conta trial>`
Expected: JSON com plano `trial`, o `vence_em` e as permissões com o uso (`projetos.criar` 2 de 2).

Run: `npm run admin:plano -- trocar-plano --email=<email da conta trial> --plano=essencial`
Expected: `{ de: "trial", para: "essencial", statusAnterior: "trial", statusNovo: "ativa" }` e a mensagem sobre o vencimento. Recarregar `/dashboard/projetos`: o cabeçalho passa para "2 de 10 projetos · ..." e o botão volta a ficar habilitado (o consumo foi mantido).

Run: `npm run admin:plano -- cota --email=<email da conta trial> --permissao=projetos.criar --valor=ilimitado`
Expected: "Cota definida." Recarregar: "Sem limite no seu plano".

- [ ] **Step 5: Resumo para o Victor**

Sem código. Registrar no resumo final: o que mudou na interface, os dois comandos do suporte mais usados (`trocar-plano` e `cota`), e que `ASSINATURA_SUSPENSAO_ATIVA` continua `false` até a Fase 4. Lembrar também de definir `SUPORTE_EMAIL` no ambiente de produção (Coolify), senão o botão de contato não aparece.
