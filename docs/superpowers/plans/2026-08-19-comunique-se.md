# Tradutor de Exigências da Prefeitura (Comunique-se) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload de PDF de Comunique-se → extração local de texto → uma chamada de LLM estruturada → checklist interativo (checkbox persistido por item), com listagem, retry manual e download do PDF original.

**Architecture:** Pipeline síncrono isolado em `src/lib/comunique-se/processar.ts` (gera um `id` antecipado, salva o PDF em disco, cria a linha `processando`, extrai texto localmente via `pdf-parse`, chama `comuniqueSeRouter.extractStructured`, marca `pronto`/`erro`), chamado por um Route Handler fino (`POST /api/comunique-se`). Rotas separadas para retry (`POST /api/comunique-se/[id]/retry`), toggle de item (`PATCH /api/comunique-se/[id]/itens`) e download do PDF original (`GET /api/comunique-se/[id]/pdf`).

**Tech Stack:** Next.js App Router, Drizzle, Zod, React Query, `pdf-parse@1.1.1` (novo), shadcn (`Card`, `Button`, `Checkbox` — já instalados).

## Global Constraints

- `pdf-parse@1.1.1` **já instalado e verificado neste ambiente** durante a escrita deste plano: `npm install pdf-parse@1.1.1` funciona sem problema. **Import obrigatório pelo caminho interno** `pdf-parse/lib/pdf-parse.js`, nunca `pdf-parse` direto — o `index.js` do pacote tem um bug conhecido (`isDebugMode = !module.parent`) que, sob import ESM/bundler, sempre entra em modo debug e tenta ler um arquivo de teste fixo (`./test/data/05-versions-space.pdf`), lançando `ENOENT`. Confirmado reproduzindo o erro e testando o workaround (`pdf-parse/lib/pdf-parse.js`) com um PDF real gerado via Puppeteer — funciona.
- O import acima não tem tipos (`Could not find a declaration file`, confirmado com `tsc --noEmit` contra o `tsconfig.json` real do projeto) — precisa de um `.d.ts` ambiente (Task 1).
- O `id` de cada `comunique_se` é gerado em código (`crypto.randomUUID()`), **não** pelo `defaultRandom()` do Postgres — porque `pdfOriginalUrl` é `NOT NULL` no schema (`src/db/schema/comunique-se.ts:11`) e precisa existir desde o insert. Gerar o `id` antes, montar `pdfOriginalUrl` a partir dele, salvar o PDF, e só então inserir a linha (uma única inserção, sem update parcial depois).
- Falha em qualquer etapa de extração/LLM (depois da linha já inserida) marca `status: "erro"` (diferente do memorial, que fica implicitamente em `rascunho`) — decisão já fechada no design spec.
- PDF fica em `storage/comunique-se/` (disco local) — **já coberto** pelo `/storage/` no `.gitignore` (adicionado no plano do memorial), nenhuma mudança necessária ali.
- **`.env.test` precisa de `COMUNIQUE_SE_STORAGE_DIR="storage/comunique-se-test"`** — mesmo motivo do commit `bdba512` (`fix(memorial): isola storage de teste da pasta real usada em dev`): sem isso, os testes de storage/pipeline usam o mesmo diretório default do dev (`storage/comunique-se`) e o `afterEach` de cada teste apaga essa pasta de verdade — já causou perda real de PDFs uma vez neste projeto (para o memorial). Adicionar essa variável faz parte da Task 2.
- Limite de upload: 10MB (verificado no buffer decodificado, antes de qualquer inserção no banco).
- `POST /api/comunique-se`, `POST /api/comunique-se/[id]/retry`, `PATCH /api/comunique-se/[id]/itens` e `GET /api/comunique-se/[id]/pdf` leem a sessão direto do `NextRequest` (não `getSessionUser()`) — mesmo motivo já estabelecido no memorial: `next/headers`'s `cookies()` lança fora do request scope real do Next, quebrando testes que chamam os handlers direto.
- Sem teste de UI (mesmo padrão do projeto, sem RTL/jsdom) — cobertura por testes de integração (query layer, pipeline, rotas) + verificação manual (Task 12).
- Todo teste que chama `comuniqueSeRouter` usa mock (`vi.mock("@/core/llm", ...)`) — nenhuma chamada real de API de LLM. Puppeteer (só nos testes, pra gerar PDFs reais de fixture), banco e storage em disco são reais.

---

### Task 1: Tipos do `pdf-parse` + extração de texto local

**Files:**
- Create: `src/types/pdf-parse.d.ts`
- Create: `src/lib/comunique-se/extrair-texto.ts`
- Test: `src/lib/comunique-se/__tests__/extrair-texto.test.ts`

**Interfaces:**
- Consumes: `puppeteer` (já instalado, só usado no teste pra gerar um PDF real de fixture).
- Produces: `export async function extrairTextoPdf(buffer: Buffer): Promise<string>` (texto já com `.trim()`). Task 5 usa esta função.

- [ ] **Step 1: Declarar o módulo ambiente pro import interno do pdf-parse**

Crie `src/types/pdf-parse.d.ts`:

```ts
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResultado {
    text: string;
    numpages: number;
  }

  function pdfParse(dataBuffer: Uint8Array): Promise<PdfParseResultado>;

  export default pdfParse;
}
```

- [ ] **Step 2: Escrever o teste (vai falhar — o módulo não existe)**

Crie `src/lib/comunique-se/__tests__/extrair-texto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import puppeteer from "puppeteer";

import { extrairTextoPdf } from "../extrair-texto";

async function gerarPdfDeTeste(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "a4" });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

describe("extrairTextoPdf", () => {
  it("extrai o texto de um PDF real com conteúdo", async () => {
    const pdf = await gerarPdfDeTeste("<p>Exigencia numero um: apresentar ART.</p>");

    const texto = await extrairTextoPdf(pdf);

    expect(texto).toContain("Exigencia numero um: apresentar ART.");
  });

  it("retorna string vazia (ou só espaços) pra PDF sem texto", async () => {
    const pdf = await gerarPdfDeTeste("<html><body></body></html>");

    const texto = await extrairTextoPdf(pdf);

    expect(texto.trim()).toBe("");
  });
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/comunique-se/__tests__/extrair-texto.test.ts`
Expected: FAIL — `Cannot find module '../extrair-texto'` (ou equivalente).

- [ ] **Step 4: Implementar `extrair-texto.ts`**

Crie `src/lib/comunique-se/extrair-texto.ts`:

```ts
import pdfParse from "pdf-parse/lib/pdf-parse.js";

// Buffers pequenos (< 4KB) podem vir de um pool interno do Node com
// byteOffset != 0; o pdf.js vendorizado dentro do pdf-parse ignora esse
// offset e lê o ArrayBuffer inteiro, corrompendo o parse ("bad XRef
// entry"). new Uint8Array(buffer) copia só a janela válida, sem esse risco.
export async function extrairTextoPdf(buffer: Buffer): Promise<string> {
  const resultado = await pdfParse(new Uint8Array(buffer));
  return resultado.text.trim();
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/comunique-se/__tests__/extrair-texto.test.ts`
Expected: PASS — 2 testes (usa Puppeteer real internamente, pode levar alguns segundos).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/types/pdf-parse.d.ts src/lib/comunique-se/extrair-texto.ts src/lib/comunique-se/__tests__/extrair-texto.test.ts
git commit -m "feat: add local PDF text extraction via pdf-parse"
```

---

### Task 2: Storage em disco + validação de PDF

**Files:**
- Create: `src/lib/comunique-se/storage.ts`
- Test: `src/lib/comunique-se/__tests__/storage.test.ts`

**Interfaces:**
- Produces: `export async function salvarArquivo(nomeArquivo: string, conteudo: Buffer): Promise<string>`, `export async function lerArquivo(nomeArquivo: string): Promise<Buffer>`, `export const TAMANHO_MAXIMO_PDF_BYTES = 10 * 1024 * 1024`, `export function ehPdfValido(buffer: Buffer): boolean` (checa o magic number `%PDF-`). Task 6 usa `salvarArquivo`, `ehPdfValido`, `TAMANHO_MAXIMO_PDF_BYTES`; Task 5 usa `salvarArquivo`/`lerArquivo`; Task 8 usa `lerArquivo`.
- Consumes: nada de tasks anteriores deste plano.

- [ ] **Step 1: Escrever os testes (vão falhar — o módulo não existe)**

Crie `src/lib/comunique-se/__tests__/storage.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";

import { ehPdfValido, lerArquivo, salvarArquivo, TAMANHO_MAXIMO_PDF_BYTES } from "../storage";

const DIR_STORAGE = path.join(process.cwd(), "storage", "comunique-se");

describe("salvarArquivo / lerArquivo", () => {
  afterEach(async () => {
    await rm(DIR_STORAGE, { recursive: true, force: true });
  });

  it("salva e lê o mesmo conteúdo de volta", async () => {
    await salvarArquivo("teste.pdf", Buffer.from("%PDF-fake"));

    const lido = await lerArquivo("teste.pdf");

    expect(lido.toString()).toBe("%PDF-fake");
  });

  it("cria o diretório de storage se ele não existir ainda", async () => {
    const caminho = await salvarArquivo("outro-teste.pdf", Buffer.from("x"));

    expect(caminho).toContain(path.join("storage", "comunique-se"));
  });
});

