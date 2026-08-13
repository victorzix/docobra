# Gerador de Memorial Descritivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formulário de 3 blocos (com toggle texto/áudio no bloco de especificações técnicas) → duas chamadas de LLM → PDF em ABNT via Puppeteer, com listagem e download.

**Architecture:** Pipeline síncrono isolado em `src/lib/memorial/gerar.ts` (orquestra query layer + `memorialRouter` + template HTML + Puppeteer + storage em disco), chamado por um Route Handler fino (`POST /api/memoriais`). Uma segunda rota (`GET /api/memoriais/[id]/pdf`) serve o arquivo, reautorizando pelo `id` a cada request.

**Tech Stack:** Next.js App Router, Drizzle, Zod, React Hook Form, React Query, Puppeteer (novo), shadcn (`Card`, `Button`, `Input`, `Label`, `Textarea` — todos já instalados).

## Global Constraints

- Puppeteer **já verificado funcionando neste ambiente** (`npm install puppeteer` baixa o Chromium corretamente, `page.pdf()` produz um PDF válido — confirmado antes deste plano ser escrito).
- Toggle texto/áudio é **um só pro bloco 3 inteiro** (não por sistema) — bate com `audioUrl` sendo uma coluna só.
- `POST /api/memoriais` e `GET /api/memoriais/[id]/pdf` leem a sessão direto do `NextRequest` (não `getSessionUser()`) — mesmo motivo e mesmo padrão do CRUD de Projeto: `next/headers`'s `cookies()` lança erro fora do request scope real do Next, o que quebraria os testes chamando os handlers direto.
- Falha em qualquer etapa da geração deixa o registro em `status: "rascunho"`, sem `documentoGeradoUrl` — sem retry automático.
- PDF e áudio ficam em `storage/memoriais/` (disco local, relativo à raiz do projeto) — **adicionar ao `.gitignore`** na Task 3.
- Sem teste de UI do formulário/gravador de áudio (mesmo padrão do projeto — sem RTL/jsdom); cobertura por testes de integração (query layer, pipeline, rotas) + verificação manual.
- Todo teste que chama `memorialRouter` usa mock (`vi.mock("@/core/llm", ...)`) — nenhum teste faz chamada real de API de LLM. Puppeteer, banco e storage em disco são reais nos testes (mesma filosofia já usada no resto do projeto).

---

### Task 1: Query layer (`memorial.ts` + adição em `projeto.ts`)

**Files:**
- Create: `src/db/queries/memorial.ts`
- Modify: `src/db/queries/projeto.ts` (adicionar `buscarProjetoDaEmpresa`)
- Test: `src/db/queries/__tests__/memorial.test.ts`
- Test: modificar `src/db/queries/__tests__/projeto.test.ts` (adicionar testes de `buscarProjetoDaEmpresa`)

**Interfaces:**
- Produces: `export interface Memorial { id: string; projetoId: string; status: string; documentoGeradoUrl: string | null; audioUrl: string | null; createdAt: Date }`, `export interface MemorialComProjeto extends Memorial { projetoNome: string }`, `criarMemorialRascunho(input: { projetoId: string; respostasFormularioJson: unknown }): Promise<Memorial>`, `listarMemoriais(empresaId: string): Promise<MemorialComProjeto[]>`, `buscarMemorialDaEmpresa(id: string, empresaId: string): Promise<Memorial | null>`, `marcarComoGerado(id: string, input: { documentoGeradoUrl: string; audioUrl?: string; respostasFormularioJson?: unknown }): Promise<void>`. Em `projeto.ts`: `buscarProjetoDaEmpresa(id: string, empresaId: string): Promise<Projeto | null>`.
- Consumes: nada de tasks anteriores deste plano (é a base). Tasks 5, 6 e 7 chamam essas funções.

- [ ] **Step 1: Escrever os testes de `memorial.ts` (vão falhar — o módulo não existe)**

Crie `src/db/queries/__tests__/memorial.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { empresa, memorialDescritivo, projeto } from "@/db/schema";
import {
  buscarMemorialDaEmpresa,
  criarMemorialRascunho,
  listarMemoriais,
  marcarComoGerado,
} from "../memorial";

async function limparBanco() {
  await db.delete(memorialDescritivo);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarProjetoDeTeste(nomeEmpresa = "Ancar Engenharia") {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: nomeEmpresa }).returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  return { empresa: novaEmpresa, projeto: novoProjeto };
}

describe("criarMemorialRascunho", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria com status rascunho e as respostas informadas", async () => {
    const { projeto: novoProjeto } = await criarProjetoDeTeste();

    const resultado = await criarMemorialRascunho({
      projetoId: novoProjeto.id,
      respostasFormularioJson: { tipoConstrucao: "residencial" },
    });

    expect(resultado.status).toBe("rascunho");
    expect(resultado.documentoGeradoUrl).toBeNull();
  });
});

describe("listarMemoriais", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("lista só os memoriais da empresa pedida, com o nome do projeto", async () => {
    const { empresa: empresaA, projeto: projetoA } = await criarProjetoDeTeste("Empresa A");
    const { projeto: projetoB } = await criarProjetoDeTeste("Empresa B");
    await criarMemorialRascunho({ projetoId: projetoA.id, respostasFormularioJson: {} });
    await criarMemorialRascunho({ projetoId: projetoB.id, respostasFormularioJson: {} });

    const resultado = await listarMemoriais(empresaA.id);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].projetoNome).toBe("Casa da Praia");
  });

  it("retorna lista vazia quando a empresa não tem memoriais", async () => {
    const { empresa: novaEmpresa } = await criarProjetoDeTeste();

    const resultado = await listarMemoriais(novaEmpresa.id);

    expect(resultado).toEqual([]);
  });
});

describe("buscarMemorialDaEmpresa", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("retorna o memorial quando pertence à empresa", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const criado = await criarMemorialRascunho({ projetoId: novoProjeto.id, respostasFormularioJson: {} });

    const resultado = await buscarMemorialDaEmpresa(criado.id, novaEmpresa.id);

    expect(resultado?.id).toBe(criado.id);
  });

  it("retorna null quando o memorial é de outra empresa", async () => {
    const { projeto: projetoA } = await criarProjetoDeTeste("Empresa A");
    const { empresa: empresaB } = await criarProjetoDeTeste("Empresa B");
    const criado = await criarMemorialRascunho({ projetoId: projetoA.id, respostasFormularioJson: {} });

    const resultado = await buscarMemorialDaEmpresa(criado.id, empresaB.id);

    expect(resultado).toBeNull();
  });
});

describe("marcarComoGerado", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("atualiza status, documentoGeradoUrl e respostasFormularioJson", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const criado = await criarMemorialRascunho({ projetoId: novoProjeto.id, respostasFormularioJson: {} });

    await marcarComoGerado(criado.id, {
      documentoGeradoUrl: `/api/memoriais/${criado.id}/pdf`,
      respostasFormularioJson: { tipoConstrucao: "residencial" },
    });

    const resultado = await buscarMemorialDaEmpresa(criado.id, novaEmpresa.id);
    expect(resultado?.status).toBe("gerado");
    expect(resultado?.documentoGeradoUrl).toBe(`/api/memoriais/${criado.id}/pdf`);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/db/queries/__tests__/memorial.test.ts`