describe("ehPdfValido", () => {
  it("aceita buffer que começa com o magic number %PDF-", () => {
    expect(ehPdfValido(Buffer.from("%PDF-1.4 resto do arquivo"))).toBe(true);
  });

  it("rejeita buffer que não é PDF", () => {
    expect(ehPdfValido(Buffer.from("não é pdf"))).toBe(false);
  });
});

describe("TAMANHO_MAXIMO_PDF_BYTES", () => {
  it("é 10MB", () => {
    expect(TAMANHO_MAXIMO_PDF_BYTES).toBe(10 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/comunique-se/__tests__/storage.test.ts`
Expected: FAIL — `Cannot find module '../storage'` (ou equivalente).

- [ ] **Step 3: Implementar `storage.ts`**

Crie `src/lib/comunique-se/storage.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR_STORAGE = path.join(process.cwd(), process.env.COMUNIQUE_SE_STORAGE_DIR ?? "storage/comunique-se");

export const TAMANHO_MAXIMO_PDF_BYTES = 10 * 1024 * 1024;

export async function salvarArquivo(nomeArquivo: string, conteudo: Buffer): Promise<string> {
  await mkdir(DIR_STORAGE, { recursive: true });
  const caminho = path.join(DIR_STORAGE, nomeArquivo);
  await writeFile(caminho, conteudo);
  return caminho;
}

export async function lerArquivo(nomeArquivo: string): Promise<Buffer> {
  return readFile(path.join(DIR_STORAGE, nomeArquivo));
}

export function ehPdfValido(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/comunique-se/__tests__/storage.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Adicionar `COMUNIQUE_SE_STORAGE_DIR` ao `.env.example`**

Em `.env.example`, logo abaixo do comentário sobre `PUPPETEER_EXECUTABLE_PATH` (não remova nada existente), adicione:

```
# Storage local do módulo Comunique-se. Deixe vazio pra usar o default
# (storage/comunique-se, relativo à raiz do projeto).
COMUNIQUE_SE_STORAGE_DIR=""
```

- [ ] **Step 6: Isolar o storage de teste do storage de dev em `.env.test`**

Em `.env.test`, logo abaixo de `MEMORIAL_STORAGE_DIR` (não remova nada existente), adicione:

```
# Mesmo motivo do MEMORIAL_STORAGE_DIR acima: os testes apagam essa pasta a
# cada execucao, e usar a mesma do dev ja causou perda de PDFs reais antes.
COMUNIQUE_SE_STORAGE_DIR="storage/comunique-se-test"
```

Sem isso, `storage.ts` cai no default (`storage/comunique-se`, a mesma pasta
onde o app grava os PDFs em dev) durante os testes, e o `afterEach` de cada
teste apaga essa pasta de verdade.

- [ ] **Step 7: Commit**

```bash
git add .env.example .env.test src/lib/comunique-se/storage.ts src/lib/comunique-se/__tests__/storage.test.ts
git commit -m "feat: add local file storage and PDF magic-number validation for comunique-se"
```

---

### Task 3: Query layer (`comunique-se.ts`)

**Files:**
- Create: `src/db/queries/comunique-se.ts`
- Test: `src/db/queries/__tests__/comunique-se.test.ts`

**Interfaces:**
- Produces: `export interface ChecklistItem { id: string; descricao: string; concluida: boolean }`, `export interface ComuniqueSe { id: string; numero: number; projetoId: string; status: string; pdfOriginalUrl: string; checklistJson: { itens: ChecklistItem[] } | null; createdAt: Date }`, `export interface ComuniqueSeComProjeto extends ComuniqueSe { projetoNome: string }`, `criarComuniqueSeProcessando(input: { id: string; projetoId: string; empresaId: string; pdfOriginalUrl: string }): Promise<ComuniqueSe>`, `listarComuniqueSe(empresaId: string): Promise<ComuniqueSeComProjeto[]>`, `buscarComuniqueSeDaEmpresa(id: string, empresaId: string): Promise<ComuniqueSe | null>`, `marcarComoPronto(id: string, itens: ChecklistItem[]): Promise<void>`, `marcarComoErro(id: string): Promise<void>`, `atualizarItemChecklist(id: string, itemId: string, concluida: boolean): Promise<ChecklistItem[] | null>` (retorna `null` se o Comunique-se não tem checklist ainda ou o `itemId` não existe).
- Consumes: nada de tasks anteriores deste plano. Tasks 5, 6, 7, 8, 9 chamam essas funções.

- [ ] **Step 1: Escrever os testes (vão falhar — o módulo não existe)**

Crie `src/db/queries/__tests__/comunique-se.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto } from "@/db/schema";
import {
  atualizarItemChecklist,
  buscarComuniqueSeDaEmpresa,
  criarComuniqueSeProcessando,
  listarComuniqueSe,
  marcarComoErro,
  marcarComoPronto,
} from "../comunique-se";

async function limparBanco() {
  await db.delete(comuniqueSe);
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

describe("criarComuniqueSeProcessando", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria com status processando e o pdfOriginalUrl informado", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();

    const resultado = await criarComuniqueSeProcessando({
      id,
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      pdfOriginalUrl: `/api/comunique-se/${id}/pdf`,
    });

    expect(resultado.id).toBe(id);
    expect(resultado.status).toBe("processando");
    expect(resultado.pdfOriginalUrl).toBe(`/api/comunique-se/${id}/pdf`);
    expect(resultado.checklistJson).toBeNull();
  });
});

describe("listarComuniqueSe", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("lista só os Comunique-se da empresa pedida, com o nome do projeto", async () => {
    const { empresa: empresaA, projeto: projetoA } = await criarProjetoDeTeste("Empresa A");
    const { projeto: projetoB } = await criarProjetoDeTeste("Empresa B");
    await criarComuniqueSeProcessando({
      id: randomUUID(),
      projetoId: projetoA.id,
      empresaId: empresaA.id,
      pdfOriginalUrl: "/x",
    });
    await criarComuniqueSeProcessando({
      id: randomUUID(),
      projetoId: projetoB.id,
      empresaId: projetoB.empresaId,
      pdfOriginalUrl: "/y",
    });

    const resultado = await listarComuniqueSe(empresaA.id);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].projetoNome).toBe("Casa da Praia");
  });

  it("retorna lista vazia quando a empresa não tem Comunique-se", async () => {
    const { empresa: novaEmpresa } = await criarProjetoDeTeste();

    const resultado = await listarComuniqueSe(novaEmpresa.id);

    expect(resultado).toEqual([]);
  });
});

describe("buscarComuniqueSeDaEmpresa", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("retorna o Comunique-se quando pertence à empresa", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });

    const resultado = await buscarComuniqueSeDaEmpresa(id, novaEmpresa.id);

    expect(resultado?.id).toBe(id);
  });

  it("retorna null quando o Comunique-se é de outra empresa", async () => {
    const { projeto: projetoA } = await criarProjetoDeTeste("Empresa A");
    const { empresa: empresaB } = await criarProjetoDeTeste("Empresa B");
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: projetoA.id, empresaId: projetoA.empresaId, pdfOriginalUrl: "/x" });

    const resultado = await buscarComuniqueSeDaEmpresa(id, empresaB.id);

    expect(resultado).toBeNull();
  });
});

describe("marcarComoPronto / marcarComoErro", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("marcarComoPronto atualiza status e checklistJson", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    const itens = [{ id: randomUUID(), descricao: "Apresentar ART", concluida: false }];

    await marcarComoPronto(id, itens);

    const resultado = await buscarComuniqueSeDaEmpresa(id, novaEmpresa.id);
    expect(resultado?.status).toBe("pronto");
    expect(resultado?.checklistJson?.itens).toEqual(itens);
  });

  it("marcarComoErro atualiza status pra erro sem mexer no checklistJson", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });

    await marcarComoErro(id);

    const resultado = await buscarComuniqueSeDaEmpresa(id, novaEmpresa.id);
    expect(resultado?.status).toBe("erro");
    expect(resultado?.checklistJson).toBeNull();
  });
});

describe("atualizarItemChecklist", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("alterna concluida de um item existente e retorna a lista atualizada", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    const itemId = randomUUID();
    await marcarComoPronto(id, [{ id: itemId, descricao: "Apresentar ART", concluida: false }]);

    const resultado = await atualizarItemChecklist(id, itemId, true);

    expect(resultado).toEqual([{ id: itemId, descricao: "Apresentar ART", concluida: true }]);
  });

  it("retorna null quando o itemId não existe no checklist", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    await marcarComoPronto(id, [{ id: randomUUID(), descricao: "Apresentar ART", concluida: false }]);

    const resultado = await atualizarItemChecklist(id, "item-inexistente", true);

    expect(resultado).toBeNull();
  });

  it("retorna null quando o Comunique-se ainda não tem checklist (status processando)", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });

    const resultado = await atualizarItemChecklist(id, "qualquer-id", true);

    expect(resultado).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/db/queries/__tests__/comunique-se.test.ts`
Expected: FAIL — `Cannot find module '../comunique-se'` (ou equivalente).

- [ ] **Step 3: Implementar `comunique-se.ts`**

Crie `src/db/queries/comunique-se.ts`:

```ts
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { comuniqueSe, projeto } from "@/db/schema";
import { proximoNumero } from "./contador";

export interface ChecklistItem {
  id: string;
  descricao: string;
  concluida: boolean;
}

interface ChecklistJson {
  itens: ChecklistItem[];
}

export interface ComuniqueSe {
  id: string;
  numero: number;
  projetoId: string;
  status: string;
  pdfOriginalUrl: string;
  checklistJson: ChecklistJson | null;
  createdAt: Date;
}

export interface ComuniqueSeComProjeto extends ComuniqueSe {
  projetoNome: string;
}

const CAMPOS_COMUNIQUE_SE = {
  id: comuniqueSe.id,
  numero: comuniqueSe.numero,
  projetoId: comuniqueSe.projetoId,
  status: comuniqueSe.status,
  pdfOriginalUrl: comuniqueSe.pdfOriginalUrl,
  checklistJson: comuniqueSe.checklistJson,
  createdAt: comuniqueSe.createdAt,
};

export async function criarComuniqueSeProcessando(input: {
  id: string;
  projetoId: string;
  empresaId: string;
  pdfOriginalUrl: string;
}): Promise<ComuniqueSe> {
  const numero = await proximoNumero(input.empresaId, "comunique_se");
  const [criado] = await db
    .insert(comuniqueSe)
    .values({ id: input.id, projetoId: input.projetoId, numero, pdfOriginalUrl: input.pdfOriginalUrl })
    .returning(CAMPOS_COMUNIQUE_SE);
  return criado as ComuniqueSe;
}

export async function listarComuniqueSe(empresaId: string): Promise<ComuniqueSeComProjeto[]> {
  const resultado = await db
    .select({ ...CAMPOS_COMUNIQUE_SE, projetoNome: projeto.nome })
    .from(comuniqueSe)
    .innerJoin(projeto, eq(comuniqueSe.projetoId, projeto.id))
    .where(eq(projeto.empresaId, empresaId))
    .orderBy(desc(comuniqueSe.createdAt));
  return resultado as ComuniqueSeComProjeto[];
}

export async function buscarComuniqueSeDaEmpresa(id: string, empresaId: string): Promise<ComuniqueSe | null> {
  const [resultado] = await db
    .select(CAMPOS_COMUNIQUE_SE)
    .from(comuniqueSe)
    .innerJoin(projeto, eq(comuniqueSe.projetoId, projeto.id))
    .where(and(eq(comuniqueSe.id, id), eq(projeto.empresaId, empresaId)))
    .limit(1);
  return (resultado as ComuniqueSe) ?? null;
}

export async function marcarComoPronto(id: string, itens: ChecklistItem[]): Promise<void> {
  await db
    .update(comuniqueSe)
    .set({ status: "pronto", checklistJson: { itens }, updatedAt: new Date() })
    .where(eq(comuniqueSe.id, id));
}

export async function marcarComoErro(id: string): Promise<void> {
  await db.update(comuniqueSe).set({ status: "erro", updatedAt: new Date() }).where(eq(comuniqueSe.id, id));
}

export async function atualizarItemChecklist(
  id: string,
  itemId: string,
  concluida: boolean,
): Promise<ChecklistItem[] | null> {
  const [linha] = await db
    .select({ checklistJson: comuniqueSe.checklistJson })
    .from(comuniqueSe)
    .where(eq(comuniqueSe.id, id))
    .limit(1);

  const atual = linha?.checklistJson as ChecklistJson | null | undefined;
  if (!atual) return null;

  const indice = atual.itens.findIndex((item) => item.id === itemId);
  if (indice === -1) return null;

  const itensAtualizados = atual.itens.map((item, i) => (i === indice ? { ...item, concluida } : item));

  await db
    .update(comuniqueSe)
    .set({ checklistJson: { itens: itensAtualizados }, updatedAt: new Date() })
    .where(eq(comuniqueSe.id, id));

  return itensAtualizados;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/db/queries/__tests__/comunique-se.test.ts`
Expected: PASS — 10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries/comunique-se.ts src/db/queries/__tests__/comunique-se.test.ts
git commit -m "feat: add comunique-se query layer"
```

---

### Task 4: Schemas Zod (create, toggle-item, response)

**Files:**
- Create: `src/lib/validations/comunique-se/create.schema.ts`
- Create: `src/lib/validations/comunique-se/toggle-item.schema.ts`
- Create: `src/lib/validations/comunique-se/response.schema.ts`
- Test: `src/lib/validations/comunique-se/__tests__/create.schema.test.ts`
- Test: `src/lib/validations/comunique-se/__tests__/toggle-item.schema.test.ts`

**Interfaces:**
- Produces: `export const criarComuniqueSeSchema`, `export type CriarComuniqueSeInput = z.infer<typeof criarComuniqueSeSchema>` (`{ projetoId: string; pdfBase64: string }`); `export const alternarItemChecklistSchema`, `export type AlternarItemChecklistInput` (`{ itemId: string; concluida: boolean }`); `export const comuniqueSeResponseSchema`, `export type ComuniqueSeResponse` (`{ id, numero, projetoNome, status, pdfOriginalUrl, createdAt }`, todos `string`/`number` já serializados). Tasks 6, 7, 9, 10 usam esses tipos.

- [ ] **Step 1: Escrever os testes (vão falhar — os módulos não existem)**

Crie `src/lib/validations/comunique-se/__tests__/create.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { criarComuniqueSeSchema } from "../create.schema";

describe("criarComuniqueSeSchema", () => {
  it("aceita projetoId válido e pdfBase64 não vazio", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      projetoId: "11111111-1111-4111-8111-111111111111",
      pdfBase64: "JVBERi0=",
    });

    expect(resultado.success).toBe(true);
  });

  it("rejeita projetoId que não é uuid", () => {
    const resultado = criarComuniqueSeSchema.safeParse({ projetoId: "abc", pdfBase64: "JVBERi0=" });

    expect(resultado.success).toBe(false);
  });

  it("rejeita pdfBase64 vazio", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      projetoId: "11111111-1111-4111-8111-111111111111",
      pdfBase64: "",
    });

    expect(resultado.success).toBe(false);
  });
});
```

Crie `src/lib/validations/comunique-se/__tests__/toggle-item.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { alternarItemChecklistSchema } from "../toggle-item.schema";

describe("alternarItemChecklistSchema", () => {
  it("aceita itemId e concluida boolean", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc", concluida: true });

    expect(resultado.success).toBe(true);
  });

  it("rejeita concluida que não é boolean", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc", concluida: "sim" });

    expect(resultado.success).toBe(false);
  });

  it("rejeita itemId vazio", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "", concluida: true });

    expect(resultado.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/validations/comunique-se/__tests__/`
Expected: FAIL — `Cannot find module '../create.schema'` e `'../toggle-item.schema'`.

- [ ] **Step 3: Implementar os três schemas**

Crie `src/lib/validations/comunique-se/create.schema.ts`:

```ts
import { z } from "zod";

export const criarComuniqueSeSchema = z.object({
  projetoId: z.string().uuid("Selecione um projeto."),
  pdfBase64: z.string().min(1, "Arquivo PDF ausente."),
});

export type CriarComuniqueSeInput = z.infer<typeof criarComuniqueSeSchema>;
```

Crie `src/lib/validations/comunique-se/toggle-item.schema.ts`:

```ts
import { z } from "zod";

export const alternarItemChecklistSchema = z.object({
  itemId: z.string().min(1, "itemId ausente."),
  concluida: z.boolean(),
});

export type AlternarItemChecklistInput = z.infer<typeof alternarItemChecklistSchema>;
```

Crie `src/lib/validations/comunique-se/response.schema.ts`:

```ts
import { z } from "zod";

export const comuniqueSeResponseSchema = z.object({
  id: z.string(),
  numero: z.number(),
  projetoNome: z.string(),
  status: z.string(),
  pdfOriginalUrl: z.string(),
  createdAt: z.string(),
});

export type ComuniqueSeResponse = z.infer<typeof comuniqueSeResponseSchema>;
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/validations/comunique-se/__tests__/`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/comunique-se
git commit -m "feat: add comunique-se create/toggle-item/response Zod schemas"
```

---

### Task 5: Pipeline (`processarComuniqueSe` / `reprocessarComuniqueSe`)

**Files:**
- Create: `src/lib/comunique-se/processar.ts`
- Test: `src/lib/comunique-se/__tests__/processar.test.ts`

**Interfaces:**
- Consumes: `comuniqueSeRouter` de `@/core/llm` (já existe), `criarComuniqueSeProcessando`/`marcarComoPronto`/`marcarComoErro` de `@/db/queries/comunique-se` (Task 3), `extrairTextoPdf` de `./extrair-texto` (Task 1), `salvarArquivo`/`lerArquivo` de `./storage` (Task 2).
- Produces: `export async function processarComuniqueSe(input: { projetoId: string; empresaId: string; pdfBuffer: Buffer }): Promise<{ id: string; numero: number; status: string; pdfOriginalUrl: string }>` (assume que `pdfBuffer` já foi validado como PDF pelo chamador — ver Task 6 — propaga qualquer erro de extração/LLM depois de marcar `erro`), `export async function reprocessarComuniqueSe(id: string, numero: number, pdfOriginalUrl: string): Promise<{ id: string; numero: number; status: string; pdfOriginalUrl: string }>`. Tasks 6 e 7 chamam essas funções.

- [ ] **Step 1: Escrever os testes (vão falhar — o módulo não existe)**

Crie `src/lib/comunique-se/__tests__/processar.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto } from "@/db/schema";

vi.mock("@/core/llm", () => ({
  comuniqueSeRouter: {
    extractStructured: vi.fn(),
  },
}));

import { comuniqueSeRouter } from "@/core/llm";
import { processarComuniqueSe, reprocessarComuniqueSe } from "../processar";
import { lerArquivo, salvarArquivo } from "../storage";

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarProjetoDeTeste() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  return { empresa: novaEmpresa, projeto: novoProjeto };
}

// Testes deste arquivo usam PDFs REAIS gerados via Puppeteer (mesma abordagem
// da Task 1) — um buffer fake com só o prefixo "%PDF-" passa no magic-number
// mas o `pdf-parse` real, chamado dentro do pipeline, falharia ao tentar
// interpretar a estrutura interna de um PDF inválido.
async function gerarPdfDeTeste(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "a4" });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

describe("processarComuniqueSe", () => {
  beforeEach(() => {
    vi.mocked(comuniqueSeRouter.extractStructured).mockReset();
  });

  afterEach(async () => {
    await limparBanco();
    await rm(path.join(process.cwd(), "storage", "comunique-se"), { recursive: true, force: true });
  });

  it("processa com sucesso: extrai texto, chama o LLM e marca pronto", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdf = await gerarPdfDeTeste("<p>Exigencia numero um: apresentar ART.</p>");
    vi.mocked(comuniqueSeRouter.extractStructured).mockResolvedValue({
      data: { itens: [{ descricao: "Apresentar ART do responsável técnico" }] },
      provider: "fake",
      raw: {},
    });

    const resultado = await processarComuniqueSe({
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      pdfBuffer: pdf,
    });

    expect(resultado.status).toBe("pronto");
    expect(resultado.pdfOriginalUrl).toBe(`/api/comunique-se/${resultado.id}/pdf`);

    const [linha] = await db.select().from(comuniqueSe);
    expect(linha.status).toBe("pronto");
    expect(linha.checklistJson).toMatchObject({
      itens: [{ descricao: "Apresentar ART do responsável técnico", concluida: false }],
    });

    const arquivoSalvo = await lerArquivo(`${resultado.id}.pdf`);
    expect(arquivoSalvo.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("marca erro (mas mantém a linha e o PDF) quando o LLM falha", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdf = await gerarPdfDeTeste("<p>Exigencia numero um: apresentar ART.</p>");
    vi.mocked(comuniqueSeRouter.extractStructured).mockRejectedValue(new Error("LLM indisponível"));

    await expect(
      processarComuniqueSe({
        projetoId: novoProjeto.id,
        empresaId: novaEmpresa.id,
        pdfBuffer: pdf,
      }),
    ).rejects.toThrow("LLM indisponível");

    const [linha] = await db.select().from(comuniqueSe);
    expect(linha.status).toBe("erro");
    expect(linha.checklistJson).toBeNull();
  });

  it("marca erro sem chamar o LLM quando o PDF não tem texto extraível", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdf = await gerarPdfDeTeste("<html><body></body></html>");

    await expect(
      processarComuniqueSe({
        projetoId: novoProjeto.id,
        empresaId: novaEmpresa.id,
        pdfBuffer: pdf,
      }),
    ).rejects.toThrow("PDF sem texto extraível.");

    expect(comuniqueSeRouter.extractStructured).not.toHaveBeenCalled();
    const [linha] = await db.select().from(comuniqueSe);
    expect(linha.status).toBe("erro");
  });
});

describe("reprocessarComuniqueSe", () => {
  beforeEach(() => {
    vi.mocked(comuniqueSeRouter.extractStructured).mockReset();
  });

  afterEach(async () => {
    await limparBanco();
    await rm(path.join(process.cwd(), "storage", "comunique-se"), { recursive: true, force: true });
  });

  it("relê o PDF salvo em disco (sem receber buffer novo) e reprocessa com sucesso", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdf = await gerarPdfDeTeste("<p>Exigencia numero um: apresentar ART.</p>");
    vi.mocked(comuniqueSeRouter.extractStructured).mockRejectedValueOnce(new Error("primeira falha"));
    const primeiraTentativa = await processarComuniqueSe({
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      pdfBuffer: pdf,
    }).catch(() => null);
    expect(primeiraTentativa).toBeNull();

    const [linhaErro] = await db.select().from(comuniqueSe);
    expect(linhaErro.status).toBe("erro");

    vi.mocked(comuniqueSeRouter.extractStructured).mockResolvedValue({
      data: { itens: [{ descricao: "Apresentar ART" }] },
      provider: "fake",
      raw: {},
    });

    const resultado = await reprocessarComuniqueSe(linhaErro.id, linhaErro.numero, linhaErro.pdfOriginalUrl);

    expect(resultado.status).toBe("pronto");
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/comunique-se/__tests__/processar.test.ts`
Expected: FAIL — `Cannot find module '../processar'` (ou equivalente).

- [ ] **Step 3: Implementar `processar.ts`**

Crie `src/lib/comunique-se/processar.ts`:

```ts
import { randomUUID } from "node:crypto";

import { comuniqueSeRouter } from "@/core/llm";
import {
  criarComuniqueSeProcessando,
  marcarComoErro,
  marcarComoPronto,
  type ChecklistItem,
} from "@/db/queries/comunique-se";
import { extrairTextoPdf } from "./extrair-texto";
import { lerArquivo, salvarArquivo } from "./storage";

const SCHEMA_CHECKLIST = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: { descricao: { type: "string" } },
        required: ["descricao"],
      },
    },
  },
  required: ["itens"],
};

type ResultadoProcessamento = { id: string; numero: number; status: string; pdfOriginalUrl: string };

async function finalizarProcessamento(id: string, pdfBuffer: Buffer): Promise<{ status: string }> {
  try {
    const texto = await extrairTextoPdf(pdfBuffer);
    if (!texto) {
      throw new Error("PDF sem texto extraível.");
    }

    const resultado = await comuniqueSeRouter.extractStructured<{ itens: { descricao: string }[] }>({
      systemPrompt:
        "Você traduz exigências de um documento 'Comunique-se' da prefeitura em uma lista de tarefas " +
        "objetivas, em linguagem simples, para um engenheiro ou arquiteto entender o que precisa ser feito.",
      userPrompt: texto,
      schema: SCHEMA_CHECKLIST,
    });

    const itens: ChecklistItem[] = resultado.data.itens.map((item) => ({
      id: randomUUID(),
      descricao: item.descricao,
      concluida: false,
    }));

    await marcarComoPronto(id, itens);
    return { status: "pronto" };
  } catch (error) {
    await marcarComoErro(id);
    throw error;
  }
}

export async function processarComuniqueSe(input: {
  projetoId: string;
  empresaId: string;
  pdfBuffer: Buffer;
}): Promise<ResultadoProcessamento> {
  const id = randomUUID();
  const pdfOriginalUrl = `/api/comunique-se/${id}/pdf`;

  await salvarArquivo(`${id}.pdf`, input.pdfBuffer);
  const criado = await criarComuniqueSeProcessando({
    id,
    projetoId: input.projetoId,
    empresaId: input.empresaId,
    pdfOriginalUrl,
  });

  const resultado = await finalizarProcessamento(id, input.pdfBuffer);

  return { id, numero: criado.numero, status: resultado.status, pdfOriginalUrl };
}

export async function reprocessarComuniqueSe(
  id: string,
  numero: number,
  pdfOriginalUrl: string,
): Promise<ResultadoProcessamento> {
  const pdfBuffer = await lerArquivo(`${id}.pdf`);
  const resultado = await finalizarProcessamento(id, pdfBuffer);
  return { id, numero, status: resultado.status, pdfOriginalUrl };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/comunique-se/__tests__/processar.test.ts`
Expected: PASS — 4 testes (usa Puppeteer real internamente, pode levar alguns segundos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/comunique-se/processar.ts src/lib/comunique-se/__tests__/processar.test.ts
git commit -m "feat: add comunique-se processing pipeline (text extraction + LLM checklist)"
```

---

### Task 6: `POST /api/comunique-se` + `GET /api/comunique-se`

**Files:**
- Create: `src/app/api/comunique-se/route.ts`
- Test: `src/app/api/comunique-se/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `criarComuniqueSeSchema` (Task 4), `buscarProjetoDaEmpresa` de `@/db/queries/projeto` (já existe), `processarComuniqueSe` de `@/lib/comunique-se/processar` (Task 5), `listarComuniqueSe` de `@/db/queries/comunique-se` (Task 3), `TAMANHO_MAXIMO_PDF_BYTES`/`ehPdfValido` de `@/lib/comunique-se/storage` (Task 2).
- Produces: `POST /api/comunique-se` (`201`/`400`/`401`/`404`/`500`), `GET /api/comunique-se` (`200 { data, page, total }`/`401`) — nenhuma task futura deste plano consome diretamente.

- [ ] **Step 1: Escrever os testes (vão falhar — a rota não existe)**

Crie `src/app/api/comunique-se/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

vi.mock("@/lib/comunique-se/processar", () => ({
  processarComuniqueSe: vi.fn(),
}));

import { processarComuniqueSe } from "@/lib/comunique-se/processar";
import { GET, POST } from "@/app/api/comunique-se/route";

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(usuario);
  await db.delete(projeto);
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

function criarRequestPost(body: unknown, token?: string) {
  return new NextRequest("http://localhost/api/comunique-se", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function criarRequestGet(token?: string) {
  return new NextRequest("http://localhost/api/comunique-se", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

const PDF_BASE64_FAKE = Buffer.from("%PDF-1.4 fake").toString("base64");

describe("POST /api/comunique-se", () => {
  beforeEach(() => {
    limparBanco();
    vi.mocked(processarComuniqueSe).mockReset();
  });
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await POST(criarRequestPost({}));
    expect(response.status).toBe(401);
  });

  it("rejeita dados inválidos com 400", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(criarRequestPost({}, token));

    expect(response.status).toBe(400);
  });

  it("rejeita projeto de outra empresa (ou inexistente) com 404", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(
      criarRequestPost(
        { projetoId: "00000000-0000-0000-0000-000000000000", pdfBase64: PDF_BASE64_FAKE },
        token,
      ),
    );

    expect(response.status).toBe(404);
  });

  it("rejeita arquivo que não é PDF com 400, sem chamar processarComuniqueSe", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();

    const response = await POST(
      criarRequestPost({ projetoId, pdfBase64: Buffer.from("não é pdf").toString("base64") }, token),
    );

    expect(response.status).toBe(400);
    expect(processarComuniqueSe).not.toHaveBeenCalled();
  });

  it("rejeita arquivo maior que 10MB com 400, sem chamar processarComuniqueSe", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    const bufferGrande = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(10 * 1024 * 1024)]);

    const response = await POST(
      criarRequestPost({ projetoId, pdfBase64: bufferGrande.toString("base64") }, token),
    );

    expect(response.status).toBe(400);
    expect(processarComuniqueSe).not.toHaveBeenCalled();
  });

  it("chama processarComuniqueSe e retorna 201 no sucesso", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(processarComuniqueSe).mockResolvedValue({
      id: "abc",
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: "/api/comunique-se/abc/pdf",
    });

    const response = await POST(criarRequestPost({ projetoId, pdfBase64: PDF_BASE64_FAKE }, token));

    expect(response.status).toBe(201);
    const corpo = await response.json();
    expect(corpo.comuniqueSe.status).toBe("pronto");
  });

  it("retorna 500 quando processarComuniqueSe lança", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(processarComuniqueSe).mockRejectedValue(new Error("falhou"));

    const response = await POST(criarRequestPost({ projetoId, pdfBase64: PDF_BASE64_FAKE }, token));

    expect(response.status).toBe(500);
  });
});

describe("GET /api/comunique-se", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("lista os Comunique-se da empresa no formato padrão { data, page, total }", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    await db
      .insert(comuniqueSe)
      .values({ projetoId, numero: 1, status: "pronto", pdfOriginalUrl: "/x", checklistJson: { itens: [] } });

    const response = await GET(criarRequestGet(token));

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0].status).toBe("pronto");
    expect(corpo.total).toBe(1);
  });

  it("retorna lista vazia quando a empresa não tem Comunique-se", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await GET(criarRequestGet(token));

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.data).toEqual([]);
  });

  it("rejeita request sem sessão com 401", async () => {
    const response = await GET(criarRequestGet());
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/app/api/comunique-se/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/comunique-se/route'` (ou equivalente).

- [ ] **Step 3: Implementar a rota**

Crie `src/app/api/comunique-se/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarProjetoDaEmpresa } from "@/db/queries/projeto";
import { listarComuniqueSe } from "@/db/queries/comunique-se";
import { criarComuniqueSeSchema } from "@/lib/validations/comunique-se/create.schema";
import type { ComuniqueSeResponse } from "@/lib/validations/comunique-se/response.schema";
import type { PaginatedResponse } from "@/lib/pagination";
import { processarComuniqueSe } from "@/lib/comunique-se/processar";
import { ehPdfValido, TAMANHO_MAXIMO_PDF_BYTES } from "@/lib/comunique-se/storage";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const lista = await listarComuniqueSe(sessao.empresaId);

  const body: PaginatedResponse<ComuniqueSeResponse> = {
    data: lista.map((c) => ({
      id: c.id,
      numero: c.numero,
      projetoNome: c.projetoNome,
      status: c.status,
      pdfOriginalUrl: c.pdfOriginalUrl,
      createdAt: c.createdAt.toISOString(),
    })),
    page: 1,
    total: lista.length,
  };

  return NextResponse.json(body);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const parsed = criarComuniqueSeSchema.safeParse(body);
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

  const pdfBuffer = Buffer.from(parsed.data.pdfBase64, "base64");

  if (!ehPdfValido(pdfBuffer)) {
    return NextResponse.json({ error: "Arquivo não é um PDF válido." }, { status: 400 });
  }

  if (pdfBuffer.length > TAMANHO_MAXIMO_PDF_BYTES) {
    return NextResponse.json({ error: "Arquivo excede o tamanho máximo de 10MB." }, { status: 400 });
  }

  try {
    const resultado = await processarComuniqueSe({
      projetoId: parsed.data.projetoId,
      empresaId: sessao.empresaId,
      pdfBuffer,
    });
    return NextResponse.json({ comuniqueSe: resultado }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/comunique-se]", error);
    return NextResponse.json({ error: "Erro ao processar o Comunique-se, tente novamente." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/app/api/comunique-se/__tests__/route.test.ts`
Expected: PASS — 10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/comunique-se/route.ts src/app/api/comunique-se/__tests__/route.test.ts
git commit -m "feat: add POST/GET /api/comunique-se route handlers"
```

---

### Task 7: `POST /api/comunique-se/[id]/retry`

**Files:**
- Create: `src/app/api/comunique-se/[id]/retry/route.ts`
- Test: `src/app/api/comunique-se/[id]/retry/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `buscarComuniqueSeDaEmpresa` de `@/db/queries/comunique-se` (Task 3), `reprocessarComuniqueSe` de `@/lib/comunique-se/processar` (Task 5).
- Produces: `POST /api/comunique-se/[id]/retry` (`200`/`400`/`401`/`404`/`500`) — nenhuma task futura consome diretamente.

- [ ] **Step 1: Escrever os testes (vão falhar — a rota não existe)**

Crie `src/app/api/comunique-se/[id]/retry/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
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

async function criarSessaoComLinha(status: "processando" | "erro" | "pronto" = "erro") {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  const [linha] = await db
    .insert(comuniqueSe)
    .values({ projetoId: novoProjeto.id, numero: 1, status, pdfOriginalUrl: "/x" })
    .returning();
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, comuniqueSeId: linha.id };
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/comunique-se/x/retry", {
    method: "POST",
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("POST /api/comunique-se/[id]/retry", () => {
  beforeEach(async () => {
    await limparBanco();
    vi.mocked(reprocessarComuniqueSe).mockReset();
  });
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await POST(criarRequest(), { params: Promise.resolve({ id: "x" }) });
    expect(response.status).toBe(401);
  });

  it("retorna 404 pra Comunique-se inexistente", async () => {
    const { token } = await criarSessaoComLinha();

    const response = await POST(criarRequest(token), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });

  it("rejeita Comunique-se já pronto com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoComLinha("pronto");

    const response = await POST(criarRequest(token), { params: Promise.resolve({ id: comuniqueSeId }) });

    expect(response.status).toBe(400);
    expect(reprocessarComuniqueSe).not.toHaveBeenCalled();
  });

  it("chama reprocessarComuniqueSe e retorna 200 no sucesso", async () => {
    const { token, comuniqueSeId } = await criarSessaoComLinha("erro");
    vi.mocked(reprocessarComuniqueSe).mockResolvedValue({
      id: comuniqueSeId,
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: "/x",
    });

    const response = await POST(criarRequest(token), { params: Promise.resolve({ id: comuniqueSeId }) });

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.comuniqueSe.status).toBe("pronto");
  });

  it("retorna 500 quando reprocessarComuniqueSe lança", async () => {
    const { token, comuniqueSeId } = await criarSessaoComLinha("erro");
    vi.mocked(reprocessarComuniqueSe).mockRejectedValue(new Error("falhou"));

    const response = await POST(criarRequest(token), { params: Promise.resolve({ id: comuniqueSeId }) });

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run "src/app/api/comunique-se/[id]/retry/__tests__/route.test.ts"`
Expected: FAIL — `Cannot find module '@/app/api/comunique-se/[id]/retry/route'` (ou equivalente).

- [ ] **Step 3: Implementar a rota**

Crie `src/app/api/comunique-se/[id]/retry/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { reprocessarComuniqueSe } from "@/lib/comunique-se/processar";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const comuniqueSeEncontrado = await buscarComuniqueSeDaEmpresa(id, sessao.empresaId);
    if (!comuniqueSeEncontrado) {
      return NextResponse.json({ error: "Comunique-se não encontrado." }, { status: 404 });
    }
    if (comuniqueSeEncontrado.status === "pronto") {
      return NextResponse.json({ error: "Esse Comunique-se já foi processado." }, { status: 400 });
    }

    const resultado = await reprocessarComuniqueSe(
      comuniqueSeEncontrado.id,
      comuniqueSeEncontrado.numero,
      comuniqueSeEncontrado.pdfOriginalUrl,
    );
    return NextResponse.json({ comuniqueSe: resultado });
  } catch (error) {
    console.error("[POST /api/comunique-se/[id]/retry]", error);
    return NextResponse.json({ error: "Erro ao processar o Comunique-se, tente novamente." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run "src/app/api/comunique-se/[id]/retry/__tests__/route.test.ts"`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/comunique-se/[id]/retry/route.ts" "src/app/api/comunique-se/[id]/retry/__tests__/route.test.ts"
git commit -m "feat: add POST /api/comunique-se/[id]/retry route handler"
```

---

### Task 8: `GET /api/comunique-se/[id]/pdf` + `PATCH /api/comunique-se/[id]/itens`

**Files:**
- Create: `src/app/api/comunique-se/[id]/pdf/route.ts`
- Create: `src/app/api/comunique-se/[id]/itens/route.ts`
- Test: `src/app/api/comunique-se/[id]/pdf/__tests__/route.test.ts`
- Test: `src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `buscarComuniqueSeDaEmpresa` (Task 3), `lerArquivo` de `@/lib/comunique-se/storage` (Task 2), `atualizarItemChecklist` de `@/db/queries/comunique-se` (Task 3), `alternarItemChecklistSchema` (Task 4).
- Produces: `GET /api/comunique-se/[id]/pdf`, `PATCH /api/comunique-se/[id]/itens` (`200`/`400`/`401`/`404`) — nenhuma task futura consome diretamente.

- [ ] **Step 1: Escrever os testes de download (vão falhar — a rota não existe)**

Crie `src/app/api/comunique-se/[id]/pdf/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { salvarArquivo } from "@/lib/comunique-se/storage";
import { GET } from "@/app/api/comunique-se/[id]/pdf/route";

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(usuario);
  await db.delete(projeto);
  await db.delete(empresa);
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/comunique-se/x/pdf", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("GET /api/comunique-se/[id]/pdf", () => {
  beforeEach(limparBanco);
  afterEach(async () => {
    await limparBanco();
    await rm(path.join(process.cwd(), "storage", "comunique-se"), { recursive: true, force: true });
  });

  it("retorna o PDF quando o Comunique-se pertence à empresa", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    const [novoUsuario] = await db
      .insert(usuario)
      .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
      .returning();
    const [novoProjeto] = await db
      .insert(projeto)
      .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
      .returning();
    const [linha] = await db
      .insert(comuniqueSe)
      .values({ projetoId: novoProjeto.id, numero: 1, status: "pronto", pdfOriginalUrl: "/x" })
      .returning();
    await salvarArquivo(`${linha.id}.pdf`, Buffer.from("%PDF-fake"));
    const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });

    const response = await GET(criarRequest(token), { params: Promise.resolve({ id: linha.id }) });

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe("%PDF-fake");
  });

  it("retorna 404 pra Comunique-se de outra empresa", async () => {
    const [empresaA] = await db.insert(empresa).values({ nome: "Empresa A" }).returning();
    const [empresaB] = await db.insert(empresa).values({ nome: "Empresa B" }).returning();
    const [usuarioB] = await db
      .insert(usuario)
      .values({ nome: "B", email: "b@ancar.com.br", senhaHash: "hash-fake", empresaId: empresaB.id })
      .returning();
    const [projetoA] = await db.insert(projeto).values({ nome: "Projeto A", empresaId: empresaA.id }).returning();
    const [linhaA] = await db
      .insert(comuniqueSe)
      .values({ projetoId: projetoA.id, numero: 1, status: "pronto", pdfOriginalUrl: "/x" })
      .returning();
    const tokenB = await assinarToken({ userId: usuarioB.id, empresaId: empresaB.id, papel: usuarioB.papel });

    const response = await GET(criarRequest(tokenB), { params: Promise.resolve({ id: linhaA.id }) });

    expect(response.status).toBe(404);
  });

  it("retorna 401 sem sessão", async () => {
    const response = await GET(criarRequest(), { params: Promise.resolve({ id: "x" }) });
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run "src/app/api/comunique-se/[id]/pdf/__tests__/route.test.ts"`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar a rota de download**

Crie `src/app/api/comunique-se/[id]/pdf/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { lerArquivo } from "@/lib/comunique-se/storage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const comuniqueSeEncontrado = await buscarComuniqueSeDaEmpresa(id, sessao.empresaId);

  if (!comuniqueSeEncontrado) {
    return NextResponse.json({ error: "Comunique-se não encontrado." }, { status: 404 });
  }

  const pdf = await lerArquivo(`${id}.pdf`);
  return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf" } });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run "src/app/api/comunique-se/[id]/pdf/__tests__/route.test.ts"`
Expected: PASS — 3 testes.

- [ ] **Step 5: Escrever os testes do toggle de item (vão falhar — a rota não existe)**

Crie `src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { PATCH } from "@/app/api/comunique-se/[id]/itens/route";

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(usuario);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarSessaoComChecklist() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  const itemId = "item-1";
  const [linha] = await db
    .insert(comuniqueSe)
    .values({
      projetoId: novoProjeto.id,
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: "/x",
      checklistJson: { itens: [{ id: itemId, descricao: "Apresentar ART", concluida: false }] },
    })
    .returning();
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, comuniqueSeId: linha.id, itemId };
}

async function criarSessaoAindaProcessando() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  const [linha] = await db
    .insert(comuniqueSe)
    .values({ projetoId: novoProjeto.id, numero: 1, status: "processando", pdfOriginalUrl: "/x" })
    .returning();
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, comuniqueSeId: linha.id };
}

function criarRequest(body: unknown, token?: string) {
  return new NextRequest("http://localhost/api/comunique-se/x/itens", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/comunique-se/[id]/itens", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await PATCH(criarRequest({ itemId: "x", concluida: true }), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(response.status).toBe(401);
  });

  it("rejeita corpo inválido com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoComChecklist();

    const response = await PATCH(criarRequest({}, token), { params: Promise.resolve({ id: comuniqueSeId }) });

    expect(response.status).toBe(400);
  });

  it("retorna 404 pra Comunique-se inexistente", async () => {
    const { token } = await criarSessaoComChecklist();

    const response = await PATCH(criarRequest({ itemId: "x", concluida: true }, token), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });

  it("rejeita alternar item de Comunique-se que ainda não está pronto com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoAindaProcessando();

    const response = await PATCH(criarRequest({ itemId: "qualquer", concluida: true }, token), {
      params: Promise.resolve({ id: comuniqueSeId }),
    });

    expect(response.status).toBe(400);
  });

  it("retorna 404 pra itemId inexistente no checklist", async () => {
    const { token, comuniqueSeId } = await criarSessaoComChecklist();

    const response = await PATCH(criarRequest({ itemId: "item-fantasma", concluida: true }, token), {
      params: Promise.resolve({ id: comuniqueSeId }),
    });

    expect(response.status).toBe(404);
  });

  it("alterna o item e retorna a lista atualizada com 200", async () => {
    const { token, comuniqueSeId, itemId } = await criarSessaoComChecklist();

    const response = await PATCH(criarRequest({ itemId, concluida: true }, token), {
      params: Promise.resolve({ id: comuniqueSeId }),
    });

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.itens).toEqual([{ id: itemId, descricao: "Apresentar ART", concluida: true }]);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npx vitest run "src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts"`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 7: Implementar a rota de toggle**

Crie `src/app/api/comunique-se/[id]/itens/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { atualizarItemChecklist, buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { alternarItemChecklistSchema } from "@/lib/validations/comunique-se/toggle-item.schema";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const parsed = alternarItemChecklistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const { id } = await params;
  const comuniqueSeEncontrado = await buscarComuniqueSeDaEmpresa(id, sessao.empresaId);
  if (!comuniqueSeEncontrado) {
    return NextResponse.json({ error: "Comunique-se não encontrado." }, { status: 404 });
  }
  if (comuniqueSeEncontrado.status !== "pronto") {
    return NextResponse.json({ error: "Esse Comunique-se ainda não está pronto." }, { status: 400 });
  }

  const itens = await atualizarItemChecklist(id, parsed.data.itemId, parsed.data.concluida);
  if (!itens) {
    return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ itens });
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run "src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts"`
Expected: PASS — 6 testes.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/comunique-se/[id]/pdf" "src/app/api/comunique-se/[id]/itens"
git commit -m "feat: add PDF download and checklist item toggle routes"
```

---

### Task 9: Hooks React Query

**Files:**
- Create: `src/hooks/use-comunique-ses.ts`
- Create: `src/hooks/use-criar-comunique-se.ts`
- Create: `src/hooks/use-retry-comunique-se.ts`
- Create: `src/hooks/use-alternar-item-checklist.ts`

**Interfaces:**
- Consumes: `PaginatedResponse` de `@/lib/pagination`, `ComuniqueSeResponse` de `@/lib/validations/comunique-se/response.schema` (Task 4), `CriarComuniqueSeInput` (Task 4), `ChecklistItem` de `@/db/queries/comunique-se` (Task 3, tipo só — sem importar código de servidor no client).
- Produces: `useComuniqueSes(dadosIniciais)`, `useCriarComuniqueSe()`, `useRetryComuniqueSe()`, `useAlternarItemChecklist()`. Tasks 10 e 11 usam esses hooks.

**Sem teste automatizado nesta task** — mesmo padrão já usado pros hooks equivalentes do memorial (`use-memoriais.ts`, `use-criar-memorial.ts`, `use-retry-memorial.ts`); cobertura vem da verificação manual (Task 12).

- [ ] **Step 1: `useComuniqueSes`**

Crie `src/hooks/use-comunique-ses.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import type { PaginatedResponse } from "@/lib/pagination";
import type { ComuniqueSeResponse } from "@/lib/validations/comunique-se/response.schema";

async function buscarComuniqueSes(): Promise<PaginatedResponse<ComuniqueSeResponse>> {
  const response = await fetch("/api/comunique-se");

  if (!response.ok) {
    throw new Error("Erro ao carregar Comunique-se.");
  }

  return response.json();
}

export function useComuniqueSes(dadosIniciais: PaginatedResponse<ComuniqueSeResponse>) {
  return useQuery({
    queryKey: ["comunique-se"],
    queryFn: buscarComuniqueSes,
    initialData: dadosIniciais,
  });
}
```

- [ ] **Step 2: `useCriarComuniqueSe`**

Crie `src/hooks/use-criar-comunique-se.ts`:

```ts
import { useMutation } from "@tanstack/react-query";

import type { CriarComuniqueSeInput } from "@/lib/validations/comunique-se/create.schema";

interface ComuniqueSeCriadoResponse {
  comuniqueSe: { id: string; numero: number; status: string; pdfOriginalUrl: string };
}

interface ApiErrorBody {
  error: string;
  fields?: Record<string, string[]>;
}

async function criarComuniqueSeRequest(input: CriarComuniqueSeInput): Promise<ComuniqueSeCriadoResponse> {
  const response = await fetch("/api/comunique-se", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as ComuniqueSeCriadoResponse | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return data as ComuniqueSeCriadoResponse;
}

export function useCriarComuniqueSe() {
  return useMutation({ mutationFn: criarComuniqueSeRequest });
}
```

- [ ] **Step 3: `useRetryComuniqueSe`**

Crie `src/hooks/use-retry-comunique-se.ts`:

```ts
import { useMutation } from "@tanstack/react-query";

interface RetryResponse {
  comuniqueSe: { id: string; numero: number; status: string; pdfOriginalUrl: string };
}

interface ApiErrorBody {
  error: string;
}

async function retryComuniqueSeRequest(id: string): Promise<RetryResponse> {
  const response = await fetch(`/api/comunique-se/${id}/retry`, { method: "POST" });
  const data = (await response.json()) as RetryResponse | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return data as RetryResponse;
}

export function useRetryComuniqueSe() {
  return useMutation({ mutationFn: retryComuniqueSeRequest });
}
```

- [ ] **Step 4: `useAlternarItemChecklist`**

Crie `src/hooks/use-alternar-item-checklist.ts`:

```ts
import { useMutation } from "@tanstack/react-query";

interface ChecklistItem {
  id: string;
  descricao: string;
  concluida: boolean;
}

interface ApiErrorBody {
  error: string;
}

async function alternarItemRequest(input: {
  comuniqueSeId: string;
  itemId: string;
  concluida: boolean;
}): Promise<ChecklistItem[]> {
  const response = await fetch(`/api/comunique-se/${input.comuniqueSeId}/itens`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: input.itemId, concluida: input.concluida }),
  });

  const data = (await response.json()) as { itens: ChecklistItem[] } | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return (data as { itens: ChecklistItem[] }).itens;
}