Expected: FAIL — `Cannot find module '../memorial'` (ou equivalente).

- [ ] **Step 3: Implementar `memorial.ts`**

Crie `src/db/queries/memorial.ts`:

```ts
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { memorialDescritivo, projeto } from "@/db/schema";

export interface Memorial {
  id: string;
  projetoId: string;
  status: string;
  documentoGeradoUrl: string | null;
  audioUrl: string | null;
  createdAt: Date;
}

export interface MemorialComProjeto extends Memorial {
  projetoNome: string;
}

const CAMPOS_MEMORIAL = {
  id: memorialDescritivo.id,
  projetoId: memorialDescritivo.projetoId,
  status: memorialDescritivo.status,
  documentoGeradoUrl: memorialDescritivo.documentoGeradoUrl,
  audioUrl: memorialDescritivo.audioUrl,
  createdAt: memorialDescritivo.createdAt,
};

export async function criarMemorialRascunho(input: {
  projetoId: string;
  respostasFormularioJson: unknown;
}): Promise<Memorial> {
  const [criado] = await db
    .insert(memorialDescritivo)
    .values({ projetoId: input.projetoId, respostasFormularioJson: input.respostasFormularioJson })
    .returning(CAMPOS_MEMORIAL);
  return criado;
}

export async function listarMemoriais(empresaId: string): Promise<MemorialComProjeto[]> {
  return db
    .select({ ...CAMPOS_MEMORIAL, projetoNome: projeto.nome })
    .from(memorialDescritivo)
    .innerJoin(projeto, eq(memorialDescritivo.projetoId, projeto.id))
    .where(eq(projeto.empresaId, empresaId))
    .orderBy(desc(memorialDescritivo.createdAt));
}

export async function buscarMemorialDaEmpresa(id: string, empresaId: string): Promise<Memorial | null> {
  const [resultado] = await db
    .select(CAMPOS_MEMORIAL)
    .from(memorialDescritivo)
    .innerJoin(projeto, eq(memorialDescritivo.projetoId, projeto.id))
    .where(and(eq(memorialDescritivo.id, id), eq(projeto.empresaId, empresaId)))
    .limit(1);
  return resultado ?? null;
}

export async function marcarComoGerado(
  id: string,
  input: { documentoGeradoUrl: string; audioUrl?: string; respostasFormularioJson?: unknown },
): Promise<void> {
  await db
    .update(memorialDescritivo)
    .set({
      status: "gerado",
      documentoGeradoUrl: input.documentoGeradoUrl,
      ...(input.audioUrl ? { audioUrl: input.audioUrl } : {}),
      ...(input.respostasFormularioJson !== undefined
        ? { respostasFormularioJson: input.respostasFormularioJson }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(memorialDescritivo.id, id));
}
```

- [ ] **Step 4: Rodar os testes de `memorial.ts` e confirmar que passam**

Run: `npx vitest run src/db/queries/__tests__/memorial.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Adicionar e testar `buscarProjetoDaEmpresa` em `projeto.ts`**

Em `src/db/queries/__tests__/projeto.test.ts`, adicione (junto dos outros `describe`, sem tocar no que já existe):

```ts
import { buscarProjetoDaEmpresa, criarProjeto, listarProjetos } from "../projeto";

// ... (mantém os describes existentes) ...

describe("buscarProjetoDaEmpresa", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("retorna o projeto quando pertence à empresa", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    const criado = await criarProjeto({ nome: "Casa da Praia", empresaId: novaEmpresa.id });

    const resultado = await buscarProjetoDaEmpresa(criado.id, novaEmpresa.id);

    expect(resultado?.id).toBe(criado.id);
  });

  it("retorna null quando o projeto é de outra empresa", async () => {
    const [empresaA] = await db.insert(empresa).values({ nome: "Empresa A" }).returning();
    const [empresaB] = await db.insert(empresa).values({ nome: "Empresa B" }).returning();
    const criado = await criarProjeto({ nome: "Casa da Praia", empresaId: empresaA.id });

    const resultado = await buscarProjetoDaEmpresa(criado.id, empresaB.id);

    expect(resultado).toBeNull();
  });
});
```

Note que o `import` no topo do arquivo precisa ganhar `buscarProjetoDaEmpresa` junto dos que já estavam lá — não crie um segundo bloco de import.

Em `src/db/queries/projeto.ts`, adicione (depois de `criarProjeto`, sem alterar o que já existe):

```ts
export async function buscarProjetoDaEmpresa(id: string, empresaId: string): Promise<Projeto | null> {
  const [resultado] = await db
    .select(CAMPOS_PROJETO)
    .from(projeto)
    .where(and(eq(projeto.id, id), eq(projeto.empresaId, empresaId)))
    .limit(1);
  return resultado ?? null;
}
```

O import de `drizzle-orm` no topo do arquivo precisa incluir `and` junto de `desc, eq` que já estavam lá.

- [ ] **Step 6: Rodar os testes de `projeto.ts` e confirmar que passam**

Run: `npx vitest run src/db/queries/__tests__/projeto.test.ts`
Expected: PASS — todos os testes anteriores + os 2 novos.

- [ ] **Step 7: Commit**

```bash
git add src/db/queries/memorial.ts src/db/queries/projeto.ts src/db/queries/__tests__/memorial.test.ts src/db/queries/__tests__/projeto.test.ts
git commit -m "feat: add memorial query layer and buscarProjetoDaEmpresa"
```

---

### Task 2: Schema Zod (formulário de 3 blocos)

**Files:**
- Create: `src/lib/validations/memorial/create.schema.ts`
- Test: `src/lib/validations/memorial/__tests__/create.schema.test.ts`

**Interfaces:**
- Produces: `export const criarMemorialSchema` (Zod discriminated union por `modoEspecificacoes`), `export type CriarMemorialInput = z.infer<typeof criarMemorialSchema>`. Tasks 5, 6 e 8 usam este tipo.

- [ ] **Step 1: Escrever os testes (vão falhar — o módulo não existe)**

Crie `src/lib/validations/memorial/__tests__/create.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { criarMemorialSchema } from "../create.schema";

const BASE = {
  projetoId: "11111111-1111-1111-1111-111111111111",
  tipoConstrucao: "residencial",
};