export function useAlternarItemChecklist() {
  return useMutation({ mutationFn: alternarItemRequest });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-comunique-ses.ts src/hooks/use-criar-comunique-se.ts src/hooks/use-retry-comunique-se.ts src/hooks/use-alternar-item-checklist.ts
git commit -m "feat: add comunique-se React Query hooks"
```

---

### Task 10: UI — lista + drawer de upload

**Files:**
- Modify: `src/app/dashboard/comunique-se/page.tsx` (reescrever — hoje é o placeholder "Em breve")
- Create: `src/app/dashboard/comunique-se/comunique-se-lista.tsx`
- Create: `src/app/dashboard/comunique-se/novo-comunique-se-drawer.tsx`
- Create: `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`

**Interfaces:**
- Consumes: `listarComuniqueSe` (Task 3), `listarProjetos`/`Projeto` de `@/db/queries/projeto` (já existe), `useComuniqueSes`/`useCriarComuniqueSe`/`useRetryComuniqueSe` (Task 9), `referenciaComuniqueSe` de `@/lib/referencia` (já existe), `ProjetoCombobox` de `@/components/common/projeto-combobox` (já existe), `LoadingSpinner` de `@/components/common/loading-spinner` (já existe).
- Produces: nada consumido por tasks futuras.

**Sem teste automatizado nesta task** (mesmo padrão do resto do projeto). Cobertura vem da verificação manual (Task 12) e dos testes já escritos nas Tasks 1-9.

- [ ] **Step 1: Formulário de upload**

Crie `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import type { Projeto } from "@/db/queries/projeto";
import { criarComuniqueSeSchema } from "@/lib/validations/comunique-se/create.schema";
import { useCriarComuniqueSe } from "@/hooks/use-criar-comunique-se";
import { ProjetoCombobox } from "@/components/common/projeto-combobox";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const TAMANHO_MAXIMO_PDF_BYTES = 10 * 1024 * 1024;

interface FormValues {
  projetoId: string;
}

interface NovoComuniqueSeFormProps {
  projetos: Projeto[];
  onSuccess: () => void;
}

function arrayBufferParaBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario);
}