describe("criarMemorialSchema", () => {
  it("aceita modo texto com especificações opcionais", () => {
    const resultado = criarMemorialSchema.safeParse({
      ...BASE,
      modoEspecificacoes: "texto",
      especificacoes: { fundacaoEstrutura: "Radier" },
    });

    expect(resultado.success).toBe(true);
  });

  it("aceita modo texto sem nenhuma especificação (todas opcionais)", () => {
    const resultado = criarMemorialSchema.safeParse({ ...BASE, modoEspecificacoes: "texto" });

    expect(resultado.success).toBe(true);
  });

  it("aceita modo áudio com audioBase64 e audioMimeType", () => {
    const resultado = criarMemorialSchema.safeParse({
      ...BASE,
      modoEspecificacoes: "audio",
      audioBase64: "ZmFrZS1hdWRpbw==",
      audioMimeType: "audio/webm",
    });

    expect(resultado.success).toBe(true);
  });

  it("rejeita modo áudio sem audioBase64", () => {
    const resultado = criarMemorialSchema.safeParse({
      ...BASE,
      modoEspecificacoes: "audio",
      audioMimeType: "audio/webm",
    });

    expect(resultado.success).toBe(false);
  });

  it("rejeita sem tipoConstrucao", () => {
    const resultado = criarMemorialSchema.safeParse({
      projetoId: BASE.projetoId,
      modoEspecificacoes: "texto",
    });

    expect(resultado.success).toBe(false);
  });

  it("rejeita numeroPavimentos negativo", () => {
    const resultado = criarMemorialSchema.safeParse({
      ...BASE,
      modoEspecificacoes: "texto",
      numeroPavimentos: -1,
    });

    expect(resultado.success).toBe(false);
  });

  it("rejeita modoEspecificacoes desconhecido", () => {
    const resultado = criarMemorialSchema.safeParse({ ...BASE, modoEspecificacoes: "video" });

    expect(resultado.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/validations/memorial/__tests__/create.schema.test.ts`
Expected: FAIL — `Cannot find module '../create.schema'` (ou equivalente).

- [ ] **Step 3: Implementar o schema**

Crie `src/lib/validations/memorial/create.schema.ts`:

```ts
import { z } from "zod";

const especificacoesSchema = z.object({
  fundacaoEstrutura: z.string().optional(),
  alvenariaCobertura: z.string().optional(),
  instalacoes: z.string().optional(),
  acabamentos: z.string().optional(),
});

const camposBase = {
  projetoId: z.string().min(1, "Selecione um projeto."),
  tipoConstrucao: z.string().min(1, "Informe o tipo de construção."),
  numeroPavimentos: z.number().int().positive().optional(),
  areaConstruida: z.number().positive().optional(),
  areaTerreno: z.number().positive().optional(),
};

export const criarMemorialSchema = z.discriminatedUnion("modoEspecificacoes", [
  z.object({
    ...camposBase,
    modoEspecificacoes: z.literal("texto"),
    especificacoes: especificacoesSchema.optional(),
  }),
  z.object({
    ...camposBase,
    modoEspecificacoes: z.literal("audio"),
    audioBase64: z.string().min(1, "Áudio ausente."),
    audioMimeType: z.string().min(1, "Tipo do áudio ausente."),
  }),
]);

export type CriarMemorialInput = z.infer<typeof criarMemorialSchema>;
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/validations/memorial/__tests__/create.schema.test.ts`
Expected: PASS — 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/memorial/create.schema.ts src/lib/validations/memorial/__tests__/create.schema.test.ts
git commit -m "feat: add criarMemorialSchema with texto/audio discriminated union"
```

---

### Task 3: Storage em disco + template HTML (ABNT)

**Files:**
- Create: `src/lib/memorial/storage.ts`
- Create: `src/lib/memorial/html-template.ts`
- Test: `src/lib/memorial/__tests__/storage.test.ts`
- Test: `src/lib/memorial/__tests__/html-template.test.ts`
- Modify: `.gitignore` (adicionar `storage/`)

**Interfaces:**
- Produces: `export async function salvarArquivo(nomeArquivo: string, conteudo: Buffer): Promise<string>` (retorna o caminho absoluto em disco), `export async function lerArquivo(nomeArquivo: string): Promise<Buffer>`, `export interface DadosMemorial { projetoNome: string; projetoEndereco: string | null; empresaNome: string; usuarioNome: string; tipoConstrucao: string; numeroPavimentos?: number; areaConstruida?: number; areaTerreno?: number; descricaoGeral: string; especificacoesTecnicas: string }`, `export function gerarHtmlMemorial(dados: DadosMemorial): string`. Task 4 usa `gerarHtmlMemorial`'s output; Task 5 usa `salvarArquivo`; Task 7 usa `lerArquivo`.

- [ ] **Step 1: Adicionar `storage/` ao `.gitignore`**

Em `.gitignore`, adicione uma linha (não remova nada existente):

```
# arquivos gerados (PDFs, áudios) do módulo de memorial descritivo
/storage/
```

- [ ] **Step 2: Escrever os testes de storage (vão falhar — o módulo não existe)**

Crie `src/lib/memorial/__tests__/storage.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";

import { lerArquivo, salvarArquivo } from "../storage";

const DIR_STORAGE = path.join(process.cwd(), "storage", "memoriais");

describe("salvarArquivo / lerArquivo", () => {
  afterEach(async () => {
    await rm(DIR_STORAGE, { recursive: true, force: true });
  });

  it("salva e lê o mesmo conteúdo de volta", async () => {
    await salvarArquivo("teste.txt", Buffer.from("conteúdo de teste"));

    const lido = await lerArquivo("teste.txt");

    expect(lido.toString()).toBe("conteúdo de teste");
  });

  it("cria o diretório de storage se ele não existir ainda", async () => {
    const caminho = await salvarArquivo("outro-teste.txt", Buffer.from("x"));

    expect(caminho).toContain(path.join("storage", "memoriais"));
  });
});
```

- [ ] **Step 3: Rodar os testes de storage e confirmar que falham**

Run: `npx vitest run src/lib/memorial/__tests__/storage.test.ts`
Expected: FAIL — `Cannot find module '../storage'` (ou equivalente).

- [ ] **Step 4: Implementar `storage.ts`**

Crie `src/lib/memorial/storage.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR_STORAGE = path.join(process.cwd(), "storage", "memoriais");

export async function salvarArquivo(nomeArquivo: string, conteudo: Buffer): Promise<string> {
  await mkdir(DIR_STORAGE, { recursive: true });
  const caminho = path.join(DIR_STORAGE, nomeArquivo);
  await writeFile(caminho, conteudo);
  return caminho;
}

export async function lerArquivo(nomeArquivo: string): Promise<Buffer> {
  return readFile(path.join(DIR_STORAGE, nomeArquivo));
}
```

- [ ] **Step 5: Rodar os testes de storage e confirmar que passam**

Run: `npx vitest run src/lib/memorial/__tests__/storage.test.ts`
Expected: PASS — 2 testes.

- [ ] **Step 6: Escrever os testes do template HTML (vão falhar — o módulo não existe)**

Crie `src/lib/memorial/__tests__/html-template.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { gerarHtmlMemorial } from "../html-template";

const DADOS_BASE = {
  projetoNome: "Casa da Praia",
  projetoEndereco: "Rua das Flores, 123",
  empresaNome: "Ancar Engenharia",
  usuarioNome: "Victor",
  tipoConstrucao: "residencial",
  descricaoGeral: "Texto da descrição geral gerado pelo LLM.",
  especificacoesTecnicas: "Texto das especificações técnicas gerado pelo LLM.",
};

describe("gerarHtmlMemorial", () => {
  it("inclui os dados de identificação e os textos gerados", () => {
    const html = gerarHtmlMemorial(DADOS_BASE);

    expect(html).toContain("Casa da Praia");
    expect(html).toContain("Rua das Flores, 123");
    expect(html).toContain("Ancar Engenharia");
    expect(html).toContain("Victor");
    expect(html).toContain("Texto da descrição geral gerado pelo LLM.");
    expect(html).toContain("Texto das especificações técnicas gerado pelo LLM.");
  });

  it("omite o endereço quando ausente, sem quebrar", () => {
    const html = gerarHtmlMemorial({ ...DADOS_BASE, projetoEndereco: null });

    expect(html).not.toContain("null");
  });

  it("escapa caracteres HTML nos textos gerados pelo LLM", () => {
    const html = gerarHtmlMemorial({ ...DADOS_BASE, descricaoGeral: "Texto com <script>alert(1)</script>" });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 7: Rodar os testes do template e confirmar que falham**

Run: `npx vitest run src/lib/memorial/__tests__/html-template.test.ts`
Expected: FAIL — `Cannot find module '../html-template'` (ou equivalente).

- [ ] **Step 8: Implementar `html-template.ts`**

Crie `src/lib/memorial/html-template.ts`:

```ts
export interface DadosMemorial {
  projetoNome: string;
  projetoEndereco: string | null;
  empresaNome: string;
  usuarioNome: string;
  tipoConstrucao: string;
  numeroPavimentos?: number;
  areaConstruida?: number;
  areaTerreno?: number;
  descricaoGeral: string;
  especificacoesTecnicas: string;
}

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function gerarHtmlMemorial(dados: DadosMemorial): string {
  const linhaEndereco = dados.projetoEndereco
    ? `<dt>Endereço</dt><dd>${escapeHtml(dados.projetoEndereco)}</dd>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 3cm 2cm 2cm 3cm; }
      body { font-family: "Times New Roman", serif; font-size: 12pt; line-height: 1.5; }
      h1 { text-align: center; font-size: 14pt; }
      h2 { font-size: 12pt; margin-top: 1.5em; }
      dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25em 1em; }
      dt { font-weight: bold; }
    </style>
  </head>
  <body>
    <h1>Memorial Descritivo</h1>
    <h2>Identificação da obra</h2>
    <dl>
      <dt>Projeto</dt><dd>${escapeHtml(dados.projetoNome)}</dd>
      ${linhaEndereco}
      <dt>Empresa</dt><dd>${escapeHtml(dados.empresaNome)}</dd>
      <dt>Responsável</dt><dd>${escapeHtml(dados.usuarioNome)}</dd>
      <dt>Tipo de construção</dt><dd>${escapeHtml(dados.tipoConstrucao)}</dd>
    </dl>
    <h2>Descrição geral</h2>
    <p>${escapeHtml(dados.descricaoGeral)}</p>
    <h2>Especificações técnicas</h2>
    <p>${escapeHtml(dados.especificacoesTecnicas)}</p>
  </body>
</html>`;
}
```

- [ ] **Step 9: Rodar os testes do template e confirmar que passam**

Run: `npx vitest run src/lib/memorial/__tests__/html-template.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 10: Commit**

```bash
git add .gitignore src/lib/memorial/storage.ts src/lib/memorial/html-template.ts src/lib/memorial/__tests__/storage.test.ts src/lib/memorial/__tests__/html-template.test.ts
git commit -m "feat: add local file storage and ABNT html template for memorial"
```

---

### Task 4: Geração de PDF via Puppeteer

**Files:**
- Install: `puppeteer` (já verificado funcionando neste ambiente — `npm install puppeteer` baixa o Chromium sem problema)
- Create: `src/lib/memorial/pdf.ts`
- Test: `src/lib/memorial/__tests__/pdf.test.ts`

**Interfaces:**
- Consumes: nenhuma deste plano diretamente (recebe uma string HTML já pronta).
- Produces: `export async function gerarPdf(html: string): Promise<Buffer>` — Task 5 usa esta função.

- [ ] **Step 1: Instalar o Puppeteer**

Run: `npm install puppeteer`

Confirme que instalou sem erro. Se o download do Chromium falhar neste ambiente (diferente do que foi verificado antes deste plano), pare e reporte BLOCKED com a saída real do erro — não tente contornar sem confirmar com o controlador.

- [ ] **Step 2: Escrever o teste (vai falhar — o módulo não existe)**

Crie `src/lib/memorial/__tests__/pdf.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { gerarPdf } from "../pdf";

describe("gerarPdf", () => {
  it("produz um buffer PDF válido a partir de HTML simples", async () => {
    const pdf = await gerarPdf("<h1>Teste</h1>");

    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/memorial/__tests__/pdf.test.ts`
Expected: FAIL — `Cannot find module '../pdf'` (ou equivalente).

- [ ] **Step 4: Implementar `pdf.ts`**

Crie `src/lib/memorial/pdf.ts`:

```ts
import puppeteer from "puppeteer";

export async function gerarPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "a4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/memorial/__tests__/pdf.test.ts`
Expected: PASS — 1 teste (pode levar alguns segundos, é um browser real sendo iniciado).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/memorial/pdf.ts src/lib/memorial/__tests__/pdf.test.ts
git commit -m "feat: add Puppeteer-based PDF generation"
```

---

### Task 5: Pipeline de geração (`gerarMemorial`)

**Files:**
- Create: `src/lib/memorial/gerar.ts`
- Test: `src/lib/memorial/__tests__/gerar.test.ts`

**Interfaces:**
- Consumes: `memorialRouter` de `@/core/llm` (já existe, `extractStructured`/`transcribeAudio`), `criarMemorialRascunho`/`marcarComoGerado` de `@/db/queries/memorial` (Task 1), `gerarHtmlMemorial` de `./html-template` (Task 3), `salvarArquivo` de `./storage` (Task 3), `gerarPdf` de `./pdf` (Task 4), `CriarMemorialInput` de `@/lib/validations/memorial/create.schema` (Task 2).
- Produces: `export interface ContextoMemorial { projetoNome: string; projetoEndereco: string | null; empresaNome: string; usuarioNome: string }`, `export async function gerarMemorial(input: CriarMemorialInput, contexto: ContextoMemorial): Promise<{ id: string; status: string; documentoGeradoUrl: string | null }>` — lança (throw) se qualquer etapa falhar, sem capturar o erro internamente. Task 6 chama esta função.

- [ ] **Step 1: Escrever os testes (vão falhar — o módulo não existe)**

Crie `src/lib/memorial/__tests__/gerar.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";

import { db } from "@/db";
import { empresa, memorialDescritivo, projeto } from "@/db/schema";

vi.mock("@/core/llm", () => ({
  memorialRouter: {
    transcribeAudio: vi.fn(),
    extractStructured: vi.fn(),
  },
}));

import { memorialRouter } from "@/core/llm";
import { gerarMemorial } from "../gerar";

async function limparBanco() {
  await db.delete(memorialDescritivo);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarProjetoDeTeste() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  return novoProjeto;
}

const CONTEXTO = {
  projetoNome: "Casa da Praia",
  projetoEndereco: null,
  empresaNome: "Ancar Engenharia",
  usuarioNome: "Victor",
};

const PROSA_FAKE = { descricaoGeral: "Descrição gerada.", especificacoesTecnicas: "Especificações geradas." };

describe("gerarMemorial", () => {
  beforeEach(() => {
    limparBanco();
    vi.mocked(memorialRouter.transcribeAudio).mockReset();
    vi.mocked(memorialRouter.extractStructured).mockReset();
  });

  afterEach(async () => {
    await limparBanco();
    await rm(path.join(process.cwd(), "storage", "memoriais"), { recursive: true, force: true });
  });

  it("modo texto: gera prosa via LLM e marca como gerado", async () => {
    const novoProjeto = await criarProjetoDeTeste();
    vi.mocked(memorialRouter.extractStructured).mockResolvedValue({ data: PROSA_FAKE, provider: "fake", raw: {} });

    const resultado = await gerarMemorial(
      {
        projetoId: novoProjeto.id,
        tipoConstrucao: "residencial",
        modoEspecificacoes: "texto",
        especificacoes: { fundacaoEstrutura: "Radier" },
      },
      CONTEXTO,
    );

    expect(resultado.status).toBe("gerado");
    expect(resultado.documentoGeradoUrl).toBe(`/api/memoriais/${resultado.id}/pdf`);
    expect(memorialRouter.transcribeAudio).not.toHaveBeenCalled();
    expect(memorialRouter.extractStructured).toHaveBeenCalledOnce();

    const [linha] = await db.select().from(memorialDescritivo);
    expect(linha.status).toBe("gerado");
  });

  it("modo áudio: transcreve, extrai as especificações e depois gera a prosa", async () => {
    const novoProjeto = await criarProjetoDeTeste();
    vi.mocked(memorialRouter.transcribeAudio).mockResolvedValue(
      "fundação é radier, estrutura em concreto armado",
    );
    vi.mocked(memorialRouter.extractStructured)
      .mockResolvedValueOnce({
        data: { fundacaoEstrutura: "Radier, concreto armado" },
        provider: "fake",
        raw: {},
      })
      .mockResolvedValueOnce({ data: PROSA_FAKE, provider: "fake", raw: {} });

    const resultado = await gerarMemorial(
      {
        projetoId: novoProjeto.id,
        tipoConstrucao: "residencial",
        modoEspecificacoes: "audio",
        audioBase64: Buffer.from("audio-fake").toString("base64"),
        audioMimeType: "audio/webm",
      },
      CONTEXTO,
    );

    expect(resultado.status).toBe("gerado");
    expect(memorialRouter.transcribeAudio).toHaveBeenCalledOnce();
    expect(memorialRouter.extractStructured).toHaveBeenCalledTimes(2);

    const [linha] = await db.select().from(memorialDescritivo);
    expect(linha.audioUrl).toContain(`${resultado.id}-audio`);
    expect(linha.respostasFormularioJson).toMatchObject({
      especificacoes: { fundacaoEstrutura: "Radier, concreto armado" },
    });
  });

  it("propaga o erro e deixa o registro em rascunho quando o LLM falha", async () => {
    const novoProjeto = await criarProjetoDeTeste();
    vi.mocked(memorialRouter.extractStructured).mockRejectedValue(new Error("LLM indisponível"));

    await expect(
      gerarMemorial(
        { projetoId: novoProjeto.id, tipoConstrucao: "residencial", modoEspecificacoes: "texto" },
        CONTEXTO,
      ),
    ).rejects.toThrow("LLM indisponível");

    const [linha] = await db.select().from(memorialDescritivo);
    expect(linha.status).toBe("rascunho");
    expect(linha.documentoGeradoUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/memorial/__tests__/gerar.test.ts`
Expected: FAIL — `Cannot find module '../gerar'` (ou equivalente).

- [ ] **Step 3: Implementar `gerar.ts`**

Crie `src/lib/memorial/gerar.ts`:

```ts
import { memorialRouter } from "@/core/llm";
import { criarMemorialRascunho, marcarComoGerado } from "@/db/queries/memorial";
import type { CriarMemorialInput } from "@/lib/validations/memorial/create.schema";
import { gerarHtmlMemorial } from "./html-template";
import { gerarPdf } from "./pdf";
import { salvarArquivo } from "./storage";

const SCHEMA_ESPECIFICACOES = {
  type: "object",
  properties: {
    fundacaoEstrutura: { type: "string" },
    alvenariaCobertura: { type: "string" },
    instalacoes: { type: "string" },
    acabamentos: { type: "string" },
  },
};

const SCHEMA_PROSA = {
  type: "object",
  properties: {
    descricaoGeral: { type: "string" },
    especificacoesTecnicas: { type: "string" },
  },
  required: ["descricaoGeral", "especificacoesTecnicas"],
};

export interface ContextoMemorial {
  projetoNome: string;
  projetoEndereco: string | null;
  empresaNome: string;
  usuarioNome: string;
}

interface EspecificacoesTecnicas {
  fundacaoEstrutura?: string;
  alvenariaCobertura?: string;
  instalacoes?: string;
  acabamentos?: string;
}

export async function gerarMemorial(
  input: CriarMemorialInput,
  contexto: ContextoMemorial,
): Promise<{ id: string; status: string; documentoGeradoUrl: string | null }> {
  let especificacoes: EspecificacoesTecnicas =
    input.modoEspecificacoes === "texto" ? (input.especificacoes ?? {}) : {};

  const rascunho = await criarMemorialRascunho({
    projetoId: input.projetoId,
    respostasFormularioJson: { ...input, especificacoes },
  });

  let audioUrl: string | undefined;

  if (input.modoEspecificacoes === "audio") {
    const audioBuffer = Buffer.from(input.audioBase64, "base64");
    const transcricao = await memorialRouter.transcribeAudio(audioBuffer, input.audioMimeType);
    const extracao = await memorialRouter.extractStructured<EspecificacoesTecnicas>({
      userPrompt: transcricao,
      schema: SCHEMA_ESPECIFICACOES,
    });
    especificacoes = extracao.data;
    audioUrl = await salvarArquivo(`${rascunho.id}-audio`, audioBuffer);
  }

  const prosa = await memorialRouter.extractStructured<{
    descricaoGeral: string;
    especificacoesTecnicas: string;
  }>({
    systemPrompt:
      "Você é um engenheiro redigindo um memorial descritivo técnico em português formal, seguindo a norma ABNT.",
    userPrompt: JSON.stringify({ ...input, especificacoes }),
    schema: SCHEMA_PROSA,
  });

  const html = gerarHtmlMemorial({
    projetoNome: contexto.projetoNome,
    projetoEndereco: contexto.projetoEndereco,
    empresaNome: contexto.empresaNome,
    usuarioNome: contexto.usuarioNome,
    tipoConstrucao: input.tipoConstrucao,
    numeroPavimentos: input.numeroPavimentos,
    areaConstruida: input.areaConstruida,
    areaTerreno: input.areaTerreno,
    descricaoGeral: prosa.data.descricaoGeral,
    especificacoesTecnicas: prosa.data.especificacoesTecnicas,
  });

  const pdfBuffer = await gerarPdf(html);
  await salvarArquivo(`${rascunho.id}.pdf`, pdfBuffer);
  const documentoGeradoUrl = `/api/memoriais/${rascunho.id}/pdf`;

  await marcarComoGerado(rascunho.id, {
    documentoGeradoUrl,
    audioUrl,
    respostasFormularioJson: { ...input, especificacoes },
  });

  return { id: rascunho.id, status: "gerado", documentoGeradoUrl };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/memorial/__tests__/gerar.test.ts`
Expected: PASS — 3 testes (usa Puppeteer real internamente, pode levar alguns segundos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorial/gerar.ts src/lib/memorial/__tests__/gerar.test.ts
git commit -m "feat: add gerarMemorial pipeline (LLM extraction + prose + PDF)"
```

---

### Task 6: `POST /api/memoriais`

**Files:**
- Create: `src/app/api/memoriais/route.ts`
- Test: `src/app/api/memoriais/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `criarMemorialSchema` (Task 2), `buscarProjetoDaEmpresa` de `@/db/queries/projeto` (Task 1), `buscarNomesUsuarioEEmpresa` de `@/db/queries/usuario` (já existe, feature do dashboard shell), `gerarMemorial` de `@/lib/memorial/gerar` (Task 5), `verificarToken`/`SESSION_COOKIE_NAME` (já existem).
- Produces: `POST /api/memoriais` retornando `201 { memorial: {...} }`, `400`, `401`, `404`, `500` — nenhuma task futura deste plano consome isso diretamente (é a integração).

- [ ] **Step 1: Escrever os testes (vão falhar — a rota não existe)**

Crie `src/app/api/memoriais/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

vi.mock("@/lib/memorial/gerar", () => ({
  gerarMemorial: vi.fn(),
}));

import { gerarMemorial } from "@/lib/memorial/gerar";
import { POST } from "@/app/api/memoriais/route";

async function limparBanco() {
  await db.delete(projeto);
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarSessaoComProjeto() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, projetoId: novoProjeto.id };
}

function criarRequest(body: unknown, token?: string) {
  return new NextRequest("http://localhost/api/memoriais", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/memoriais", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await POST(criarRequest({}));
    expect(response.status).toBe(401);
  });

  it("rejeita dados inválidos com 400", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(criarRequest({ modoEspecificacoes: "texto" }, token));

    expect(response.status).toBe(400);
  });

  it("rejeita projeto de outra empresa (ou inexistente) com 404", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(
      criarRequest(
        {
          projetoId: "00000000-0000-0000-0000-000000000000",
          tipoConstrucao: "residencial",
          modoEspecificacoes: "texto",
        },
        token,
      ),
    );

    expect(response.status).toBe(404);
  });

  it("chama gerarMemorial e retorna 201 no sucesso", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(gerarMemorial).mockResolvedValue({
      id: "abc",
      status: "gerado",
      documentoGeradoUrl: "/api/memoriais/abc/pdf",
    });

    const response = await POST(
      criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(201);
    const corpo = await response.json();
    expect(corpo.memorial.status).toBe("gerado");
  });

  it("retorna 500 quando gerarMemorial lança", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(gerarMemorial).mockRejectedValue(new Error("falhou"));

    const response = await POST(
      criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/app/api/memoriais/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/memoriais/route'` (ou equivalente).

- [ ] **Step 3: Implementar a rota**

Crie `src/app/api/memoriais/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarProjetoDaEmpresa } from "@/db/queries/projeto";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { criarMemorialSchema } from "@/lib/validations/memorial/create.schema";
import { gerarMemorial } from "@/lib/memorial/gerar";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = criarMemorialSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const projetoEncontrado = await buscarProjetoDaEmpresa(parsed.data.projetoId, sessao.empresaId);
  if (!projetoEncontrado) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  try {
    const nomes = await buscarNomesUsuarioEEmpresa(sessao.userId);
    const resultado = await gerarMemorial(parsed.data, {
      projetoNome: projetoEncontrado.nome,
      projetoEndereco: projetoEncontrado.endereco,
      empresaNome: nomes?.empresaNome ?? "",
      usuarioNome: nomes?.usuarioNome ?? "",
    });
    return NextResponse.json({ memorial: resultado }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/memoriais]", error);
    return NextResponse.json({ error: "Erro ao gerar o memorial, tente novamente." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/app/api/memoriais/__tests__/route.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/memoriais/route.ts src/app/api/memoriais/__tests__/route.test.ts
git commit -m "feat: add POST /api/memoriais route handler"
```

---

### Task 7: `GET /api/memoriais/[id]/pdf`

**Files:**
- Create: `src/app/api/memoriais/[id]/pdf/route.ts`
- Test: `src/app/api/memoriais/[id]/pdf/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `buscarMemorialDaEmpresa` de `@/db/queries/memorial` (Task 1), `lerArquivo` de `@/lib/memorial/storage` (Task 3).
- Produces: `GET /api/memoriais/[id]/pdf` — nenhuma task futura consome.

- [ ] **Step 1: Escrever os testes (vão falhar — a rota não existe)**

Crie `src/app/api/memoriais/[id]/pdf/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { empresa, memorialDescritivo, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { salvarArquivo } from "@/lib/memorial/storage";
import { GET } from "@/app/api/memoriais/[id]/pdf/route";

async function limparBanco() {
  await db.delete(memorialDescritivo);
  await db.delete(projeto);
  await db.delete(usuario);
  await db.delete(empresa);
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/memoriais/x/pdf", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("GET /api/memoriais/[id]/pdf", () => {
  beforeEach(limparBanco);
  afterEach(async () => {
    await limparBanco();
    await rm(path.join(process.cwd(), "storage", "memoriais"), { recursive: true, force: true });
  });

  it("retorna o PDF quando o memorial pertence à empresa e está gerado", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    const [novoUsuario] = await db
      .insert(usuario)
      .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
      .returning();
    const [novoProjeto] = await db
      .insert(projeto)
      .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
      .returning();
    const [novoMemorial] = await db
      .insert(memorialDescritivo)
      .values({
        projetoId: novoProjeto.id,
        respostasFormularioJson: {},
        status: "gerado",
        documentoGeradoUrl: "/x",
      })
      .returning();
    await salvarArquivo(`${novoMemorial.id}.pdf`, Buffer.from("%PDF-fake"));
    const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });

    const response = await GET(criarRequest(token), { params: Promise.resolve({ id: novoMemorial.id }) });

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe("%PDF-fake");
  });

  it("retorna 404 pra memorial de outra empresa", async () => {
    const [empresaA] = await db.insert(empresa).values({ nome: "Empresa A" }).returning();
    const [empresaB] = await db.insert(empresa).values({ nome: "Empresa B" }).returning();
    const [usuarioB] = await db
      .insert(usuario)
      .values({ nome: "B", email: "b@ancar.com.br", senhaHash: "hash-fake", empresaId: empresaB.id })
      .returning();
    const [projetoA] = await db.insert(projeto).values({ nome: "Projeto A", empresaId: empresaA.id }).returning();
    const [memorialA] = await db
      .insert(memorialDescritivo)
      .values({ projetoId: projetoA.id, respostasFormularioJson: {}, status: "gerado", documentoGeradoUrl: "/x" })
      .returning();
    const tokenB = await assinarToken({ userId: usuarioB.id, empresaId: empresaB.id, papel: usuarioB.papel });

    const response = await GET(criarRequest(tokenB), { params: Promise.resolve({ id: memorialA.id }) });

    expect(response.status).toBe(404);
  });

  it("retorna 404 pra memorial ainda em rascunho", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    const [novoUsuario] = await db
      .insert(usuario)
      .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
      .returning();
    const [novoProjeto] = await db
      .insert(projeto)
      .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
      .returning();
    const [novoMemorial] = await db
      .insert(memorialDescritivo)
      .values({ projetoId: novoProjeto.id, respostasFormularioJson: {} })
      .returning();
    const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });

    const response = await GET(criarRequest(token), { params: Promise.resolve({ id: novoMemorial.id }) });

    expect(response.status).toBe(404);
  });

  it("retorna 401 sem sessão", async () => {
    const response = await GET(criarRequest(), { params: Promise.resolve({ id: "x" }) });

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run "src/app/api/memoriais/[id]/pdf/__tests__/route.test.ts"`
Expected: FAIL — `Cannot find module '@/app/api/memoriais/[id]/pdf/route'` (ou equivalente).

- [ ] **Step 3: Implementar a rota**

Crie `src/app/api/memoriais/[id]/pdf/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarMemorialDaEmpresa } from "@/db/queries/memorial";
import { lerArquivo } from "@/lib/memorial/storage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const memorial = await buscarMemorialDaEmpresa(id, sessao.empresaId);

  if (!memorial || memorial.status !== "gerado") {
    return NextResponse.json({ error: "Memorial não encontrado." }, { status: 404 });
  }

  const pdf = await lerArquivo(`${id}.pdf`);
  return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf" } });
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run "src/app/api/memoriais/[id]/pdf/__tests__/route.test.ts"`
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/memoriais/[id]/pdf/route.ts" "src/app/api/memoriais/[id]/pdf/__tests__/route.test.ts"
git commit -m "feat: add GET /api/memoriais/[id]/pdf download route"
```

---

### Task 8: UI — lista, formulário e gravador de áudio

**Files:**
- Create: `src/hooks/use-criar-memorial.ts`
- Create: `src/app/dashboard/memorial/novo/gravador-audio.tsx`
- Create: `src/app/dashboard/memorial/novo/novo-memorial-form.tsx`
- Create: `src/app/dashboard/memorial/novo/page.tsx`
- Modify: `src/app/dashboard/memorial/page.tsx` (reescrever — hoje é o placeholder "Em breve")

**Interfaces:**
- Consumes: `criarMemorialSchema`/`CriarMemorialInput` (Task 2), `listarMemoriais` de `@/db/queries/memorial` (Task 1), `listarProjetos`/`Projeto` de `@/db/queries/projeto` (já existe).
- Produces: nada consumido por tasks futuras — integração final antes da verificação manual.

**Sem teste automatizado nesta task** — mesmo padrão já usado em todas as páginas/formulários deste projeto (sem RTL/jsdom). Cobertura vem da verificação manual (Task 9) e dos testes já escritos nas Tasks 5-7 (a lógica real do pipeline já está testada; esta task só monta a UI que chama `POST /api/memoriais`).

**Decisão de escopo:** este formulário usa `react-hook-form` **sem** `zodResolver` (diferente de login/register) — o schema é uma discriminated union por `modoEspecificacoes`, e o valor desse campo só é decidido em runtime (pelo toggle), o que complica a validação live por campo do `zodResolver`. Em vez disso, o formulário monta o payload final no submit e valida com `criarMemorialSchema.safeParse` ali mesmo, mostrando um erro genérico se falhar — a validação de verdade (com mensagens por campo) já acontece no servidor via o mesmo schema.

- [ ] **Step 1: Hook de mutation**

Crie `src/hooks/use-criar-memorial.ts`:

```ts
import { useMutation } from "@tanstack/react-query";

import type { CriarMemorialInput } from "@/lib/validations/memorial/create.schema";

interface MemorialResponse {
  memorial: { id: string; status: string; documentoGeradoUrl: string | null };
}

interface ApiErrorBody {
  error: string;
  fields?: Record<string, string[]>;
}

async function criarMemorialRequest(input: CriarMemorialInput): Promise<MemorialResponse> {
  const response = await fetch("/api/memoriais", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as MemorialResponse | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return data as MemorialResponse;
}

export function useCriarMemorial() {
  return useMutation({ mutationFn: criarMemorialRequest });
}
```

- [ ] **Step 2: Gravador de áudio**

Crie `src/app/dashboard/memorial/novo/gravador-audio.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

interface GravadorAudioProps {
  onGravado: (audioBase64: string, mimeType: string) => void;
}

function arrayBufferParaBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario);
}

export function GravadorAudio({ onGravado }: GravadorAudioProps) {
  const [gravando, setGravando] = useState(false);
  const [urlPreview, setUrlPreview] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function iniciarGravacao() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (evento) => {
      if (evento.data.size > 0) chunksRef.current.push(evento.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setUrlPreview(URL.createObjectURL(blob));
      const buffer = await blob.arrayBuffer();
      onGravado(arrayBufferParaBase64(buffer), mimeType);
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setGravando(true);
  }

  function pararGravacao() {
    mediaRecorderRef.current?.stop();
    setGravando(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={gravando ? "destructive" : "default"}
        onClick={gravando ? pararGravacao : iniciarGravacao}
      >
        {gravando ? "Parar gravação" : "Gravar áudio"}
      </Button>
      {urlPreview && <audio controls src={urlPreview} />}
    </div>
  );
}
```

- [ ] **Step 3: Formulário**

Crie `src/app/dashboard/memorial/novo/novo-memorial-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import type { Projeto } from "@/db/queries/projeto";
import { criarMemorialSchema } from "@/lib/validations/memorial/create.schema";
import { useCriarMemorial } from "@/hooks/use-criar-memorial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GravadorAudio } from "./gravador-audio";

interface FormValues {
  projetoId: string;
  tipoConstrucao: string;
  numeroPavimentos: string;
  areaConstruida: string;
  areaTerreno: string;
  fundacaoEstrutura: string;
  alvenariaCobertura: string;
  instalacoes: string;
  acabamentos: string;
}

interface NovoMemorialFormProps {
  projetos: Projeto[];
}

export function NovoMemorialForm({ projetos }: NovoMemorialFormProps) {
  const router = useRouter();
  const [modo, setModo] = useState<"texto" | "audio">("texto");
  const [audio, setAudio] = useState<{ base64: string; mimeType: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarMemorial();
  const { register, handleSubmit } = useForm<FormValues>();

  function onSubmit(values: FormValues) {
    setErro(null);

    const base = {
      projetoId: values.projetoId,
      tipoConstrucao: values.tipoConstrucao,
      numeroPavimentos: values.numeroPavimentos ? Number(values.numeroPavimentos) : undefined,
      areaConstruida: values.areaConstruida ? Number(values.areaConstruida) : undefined,
      areaTerreno: values.areaTerreno ? Number(values.areaTerreno) : undefined,
    };

    const payload =
      modo === "texto"
        ? {
            ...base,
            modoEspecificacoes: "texto" as const,
            especificacoes: {
              fundacaoEstrutura: values.fundacaoEstrutura || undefined,
              alvenariaCobertura: values.alvenariaCobertura || undefined,
              instalacoes: values.instalacoes || undefined,
              acabamentos: values.acabamentos || undefined,
            },
          }
        : {
            ...base,
            modoEspecificacoes: "audio" as const,
            audioBase64: audio?.base64 ?? "",
            audioMimeType: audio?.mimeType ?? "",
          };

    const parsed = criarMemorialSchema.safeParse(payload);
    if (!parsed.success) {
      setErro("Preencha os campos obrigatórios corretamente.");
      return;
    }

    criar.mutate(parsed.data, {
      onSuccess: () => router.push("/dashboard/memorial"),
      onError: (error) => setErro(error.message),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="projetoId">Projeto</Label>
        <select id="projetoId" {...register("projetoId", { required: true })} className="rounded-md border p-2">
          <option value="">Selecione...</option>
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="tipoConstrucao">Tipo de construção</Label>
        <Input id="tipoConstrucao" {...register("tipoConstrucao", { required: true })} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="numeroPavimentos">Nº de pavimentos</Label>
          <Input id="numeroPavimentos" type="number" {...register("numeroPavimentos")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="areaConstruida">Área construída (m²)</Label>
          <Input id="areaConstruida" type="number" {...register("areaConstruida")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="areaTerreno">Área do terreno (m²)</Label>
          <Input id="areaTerreno" type="number" {...register("areaTerreno")} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Especificações técnicas</Label>
        <div className="flex gap-2">
          <Button type="button" variant={modo === "texto" ? "default" : "outline"} onClick={() => setModo("texto")}>
            Digitar
          </Button>
          <Button type="button" variant={modo === "audio" ? "default" : "outline"} onClick={() => setModo("audio")}>
            Gravar áudio
          </Button>
        </div>

        {modo === "texto" ? (
          <div className="grid gap-4">
            <Textarea placeholder="Fundação e estrutura" {...register("fundacaoEstrutura")} />
            <Textarea placeholder="Alvenaria e cobertura" {...register("alvenariaCobertura")} />
            <Textarea placeholder="Instalações elétrica e hidráulica" {...register("instalacoes")} />
            <Textarea placeholder="Acabamentos" {...register("acabamentos")} />
          </div>
        ) : (
          <GravadorAudio onGravado={(base64, mimeType) => setAudio({ base64, mimeType })} />
        )}
      </div>

      {erro && <p className="text-destructive text-sm">{erro}</p>}
      <Button type="submit" disabled={criar.isPending}>
        {criar.isPending ? "Gerando..." : "Gerar memorial"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Página do formulário**

Crie `src/app/dashboard/memorial/novo/page.tsx`:

```tsx
import { getSessionUser } from "@/lib/auth/session";
import { listarProjetos } from "@/db/queries/projeto";
import { NovoMemorialForm } from "./novo-memorial-form";

export default async function NovoMemorialPage() {
  const sessao = await getSessionUser();
  const projetos = sessao ? await listarProjetos(sessao.empresaId) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Novo memorial descritivo</h1>
      <NovoMemorialForm projetos={projetos} />
    </div>
  );
}
```

- [ ] **Step 5: Reescrever a lista**

Substitua todo o conteúdo de `src/app/dashboard/memorial/page.tsx` por:

```tsx
import Link from "next/link";

import { getSessionUser } from "@/lib/auth/session";
import { listarMemoriais } from "@/db/queries/memorial";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function MemorialListaPage() {
  const sessao = await getSessionUser();
  const memoriais = sessao ? await listarMemoriais(sessao.empresaId) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Memorial Descritivo</h1>
        <Link href="/dashboard/memorial/novo">
          <Button>Novo memorial</Button>
        </Link>
      </div>
      {memoriais.length === 0 ? (
        <p className="text-muted-foreground">Nenhum memorial ainda.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {memoriais.map((m) => (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle>{m.projetoNome}</CardTitle>
                <CardDescription>
                  {m.status === "gerado" && m.documentoGeradoUrl ? (
                    <a href={m.documentoGeradoUrl} className="underline">
                      Baixar PDF
                    </a>
                  ) : (
                    "Rascunho"
                  )}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Rodar a suíte inteira e o build**

Run: `npm test`
Expected: PASS — todos os testes anteriores + os novos desta feature.

Run: `npm run build`
Expected: build passa, `/dashboard/memorial`, `/dashboard/memorial/novo`, `/api/memoriais`, `/api/memoriais/[id]/pdf` aparecem na saída como rotas geradas.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-criar-memorial.ts src/app/dashboard/memorial
git commit -m "feat: add memorial list, creation form, and audio recorder"
```

---

### Task 9: Verificação manual do fluxo completo

**Files:** nenhum (task de verificação — só um commit final se algo precisar de ajuste).

**Interfaces:** nenhuma — consome tudo das Tasks 1-8.

- [ ] **Step 1: Build e suíte completos**

Run: `npm run build`
Expected: sucesso.

Run: `npm test`
Expected: 100% dos testes passando.

- [ ] **Step 2: Verificar o fluxo em modo texto via navegador (Playwright ou real)**

Suba o dev server numa porta alternativa. Com um usuário/projeto já existentes (ou crie novos):

1. Acesse `/dashboard/memorial`. Confirme: lista vazia com CTA "Novo memorial" (se for a primeira vez).
2. Clique "Novo memorial". Confirme: formulário mostra o select de projeto, campo de tipo de construção, os 3 campos numéricos opcionais, e o toggle "Digitar"/"Gravar áudio" (começando em "Digitar").
3. Selecione um projeto, preencha tipo de construção e ao menos 1 campo de especificação técnica. Submeta. Confirme: botão mostra "Gerando...", e depois de um tempo (chamadas reais de LLM + Puppeteer) redireciona pra `/dashboard/memorial` mostrando o novo memorial com status "gerado" e um link "Baixar PDF".
4. Clique em "Baixar PDF". Confirme: um PDF válido é baixado, com o layout ABNT (título, identificação da obra, seções de descrição geral e especificações técnicas com texto em prosa, não só os campos brutos).
5. Tente submeter o formulário sem selecionar projeto ou sem tipo de construção. Confirme: mensagem de erro aparece, nada é criado.

- [ ] **Step 3: Modo áudio — cobertura via teste automatizado, não via browser**

Gravação de áudio real via `getUserMedia`/`MediaRecorder` não é praticamente testável via automação de browser neste ambiente (exigiria permissão de microfone real ou flags especiais de inicialização do browser que a ferramenta de automação disponível não expõe). A Task 5 já cobre o pipeline completo do modo áudio (transcrição → extração → prosa → PDF) com teste automatizado real contra o banco, usando apenas o `memorialRouter` mockado — isso é a cobertura considerada suficiente para este modo nesta rodada. Se quiser uma verificação manual humana com microfone de verdade, isso fica pra você fazer depois, fora deste plano.

- [ ] **Step 4: Parar o dev server**

Confirme que o processo foi encerrado.

- [ ] **Step 5: Commit final, só se algo precisou de ajuste**

```bash
git add -A
git commit -m "fix: <descrição específica do que a verificação manual encontrou>"
```

Se tudo passou de primeira, esta task não gera commit.