export function NovoComuniqueSeForm({ projetos, onSuccess }: NovoComuniqueSeFormProps) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarComuniqueSe();
  const { handleSubmit, control } = useForm<FormValues>();
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  function handleArquivoSelecionado(event: React.ChangeEvent<HTMLInputElement>) {
    const selecionado = event.target.files?.[0] ?? null;
    setErro(null);

    if (!selecionado) {
      setArquivo(null);
      return;
    }
    if (selecionado.type !== "application/pdf") {
      setErro("Selecione um arquivo PDF.");
      setArquivo(null);
      return;
    }
    if (selecionado.size > TAMANHO_MAXIMO_PDF_BYTES) {
      setErro("O arquivo excede o tamanho máximo de 10MB.");
      setArquivo(null);
      return;
    }

    setArquivo(selecionado);
  }

  async function onSubmit(values: FormValues) {
    setErro(null);

    if (!arquivo) {
      setErro("Selecione um arquivo PDF.");
      return;
    }

    const pdfBase64 = arrayBufferParaBase64(await arquivo.arrayBuffer());
    const payload = { projetoId: values.projetoId, pdfBase64 };

    const parsed = criarComuniqueSeSchema.safeParse(payload);
    if (!parsed.success) {
      setErro("Preencha os campos obrigatórios corretamente.");
      return;
    }

    criar.mutate(parsed.data, {
      onSuccess: () => onSuccess(),
      onError: (error) => setErro(error.message),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="relative grid gap-6">
      {criar.isPending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/95">
          <LoadingSpinner label="Processando" />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="projetoId">Projeto</Label>
        <Controller
          control={control}
          name="projetoId"
          rules={{ required: "Selecione um projeto." }}
          render={({ field, fieldState }) => (
            <>
              <ProjetoCombobox projetos={projetos} value={field.value} onChange={field.onChange} />
              {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
            </>
          )}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="pdf">Arquivo do Comunique-se (PDF)</Label>
        <input
          ref={inputArquivoRef}
          id="pdf"
          type="file"
          accept="application/pdf"
          onChange={handleArquivoSelecionado}
          className="rounded-md border border-input p-2 text-sm"
        />
        {arquivo && <p className="text-xs text-muted-foreground">{arquivo.name}</p>}
      </div>

      {erro && <p className="text-destructive text-sm">{erro}</p>}
      <Button type="submit" disabled={criar.isPending}>
        {criar.isPending ? "Processando..." : "Enviar Comunique-se"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Drawer**

Crie `src/app/dashboard/comunique-se/novo-comunique-se-drawer.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { Projeto } from "@/db/queries/projeto";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { NovoComuniqueSeForm } from "./novo-comunique-se-form";

interface NovoComuniqueSeDrawerProps {
  projetos: Projeto[];
}

export function NovoComuniqueSeDrawer({ projetos }: NovoComuniqueSeDrawerProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  function handleSuccess() {
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["comunique-se"] });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button>Novo Comunique-se</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Novo Comunique-se</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <NovoComuniqueSeForm projetos={projetos} onSuccess={handleSuccess} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 3: Lista (client component)**

Crie `src/app/dashboard/comunique-se/comunique-se-lista.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { useComuniqueSes } from "@/hooks/use-comunique-ses";
import { useRetryComuniqueSe } from "@/hooks/use-retry-comunique-se";
import { referenciaComuniqueSe } from "@/lib/referencia";
import { cn } from "@/lib/utils";
import type { PaginatedResponse } from "@/lib/pagination";
import type { ComuniqueSeResponse } from "@/lib/validations/comunique-se/response.schema";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface ComuniqueSeListaProps {
  dadosIniciais: PaginatedResponse<ComuniqueSeResponse>;
}

export function ComuniqueSeLista({ dadosIniciais }: ComuniqueSeListaProps) {
  const { data } = useComuniqueSes(dadosIniciais);
  const retry = useRetryComuniqueSe();
  const queryClient = useQueryClient();
  const itens = data.data;

  if (itens.length === 0) {
    return <p className="text-muted-foreground">Nenhum Comunique-se ainda.</p>;
  }

  function handleRetry(id: string) {
    retry.mutate(id, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comunique-se"] }),
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {itens.map((item) => {
        const tentandoEsse = retry.isPending && retry.variables === item.id;
        return (
          <Card key={item.id}>
            <CardHeader>
              <span className="font-mono text-xs text-muted-foreground">{referenciaComuniqueSe(item.numero)}</span>
              <CardTitle>{item.projetoNome}</CardTitle>
              <CardDescription>
                {item.status === "pronto" ? (
                  <Link href={`/dashboard/comunique-se/${item.id}`} className="underline">
                    Ver checklist
                  </Link>
                ) : item.status === "erro" ? (
                  <span className="flex items-center gap-2">
                    Erro ao processar
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 px-2 text-xs"
                      disabled={tentandoEsse}
                      onClick={() => handleRetry(item.id)}
                    >
                      <RefreshCw className={cn("size-3", tentandoEsse && "animate-spin")} />
                      Tentar novamente
                    </Button>
                  </span>
                ) : (
                  "Processando..."
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Página da lista**

Substitua todo o conteúdo de `src/app/dashboard/comunique-se/page.tsx` por:

```tsx
import type { Metadata } from "next";

import { getSessionUser } from "@/lib/auth/session";
import { listarComuniqueSe } from "@/db/queries/comunique-se";
import { listarProjetos } from "@/db/queries/projeto";
import type { PaginatedResponse } from "@/lib/pagination";
import type { ComuniqueSeResponse } from "@/lib/validations/comunique-se/response.schema";
import { NovoComuniqueSeDrawer } from "./novo-comunique-se-drawer";
import { ComuniqueSeLista } from "./comunique-se-lista";

export const metadata: Metadata = {
  title: "Comunique-se",
};

export default async function ComuniqueSePage() {
  const sessao = await getSessionUser();
  const [lista, projetos] = sessao
    ? await Promise.all([listarComuniqueSe(sessao.empresaId), listarProjetos(sessao.empresaId)])
    : [[], []];

  const dadosIniciais: PaginatedResponse<ComuniqueSeResponse> = {
    data: lista.map((c) => ({
      id: c.id,
      numero: c.numero,
      projetoNome: c.projetoNome,
      status: c.status,
      pdfOriginalUrl: c.pdfOriginalUrl,
      createdAt: c.createdAt.toISOString(),
    })),
    page: 1,
    total: lista.length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Comunique-se</h1>
        <NovoComuniqueSeDrawer projetos={projetos} />
      </div>
      <ComuniqueSeLista dadosIniciais={dadosIniciais} />
    </div>
  );
}
```

- [ ] **Step 5: Rodar a suíte inteira e o build**

Run: `npm test`
Expected: PASS — todos os testes anteriores + os novos desta feature.

Run: `npm run build`
Expected: build passa, `/dashboard/comunique-se`, `/api/comunique-se`, `/api/comunique-se/[id]/retry`, `/api/comunique-se/[id]/pdf`, `/api/comunique-se/[id]/itens` aparecem na saída como rotas geradas.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/comunique-se
git commit -m "feat: add comunique-se list page and upload drawer"
```

---

### Task 11: UI — página de detalhe com checklist interativo

**Files:**
- Create: `src/app/dashboard/comunique-se/[id]/page.tsx`
- Create: `src/app/dashboard/comunique-se/[id]/checklist-itens.tsx`

**Interfaces:**
- Consumes: `buscarComuniqueSeDaEmpresa` (Task 3), `useAlternarItemChecklist` (Task 9), `referenciaComuniqueSe` (já existe), `useRetryComuniqueSe` (Task 9), `Checkbox` de `@/components/ui/checkbox` (já existe).
- Produces: nada consumido por tasks futuras.

**Sem teste automatizado nesta task** — mesmo padrão do resto da UI. Cobertura vem da verificação manual (Task 12).

- [ ] **Step 1: Lista de itens interativa (client component)**

Crie `src/app/dashboard/comunique-se/[id]/checklist-itens.tsx`:

```tsx
"use client";

import { useState } from "react";

import { useAlternarItemChecklist } from "@/hooks/use-alternar-item-checklist";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

interface ChecklistItem {
  id: string;
  descricao: string;
  concluida: boolean;
}

interface ChecklistItensProps {
  comuniqueSeId: string;
  itensIniciais: ChecklistItem[];
}

export function ChecklistItens({ comuniqueSeId, itensIniciais }: ChecklistItensProps) {
  const [itens, setItens] = useState(itensIniciais);
  const alternar = useAlternarItemChecklist();

  function handleToggle(itemId: string, concluida: boolean) {
    setItens((atual) => atual.map((item) => (item.id === itemId ? { ...item, concluida } : item)));

    alternar.mutate(
      { comuniqueSeId, itemId, concluida },
      {
        onError: () => {
          setItens((atual) => atual.map((item) => (item.id === itemId ? { ...item, concluida: !concluida } : item)));
        },
      },
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {itens.map((item) => (
        <li key={item.id} className="flex items-start gap-3">
          <Checkbox
            checked={item.concluida}
            onCheckedChange={(valor) => handleToggle(item.id, valor === true)}
          />
          <span className={cn("text-sm", item.concluida && "text-muted-foreground line-through")}>
            {item.descricao}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Página de detalhe**

Crie `src/app/dashboard/comunique-se/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getSessionUser } from "@/lib/auth/session";
import { buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { referenciaComuniqueSe } from "@/lib/referencia";
import { ChecklistItens } from "./checklist-itens";

export const metadata: Metadata = {
  title: "Comunique-se",
};

export default async function ComuniqueSeDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await getSessionUser();
  const comuniqueSeEncontrado = sessao ? await buscarComuniqueSeDaEmpresa(id, sessao.empresaId) : null;

  if (!comuniqueSeEncontrado) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <span className="font-mono text-xs text-muted-foreground">
          {referenciaComuniqueSe(comuniqueSeEncontrado.numero)}
        </span>
        <h1 className="text-2xl font-semibold">Checklist do Comunique-se</h1>
        <a href={comuniqueSeEncontrado.pdfOriginalUrl} className="text-sm underline">
          Baixar PDF original
        </a>
      </div>

      {comuniqueSeEncontrado.status === "processando" && (
        <p className="text-muted-foreground">Processando o Comunique-se...</p>
      )}
      {comuniqueSeEncontrado.status === "erro" && (
        <p className="text-destructive">
          Não foi possível processar esse Comunique-se. Volte pra lista e tente novamente.
        </p>
      )}
      {comuniqueSeEncontrado.status === "pronto" && comuniqueSeEncontrado.checklistJson && (
        <ChecklistItens
          comuniqueSeId={comuniqueSeEncontrado.id}
          itensIniciais={comuniqueSeEncontrado.checklistJson.itens}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rodar a suíte inteira e o build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: build passa, `/dashboard/comunique-se/[id]` aparece na saída como rota gerada.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/comunique-se/[id]"
git commit -m "feat: add comunique-se detail page with interactive checklist"
```

---

### Task 12: Verificação manual do fluxo completo

**Files:** nenhum (task de verificação — só um commit final se algo precisar de ajuste).

**Interfaces:** nenhuma — consome tudo das Tasks 1-11.

- [ ] **Step 1: Build e suíte completos**

Run: `npm run build`
Expected: sucesso.

Run: `npm test`
Expected: 100% dos testes passando.

- [ ] **Step 2: Verificar o fluxo via navegador (Playwright ou real)**

Suba o dev server numa porta alternativa. Com um usuário/projeto já existentes (ou crie novos), usando um PDF de teste qualquer com texto real (pode ser um PDF simples exportado de um editor de texto):

1. Acesse `/dashboard/comunique-se`. Confirme: lista vazia com CTA "Novo Comunique-se" (se for a primeira vez).
2. Clique "Novo Comunique-se". Confirme: drawer abre com o combobox de projeto e o input de arquivo.
3. Selecione um projeto e um PDF com texto real. Submeta. Confirme: botão mostra "Processando...", e depois de um tempo (chamada real de LLM) o drawer fecha e a lista mostra o novo item com status "pronto" e link "Ver checklist".
4. Clique em "Ver checklist". Confirme: página de detalhe mostra a referência (`CS-0001`), o link "Baixar PDF original" (baixa o mesmo arquivo enviado) e a lista de itens do checklist.
5. Marque um item como concluído. Recarregue a página. Confirme: o item continua marcado (persistiu no banco).
6. Tente submeter o formulário sem selecionar arquivo, ou com um arquivo que não é PDF (ex.: renomeie um `.txt` pra forçar o erro, ou tente um `.jpg`). Confirme: mensagem de erro aparece, nada é criado.
7. Tente um PDF maior que 10MB (se tiver um à mão) ou confirme via teste automatizado já escrito (Task 6) que esse caso está coberto.

- [ ] **Step 3: Verificar o retry manual**

Force uma falha temporária (ex.: comente `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` do `.env` momentaneamente, ou aponte pra uma chave inválida, reinicie o dev server) e suba um novo Comunique-se. Confirme: a lista mostra "Erro ao processar" com botão "Tentar novamente". Restaure as chaves, clique "Tentar novamente". Confirme: status muda pra "pronto" sem precisar re-upload do PDF.

- [ ] **Step 4: Parar o dev server**

Confirme que o processo foi encerrado.

- [ ] **Step 5: Commit final, só se algo precisou de ajuste**

```bash
git add -A
git commit -m "fix: <descrição específica do que a verificação manual encontrou>"
```

Se tudo passou de primeira, esta task não gera commit.
