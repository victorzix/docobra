# Comunique-se: Checklist Editável, Criação Manual e Modelo Exportável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Checklist do Comunique-se totalmente editável (adicionar/editar/remover item), um segundo jeito de criar (digitando, sem PDF/IA), e um formato próprio exportável (PDF com `.json` anexado via `pdf-lib`) que o sistema também reimporta com detecção automática no mesmo campo de upload.

**Architecture:** Duas funções novas em `src/lib/comunique-se/` (`detectarModeloEmbutido`, `gerarModeloExportado`) se encaixam no pipeline e numa rota de export já existentes. A rota `POST /api/comunique-se` ganha um discriminador `modoCriacao` (mesmo padrão do `modoEspecificacoes` do Memorial). O `checklistJson` ganha três novos endpoints de mutação (adicionar, editar-texto, remover) ao lado do toggle que já existe, todos read-modify-write sobre a mesma coluna jsonb.

**Tech Stack:** Next.js App Router, Drizzle, Zod, React Query, `pdf-lib` (novo, já instalado e verificado nesta sessão), Puppeteer (já usado).

## Global Constraints

- **Migração de schema**: `pdfOriginalUrl` em `comunique_se` passa de `NOT NULL` pra nullable. Este projeto **não usa migrations versionadas** (não existe pasta `drizzle/` no repo) — aplica-se a mudança com `npm run db:push`, direto contra `DATABASE_URL` (dev) e contra o banco apontado por `.env.test` (`docobra-local-test`) antes de rodar os testes.
- **`pdf-lib` já verificado nesta sessão**: `doc.attach(buffer, nome, opções)` funciona pela API pública. **Reler o anexo não tem API de alto nível na versão instalada** (`pdf-lib@1.17.1` não tem `getAttachments()`) — precisa navegar manualmente `catalog.lookupMaybe(PDFName.of("Names"), PDFDict)` → `.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict)` → `.lookupMaybe(PDFName.of("Names"), PDFArray)` (um `PDFArray` intercalando nome/referência) → resolver a referência do `FileSpec` (`PDFDict`) → `.lookup(PDFName.of("EF"), PDFDict)` → `.get(PDFName.of("F"))` → resolver o stream via `.lookup(ref, PDFStream)` e fazer cast pra `PDFRawStream` → `decodePDFRawStream(stream).decode()`. **O nome do arquivo no array vem como `PDFHexString`, não `PDFString`** — usar `.decodeText()` (existe nos dois tipos, cast pra `PDFString | PDFHexString` antes de chamar), nunca `instanceof PDFString`. **`tsc --noEmit` exige as chamadas `.lookup`/`.lookupMaybe` com o segundo argumento de tipo** (`PDFDict`/`PDFArray`/`PDFStream`) — sem isso, `lookup()` sem tipo devolve `PDFObject` genérico, sem `.asArray()`/incompatível com `decodePDFRawStream` (confirmado batendo em dois lugares nesta mesma sessão: o teste da Task 2 e o código de produção da Task 3, ambos já corrigidos abaixo). Round-trip completo (anexar → salvar → recarregar → reler, e também "PDF sem anexo retorna `null` sem lançar") foi confirmado batendo byte-a-byte nesta sessão — o código das Tasks 2 e 3 abaixo já reflete esse mecanismo verificado, incluindo a tipagem correta.
- **Puppeteer e `pdf-parse` já verificados** (specs anteriores) — sem necessidade de reverificar.
- **Storage de teste já isolado**: `.env.test` já tem `COMUNIQUE_SE_STORAGE_DIR="storage/comunique-se-test"` — nenhuma mudança necessária ali.
- **Mudança de assinatura que quebra chamadores existentes**: `atualizarItemChecklist(id, itemId, concluida: boolean)` na query layer vira `atualizarItemChecklist(id, itemId, patch: { concluida?: boolean; descricao?: string })`. Toda task que toca essa função precisa atualizar os dois testes existentes em `src/db/queries/__tests__/comunique-se.test.ts` (`atualizarItemChecklist` describe block) que chamam com o terceiro argumento posicional `true`.
- **Mudança de payload que quebra testes existentes da rota**: `POST /api/comunique-se` ganha `modoCriacao: "pdf" | "manual"` obrigatório — todo teste existente em `src/app/api/comunique-se/__tests__/route.test.ts` que hoje manda `{ projetoId, pdfBase64 }` sem esse campo precisa ganhar `modoCriacao: "pdf"` nesse payload, senão passa a falhar na validação Zod.
- Todo teste que chama `comuniqueSeRouter` usa mock — nenhuma chamada real de API de LLM. Puppeteer, `pdf-lib`, banco e storage em disco são reais nos testes (mesma filosofia já usada no resto do projeto).
- Sem teste de UI (mesmo padrão do projeto, sem RTL/jsdom); cobertura por testes de integração + verificação manual (Task 13).

---

### Task 1: Migração de schema (`pdfOriginalUrl` nullable) + tipos atualizados

**Files:**
- Modify: `src/db/schema/comunique-se.ts`
- Modify: `src/db/queries/comunique-se.ts` (interface `ComuniqueSe`)
- Modify: `src/lib/validations/comunique-se/response.schema.ts`
- Test: `src/db/queries/__tests__/comunique-se.test.ts` (adiciona um teste, não modifica os existentes)

**Interfaces:**
- Consumes: nada de tasks anteriores (é a base).
- Produces: `ComuniqueSe.pdfOriginalUrl: string | null`. Tasks 4, 6, 7, 8, 9, 11, 12 dependem desse tipo.

- [ ] **Step 1: Alterar o schema Drizzle**

Em `src/db/schema/comunique-se.ts`, troque:

```ts
  pdfOriginalUrl: varchar("pdf_original_url", { length: 512 }).notNull(),
```

por:

```ts
  pdfOriginalUrl: varchar("pdf_original_url", { length: 512 }),
```

- [ ] **Step 2: Aplicar a mudança nos bancos de dev e teste**

Run: `npm run db:push`
Expected: aceita a mudança (relaxar `NOT NULL` pra nullable não perde dados, deve aplicar sem prompt de confirmação destrutiva).

Depois, aponte `DATABASE_URL` pro banco de teste e repita — ou, se preferir, exporte a variável só pro comando:

Run (Windows/Git Bash): `DATABASE_URL="postgresql://postgres:admin@127.0.0.1:5432/docobra-local-test?schema=public" npx drizzle-kit push`
Expected: mesmo resultado, aplicado no banco que os testes usam.

- [ ] **Step 3: Escrever o teste (vai falhar — o tipo ainda não aceita null)**

Em `src/db/queries/__tests__/comunique-se.test.ts`, adicione (junto do describe `criarComuniqueSeProcessando` já existente, sem remover nada):

```ts
describe("pdfOriginalUrl nullable", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("aceita inserir um Comunique-se sem pdfOriginalUrl (null)", async () => {
    const { projeto: novoProjeto } = await criarProjetoDeTeste();

    const [criado] = await db
      .insert(comuniqueSe)
      .values({ projetoId: novoProjeto.id, numero: 1, status: "pronto", pdfOriginalUrl: null })
      .returning();

    expect(criado.pdfOriginalUrl).toBeNull();
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/db/queries/__tests__/comunique-se.test.ts`
Expected: PASS — todos os testes existentes + esse novo (11 no total).

Se falhar com erro de constraint `NOT NULL`, o `db:push` do Step 2 não foi aplicado no banco de teste — repita apontando pro `DATABASE_URL` correto.

- [ ] **Step 5: Atualizar o tipo `ComuniqueSe` e o schema de resposta**

Em `src/db/queries/comunique-se.ts`, na interface `ComuniqueSe`, troque:

```ts
  pdfOriginalUrl: string;
```

por:

```ts
  pdfOriginalUrl: string | null;
```

Em `src/lib/validations/comunique-se/response.schema.ts`, troque:

```ts
  pdfOriginalUrl: z.string(),
```

por:

```ts
  pdfOriginalUrl: z.string().nullable(),
```

- [ ] **Step 6: Rodar o type-check e a suíte inteira**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 3 erros pré-existentes, todos em call-sites que hoje assumem `pdfOriginalUrl` não-nulo e que esta task não toca de propósito: `src/app/dashboard/comunique-se/[id]/page.tsx` (deferido pra Task 12), `src/app/api/comunique-se/[id]/retry/route.ts` e o teste `reprocessarComuniqueSe` em `src/lib/comunique-se/__tests__/processar.test.ts` (os dois últimos resolvidos na Task 6, que já widening a assinatura de `reprocessarComuniqueSe`). Nenhum erro novo além desses três.

Run: `npx vitest run`
Expected: PASS — nenhuma outra suíte deveria ter quebrado com essa mudança de tipo (mudar de `string` pra `string | null` é um afrouxamento, não uma restrição nova).

- [ ] **Step 7: Commit**

```bash
git add src/db/schema/comunique-se.ts src/db/queries/comunique-se.ts src/lib/validations/comunique-se/response.schema.ts src/db/queries/__tests__/comunique-se.test.ts
git commit -m "feat: make comunique_se.pdf_original_url nullable"
```

---

### Task 2: Schema do modelo exportado + geração (HTML + PDF com anexo)

**Files:**
- Create: `src/lib/validations/comunique-se/modelo-exportado.schema.ts`
- Create: `src/lib/comunique-se/modelo-html-template.ts`
- Create: `src/lib/comunique-se/modelo-exportar.ts`
- Test: `src/lib/comunique-se/__tests__/modelo-html-template.test.ts`
- Test: `src/lib/comunique-se/__tests__/modelo-exportar.test.ts`

**Interfaces:**
- Consumes: `gerarPdf` de `@/lib/memorial/pdf` (já existe, `(html: string) => Promise<Buffer>`), `ChecklistItem` de `@/db/queries/comunique-se` (Task 1, tipo `{ id: string; descricao: string; concluida: boolean }`).
- Produces: `export const FORMATO_MODELO_EXPORTADO = "docobra-comunique-se-v1"`, `export const NOME_ARQUIVO_MODELO_EXPORTADO = "docobra-checklist.json"`, `export const modeloExportadoSchema` (Zod), `export type ModeloExportado` — todos de `modelo-exportado.schema.ts`. `export function gerarHtmlModelo(dados: { referencia: string; projetoNome: string; itens: { descricao: string; concluida: boolean }[] }): string` de `modelo-html-template.ts`. `export async function gerarModeloExportado(dados: { referencia: string; projetoNome: string; itens: ChecklistItem[] }): Promise<Buffer>` de `modelo-exportar.ts`. Task 3 usa as constantes/schema; Task 9 usa `gerarModeloExportado`.

- [ ] **Step 1: Schema e constantes do modelo exportado**

Crie `src/lib/validations/comunique-se/modelo-exportado.schema.ts`:

```ts
import { z } from "zod";

export const FORMATO_MODELO_EXPORTADO = "docobra-comunique-se-v1";
export const NOME_ARQUIVO_MODELO_EXPORTADO = "docobra-checklist.json";

export const modeloExportadoSchema = z.object({
  formato: z.literal(FORMATO_MODELO_EXPORTADO),
  itens: z.array(z.object({ descricao: z.string(), concluida: z.boolean() })),
});

export type ModeloExportado = z.infer<typeof modeloExportadoSchema>;
```

Sem teste dedicado pra esse arquivo — é um schema puro, coberto indiretamente pelos testes das Tasks 2 e 3 que o usam.

- [ ] **Step 2: Escrever o teste do template HTML (vai falhar — o módulo não existe)**

Crie `src/lib/comunique-se/__tests__/modelo-html-template.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { gerarHtmlModelo } from "../modelo-html-template";

describe("gerarHtmlModelo", () => {
  it("inclui referência, projeto e os itens do checklist", () => {
    const html = gerarHtmlModelo({
      referencia: "CS-0001",
      projetoNome: "Casa da Praia",
      itens: [
        { descricao: "Apresentar ART", concluida: true },
        { descricao: "Apresentar laudo de sondagem", concluida: false },
      ],
    });

    expect(html).toContain("CS-0001");
    expect(html).toContain("Casa da Praia");
    expect(html).toContain("Apresentar ART");
    expect(html).toContain("Apresentar laudo de sondagem");
  });

  it("escapa caracteres HTML na descrição dos itens", () => {
    const html = gerarHtmlModelo({
      referencia: "CS-0001",
      projetoNome: "Casa",
      itens: [{ descricao: "Texto com <script>alert(1)</script>", concluida: false }],
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/comunique-se/__tests__/modelo-html-template.test.ts`
Expected: FAIL — `Cannot find module '../modelo-html-template'`.

- [ ] **Step 4: Implementar o template HTML**

Crie `src/lib/comunique-se/modelo-html-template.ts`:

```ts
export interface DadosModeloHtml {
  referencia: string;
  projetoNome: string;
  itens: { descricao: string; concluida: boolean }[];
}

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function gerarHtmlModelo(dados: DadosModeloHtml): string {
  const itensHtml = dados.itens
    .map((item) => `<li class="${item.concluida ? "concluida" : ""}">${escapeHtml(item.descricao)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; font-size: 12pt; }
      h1 { font-size: 16pt; }
      dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25em 1em; margin-bottom: 1.5em; }
      dt { font-weight: bold; }
      ul { padding-left: 1.2em; }
      li { margin-bottom: 0.5em; }
      li.concluida { text-decoration: line-through; color: #666; }
    </style>
  </head>
  <body>
    <h1>Checklist do Comunique-se</h1>
    <dl>
      <dt>Referência</dt><dd>${escapeHtml(dados.referencia)}</dd>
      <dt>Projeto</dt><dd>${escapeHtml(dados.projetoNome)}</dd>
    </dl>
    <ul>${itensHtml}</ul>
  </body>
</html>`;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/comunique-se/__tests__/modelo-html-template.test.ts`
Expected: PASS — 2 testes.

- [ ] **Step 6: Escrever o teste de geração do PDF com anexo (vai falhar — o módulo não existe)**

Crie `src/lib/comunique-se/__tests__/modelo-exportar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFStream,
  PDFString,
  PDFHexString,
  decodePDFRawStream,
  type PDFRawStream,
} from "pdf-lib";

import { gerarModeloExportado } from "../modelo-exportar";
import { FORMATO_MODELO_EXPORTADO, NOME_ARQUIVO_MODELO_EXPORTADO } from "@/lib/validations/comunique-se/modelo-exportado.schema";

async function lerAnexoDoPdf(pdfBuffer: Buffer): Promise<string | null> {
  const doc = await PDFDocument.load(pdfBuffer);
  const namesDict = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  if (!namesDict) return null;
  const efDict = namesDict.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  if (!efDict) return null;
  const namesArray = efDict.lookupMaybe(PDFName.of("Names"), PDFArray);
  if (!namesArray) return null;

  const arr = namesArray.asArray();
  for (let i = 0; i < arr.length; i += 2) {
    const nome = arr[i] as PDFString | PDFHexString;
    if (nome.decodeText() !== NOME_ARQUIVO_MODELO_EXPORTADO) continue;
    const fileSpec = doc.context.lookup(arr[i + 1], PDFDict);
    const efFileDict = fileSpec.lookup(PDFName.of("EF"), PDFDict);
    const stream = doc.context.lookup(efFileDict.get(PDFName.of("F")), PDFStream) as PDFRawStream;
    return Buffer.from(decodePDFRawStream(stream).decode()).toString("utf8");
  }
  return null;
}

describe("gerarModeloExportado", () => {
  it("gera um PDF válido com o checklist anexado dentro", async () => {
    const pdfBuffer = await gerarModeloExportado({
      referencia: "CS-0001",
      projetoNome: "Casa da Praia",
      itens: [
        { id: "1", descricao: "Apresentar ART", concluida: true },
        { id: "2", descricao: "Apresentar laudo de sondagem", concluida: false },
      ],
    });

    expect(pdfBuffer.subarray(0, 5).toString()).toBe("%PDF-");

    const anexo = await lerAnexoDoPdf(pdfBuffer);
    expect(anexo).not.toBeNull();

    const conteudo = JSON.parse(anexo!);
    expect(conteudo).toEqual({
      formato: FORMATO_MODELO_EXPORTADO,
      itens: [
        { descricao: "Apresentar ART", concluida: true },
        { descricao: "Apresentar laudo de sondagem", concluida: false },
      ],
    });
  });
});
```

- [ ] **Step 7: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/comunique-se/__tests__/modelo-exportar.test.ts`
Expected: FAIL — `Cannot find module '../modelo-exportar'`.

- [ ] **Step 8: Implementar `gerarModeloExportado`**

Crie `src/lib/comunique-se/modelo-exportar.ts`:

```ts
import { PDFDocument } from "pdf-lib";

import { gerarPdf } from "@/lib/memorial/pdf";
import type { ChecklistItem } from "@/db/queries/comunique-se";
import {
  FORMATO_MODELO_EXPORTADO,
  NOME_ARQUIVO_MODELO_EXPORTADO,
} from "@/lib/validations/comunique-se/modelo-exportado.schema";
import { gerarHtmlModelo } from "./modelo-html-template";

export async function gerarModeloExportado(dados: {
  referencia: string;
  projetoNome: string;
  itens: ChecklistItem[];
}): Promise<Buffer> {
  const html = gerarHtmlModelo({
    referencia: dados.referencia,
    projetoNome: dados.projetoNome,
    itens: dados.itens.map((item) => ({ descricao: item.descricao, concluida: item.concluida })),
  });

  const pdfBase = await gerarPdf(html);

  const payload = JSON.stringify({
    formato: FORMATO_MODELO_EXPORTADO,
    itens: dados.itens.map((item) => ({ descricao: item.descricao, concluida: item.concluida })),
  });

  const doc = await PDFDocument.load(pdfBase);
  await doc.attach(Buffer.from(payload, "utf8"), NOME_ARQUIVO_MODELO_EXPORTADO, {
    mimeType: "application/json",
    description: "Checklist estruturado do DocObra",
  });
  const bytesComAnexo = await doc.save();

  return Buffer.from(bytesComAnexo);
}
```

- [ ] **Step 9: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/comunique-se/__tests__/modelo-exportar.test.ts`
Expected: PASS — 1 teste (usa Puppeteer real internamente, pode levar alguns segundos).

- [ ] **Step 10: Commit**

```bash
git add src/lib/validations/comunique-se/modelo-exportado.schema.ts src/lib/comunique-se/modelo-html-template.ts src/lib/comunique-se/modelo-exportar.ts src/lib/comunique-se/__tests__/modelo-html-template.test.ts src/lib/comunique-se/__tests__/modelo-exportar.test.ts
git commit -m "feat: add DocObra native checklist model generation (PDF + embedded JSON)"
```

---

### Task 3: Detecção do modelo embutido

**Files:**
- Create: `src/lib/comunique-se/modelo-detectar.ts`
- Test: `src/lib/comunique-se/__tests__/modelo-detectar.test.ts`

**Interfaces:**
- Consumes: `modeloExportadoSchema`, `NOME_ARQUIVO_MODELO_EXPORTADO`, `FORMATO_MODELO_EXPORTADO` de `@/lib/validations/comunique-se/modelo-exportado.schema` (Task 2).
- Produces: `export async function detectarModeloEmbutido(pdfBuffer: Buffer): Promise<{ descricao: string; concluida: boolean }[] | null>` — nunca lança, retorna `null` em qualquer caso de "não é um modelo DocObra". Task 6 usa esta função.

- [ ] **Step 1: Escrever os testes (vão falhar — o módulo não existe)**

Crie `src/lib/comunique-se/__tests__/modelo-detectar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";

import { detectarModeloEmbutido } from "../modelo-detectar";
import { FORMATO_MODELO_EXPORTADO, NOME_ARQUIVO_MODELO_EXPORTADO } from "@/lib/validations/comunique-se/modelo-exportado.schema";

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

async function anexarPayload(pdfBuffer: Buffer, payload: string): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBuffer);
  await doc.attach(Buffer.from(payload, "utf8"), NOME_ARQUIVO_MODELO_EXPORTADO, { mimeType: "application/json" });
  return Buffer.from(await doc.save());
}

describe("detectarModeloEmbutido", () => {
  it("retorna os itens quando o PDF tem um anexo válido do DocObra", async () => {
    const pdfBase = await gerarPdfDeTeste("<h1>Checklist</h1>");
    const payload = JSON.stringify({
      formato: FORMATO_MODELO_EXPORTADO,
      itens: [{ descricao: "Apresentar ART", concluida: true }],
    });
    const pdfComAnexo = await anexarPayload(pdfBase, payload);

    const resultado = await detectarModeloEmbutido(pdfComAnexo);

    expect(resultado).toEqual([{ descricao: "Apresentar ART", concluida: true }]);
  });

  it("retorna null quando o PDF não tem anexo nenhum", async () => {
    const pdfSemAnexo = await gerarPdfDeTeste("<h1>PDF qualquer, sem anexo</h1>");

    const resultado = await detectarModeloEmbutido(pdfSemAnexo);

    expect(resultado).toBeNull();
  });

  it("retorna null quando o anexo existe mas o conteúdo não bate com o schema esperado", async () => {
    const pdfBase = await gerarPdfDeTeste("<h1>Checklist</h1>");
    const pdfComAnexoInvalido = await anexarPayload(pdfBase, JSON.stringify({ qualquerCoisa: true }));

    const resultado = await detectarModeloEmbutido(pdfComAnexoInvalido);

    expect(resultado).toBeNull();
  });

  it("retorna null quando o anexo não é JSON válido", async () => {
    const pdfBase = await gerarPdfDeTeste("<h1>Checklist</h1>");
    const pdfComAnexoQuebrado = await anexarPayload(pdfBase, "isso não é json{{{");

    const resultado = await detectarModeloEmbutido(pdfComAnexoQuebrado);

    expect(resultado).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/comunique-se/__tests__/modelo-detectar.test.ts`
Expected: FAIL — `Cannot find module '../modelo-detectar'`.

- [ ] **Step 3: Implementar `detectarModeloEmbutido`**

Crie `src/lib/comunique-se/modelo-detectar.ts`:

```ts
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFStream,
  PDFString,
  PDFHexString,
  decodePDFRawStream,
  type PDFRawStream,
} from "pdf-lib";

import { modeloExportadoSchema, NOME_ARQUIVO_MODELO_EXPORTADO } from "@/lib/validations/comunique-se/modelo-exportado.schema";

export async function detectarModeloEmbutido(
  pdfBuffer: Buffer,
): Promise<{ descricao: string; concluida: boolean }[] | null> {
  try {
    const doc = await PDFDocument.load(pdfBuffer);

    const namesDict = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
    if (!namesDict) return null;

    const efDict = namesDict.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
    if (!efDict) return null;

    const namesArray = efDict.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (!namesArray) return null;

    const arr = namesArray.asArray();
    for (let i = 0; i < arr.length; i += 2) {
      const nome = arr[i] as PDFString | PDFHexString;
      if (nome.decodeText() !== NOME_ARQUIVO_MODELO_EXPORTADO) continue;

      const fileSpec = doc.context.lookup(arr[i + 1], PDFDict);
      const efFileDict = fileSpec.lookup(PDFName.of("EF"), PDFDict);
      const stream = doc.context.lookup(efFileDict.get(PDFName.of("F")), PDFStream) as PDFRawStream;
      const conteudo = Buffer.from(decodePDFRawStream(stream).decode()).toString("utf8");

      const json = JSON.parse(conteudo);
      const parsed = modeloExportadoSchema.safeParse(json);
      if (!parsed.success) return null;

      return parsed.data.itens;
    }

    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/comunique-se/__tests__/modelo-detectar.test.ts`
Expected: PASS — 4 testes (usa Puppeteer real internamente, pode levar alguns segundos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/comunique-se/modelo-detectar.ts src/lib/comunique-se/__tests__/modelo-detectar.test.ts
git commit -m "feat: add embedded DocObra model detection in uploaded PDFs"
```

---

### Task 4: Query layer — criação manual e edição completa do checklist

**Files:**
- Modify: `src/db/queries/comunique-se.ts`
- Modify: `src/db/queries/__tests__/comunique-se.test.ts`

**Interfaces:**
- Consumes: nada novo (usa `db`, `comuniqueSe`, `proximoNumero` já importados no arquivo).
- Produces: `export async function criarComuniqueSePronto(input: { id: string; projetoId: string; empresaId: string; itens: ChecklistItem[] }): Promise<ComuniqueSe>`, `export async function atualizarItemChecklist(id: string, itemId: string, patch: { concluida?: boolean; descricao?: string }): Promise<ChecklistItem[] | null>` (assinatura alterada — era `(id, itemId, concluida: boolean)`), `export async function adicionarItemChecklist(id: string, descricao: string): Promise<ChecklistItem[] | null>`, `export async function removerItemChecklist(id: string, itemId: string): Promise<ChecklistItem[] | null>`. Tasks 6 e 8 usam essas quatro funções.

- [ ] **Step 1: Atualizar os dois testes existentes de `atualizarItemChecklist` (nova assinatura)**

Em `src/db/queries/__tests__/comunique-se.test.ts`, no describe `atualizarItemChecklist`, troque as duas chamadas posicionais:

```ts
    const resultado = await atualizarItemChecklist(id, itemId, true);
```

por:

```ts
    const resultado = await atualizarItemChecklist(id, itemId, { concluida: true });
```

e:

```ts
    const resultado = await atualizarItemChecklist(id, "item-inexistente", true);
```

por:

```ts
    const resultado = await atualizarItemChecklist(id, "item-inexistente", { concluida: true });
```

e:

```ts
    const resultado = await atualizarItemChecklist(id, "qualquer-id", true);
```

por:

```ts
    const resultado = await atualizarItemChecklist(id, "qualquer-id", { concluida: true });
```

- [ ] **Step 2: Escrever os novos testes (vão falhar — as funções não existem ainda)**

No mesmo arquivo, adicione (depois do describe `atualizarItemChecklist` existente, sem remover nada):

```ts
describe("atualizarItemChecklist com descricao", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("edita só o texto, mantendo concluida como estava", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    const itemId = randomUUID();
    await marcarComoPronto(id, [{ id: itemId, descricao: "Texto original", concluida: true }]);

    const resultado = await atualizarItemChecklist(id, itemId, { descricao: "Texto corrigido" });

    expect(resultado).toEqual([{ id: itemId, descricao: "Texto corrigido", concluida: true }]);
  });
});

describe("adicionarItemChecklist", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("adiciona um item novo no fim da lista", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    await marcarComoPronto(id, [{ id: randomUUID(), descricao: "Item 1", concluida: false }]);

    const resultado = await adicionarItemChecklist(id, "Item 2");

    expect(resultado).toHaveLength(2);
    expect(resultado?.[1].descricao).toBe("Item 2");
    expect(resultado?.[1].concluida).toBe(false);
  });

  it("retorna null quando o Comunique-se ainda não tem checklist", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });

    const resultado = await adicionarItemChecklist(id, "Item novo");

    expect(resultado).toBeNull();
  });
});

describe("removerItemChecklist", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("remove o item pedido e mantém o resto", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    const itemId1 = randomUUID();
    const itemId2 = randomUUID();
    await marcarComoPronto(id, [
      { id: itemId1, descricao: "Item 1", concluida: false },
      { id: itemId2, descricao: "Item 2", concluida: false },
    ]);

    const resultado = await removerItemChecklist(id, itemId1);

    expect(resultado).toEqual([{ id: itemId2, descricao: "Item 2", concluida: false }]);
  });

  it("permite esvaziar a lista removendo o último item", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    const itemId = randomUUID();
    await marcarComoPronto(id, [{ id: itemId, descricao: "Único item", concluida: false }]);

    const resultado = await removerItemChecklist(id, itemId);

    expect(resultado).toEqual([]);
  });

  it("retorna null quando o itemId não existe", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    await marcarComoPronto(id, [{ id: randomUUID(), descricao: "Item 1", concluida: false }]);

    const resultado = await removerItemChecklist(id, "item-inexistente");

    expect(resultado).toBeNull();
  });
});

describe("criarComuniqueSePronto", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria já com status pronto, sem pdfOriginalUrl e com os itens informados", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    const itens = [{ id: randomUUID(), descricao: "Apresentar ART", concluida: false }];

    const resultado = await criarComuniqueSePronto({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, itens });

    expect(resultado.id).toBe(id);
    expect(resultado.status).toBe("pronto");
    expect(resultado.pdfOriginalUrl).toBeNull();
    expect(resultado.checklistJson?.itens).toEqual(itens);
  });
});
```

Note: o `import` no topo do arquivo precisa ganhar `adicionarItemChecklist`, `removerItemChecklist` e `criarComuniqueSePronto` junto dos que já estavam lá — não crie um segundo bloco de import.

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/db/queries/__tests__/comunique-se.test.ts`
Expected: FAIL — `atualizarItemChecklist` com os testes antigos passando argumento posicional agora quebram tipo/comportamento, e `adicionarItemChecklist`/`removerItemChecklist`/`criarComuniqueSePronto` não existem.

- [ ] **Step 4: Implementar as mudanças em `comunique-se.ts`**

Em `src/db/queries/comunique-se.ts`, adicione `randomUUID` ao import do topo:

```ts
import { randomUUID } from "node:crypto";
```

Troque a função `atualizarItemChecklist` inteira por:

```ts
export async function atualizarItemChecklist(
  id: string,
  itemId: string,
  patch: { concluida?: boolean; descricao?: string },
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

  const itensAtualizados = atual.itens.map((item, i) => (i === indice ? { ...item, ...patch } : item));

  await db
    .update(comuniqueSe)
    .set({ checklistJson: { itens: itensAtualizados }, updatedAt: new Date() })
    .where(eq(comuniqueSe.id, id));

  return itensAtualizados;
}

export async function adicionarItemChecklist(id: string, descricao: string): Promise<ChecklistItem[] | null> {
  const [linha] = await db
    .select({ checklistJson: comuniqueSe.checklistJson })
    .from(comuniqueSe)
    .where(eq(comuniqueSe.id, id))
    .limit(1);

  const atual = linha?.checklistJson as ChecklistJson | null | undefined;
  if (!atual) return null;

  const itensAtualizados = [...atual.itens, { id: randomUUID(), descricao, concluida: false }];

  await db
    .update(comuniqueSe)
    .set({ checklistJson: { itens: itensAtualizados }, updatedAt: new Date() })
    .where(eq(comuniqueSe.id, id));

  return itensAtualizados;
}

export async function removerItemChecklist(id: string, itemId: string): Promise<ChecklistItem[] | null> {
  const [linha] = await db
    .select({ checklistJson: comuniqueSe.checklistJson })
    .from(comuniqueSe)
    .where(eq(comuniqueSe.id, id))
    .limit(1);

  const atual = linha?.checklistJson as ChecklistJson | null | undefined;
  if (!atual) return null;

  const existeItem = atual.itens.some((item) => item.id === itemId);
  if (!existeItem) return null;

  const itensAtualizados = atual.itens.filter((item) => item.id !== itemId);

  await db
    .update(comuniqueSe)
    .set({ checklistJson: { itens: itensAtualizados }, updatedAt: new Date() })
    .where(eq(comuniqueSe.id, id));

  return itensAtualizados;
}

export async function criarComuniqueSePronto(input: {
  id: string;
  projetoId: string;
  empresaId: string;
  itens: ChecklistItem[];
}): Promise<ComuniqueSe> {
  const numero = await proximoNumero(input.empresaId, "comunique_se");
  const [criado] = await db
    .insert(comuniqueSe)
    .values({
      id: input.id,
      projetoId: input.projetoId,
      numero,
      pdfOriginalUrl: null,
      status: "pronto",
      checklistJson: { itens: input.itens },
    })
    .returning(CAMPOS_COMUNIQUE_SE);
  return criado as ComuniqueSe;
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/db/queries/__tests__/comunique-se.test.ts`
Expected: PASS — 18 testes no total (11 já existentes, ajustados, + 7 novos).

- [ ] **Step 6: Commit**

```bash
git add src/db/queries/comunique-se.ts src/db/queries/__tests__/comunique-se.test.ts
git commit -m "feat: add manual creation and full checklist item CRUD to query layer"
```

---

### Task 5: Schemas Zod — criação discriminada e edição de item

**Files:**
- Modify: `src/lib/validations/comunique-se/create.schema.ts`
- Modify: `src/lib/validations/comunique-se/toggle-item.schema.ts`
- Create: `src/lib/validations/comunique-se/adicionar-item.schema.ts`
- Modify: `src/lib/validations/comunique-se/__tests__/create.schema.test.ts`
- Modify: `src/lib/validations/comunique-se/__tests__/toggle-item.schema.test.ts`
- Test: `src/lib/validations/comunique-se/__tests__/adicionar-item.schema.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export const criarComuniqueSeSchema` (agora `z.discriminatedUnion("modoCriacao", [...])`), `export type CriarComuniqueSeInput` (união `{ modoCriacao: "pdf"; projetoId; pdfBase64 } | { modoCriacao: "manual"; projetoId; itens: { descricao: string }[] }`). `export const alternarItemChecklistSchema` (agora aceita `concluida`/`descricao` opcionais, exige pelo menos um). `export const adicionarItemChecklistSchema` (`{ descricao: string }`), `export type AdicionarItemChecklistInput`. Tasks 6, 7, 8 usam esses tipos/schemas.

- [ ] **Step 1: Atualizar os testes de `create.schema.test.ts`**

Leia `src/lib/validations/comunique-se/__tests__/create.schema.test.ts` primeiro pra ver os testes existentes exatamente como estão, e substitua o conteúdo do arquivo inteiro por:

```ts
import { describe, expect, it } from "vitest";

import { criarComuniqueSeSchema } from "../create.schema";

const PROJETO_ID = "11111111-1111-4111-8111-111111111111";

describe("criarComuniqueSeSchema (modoCriacao: pdf)", () => {
  it("aceita projetoId válido e pdfBase64 não vazio", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      modoCriacao: "pdf",
      projetoId: PROJETO_ID,
      pdfBase64: "JVBERi0=",
    });

    expect(resultado.success).toBe(true);
  });

  it("rejeita projetoId que não é uuid", () => {
    const resultado = criarComuniqueSeSchema.safeParse({ modoCriacao: "pdf", projetoId: "abc", pdfBase64: "JVBERi0=" });

    expect(resultado.success).toBe(false);
  });

  it("rejeita pdfBase64 vazio", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      modoCriacao: "pdf",
      projetoId: PROJETO_ID,
      pdfBase64: "",
    });

    expect(resultado.success).toBe(false);
  });
});

describe("criarComuniqueSeSchema (modoCriacao: manual)", () => {
  it("aceita projetoId válido e ao menos um item", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      modoCriacao: "manual",
      projetoId: PROJETO_ID,
      itens: [{ descricao: "Apresentar ART" }],
    });

    expect(resultado.success).toBe(true);
  });

  it("rejeita lista de itens vazia", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      modoCriacao: "manual",
      projetoId: PROJETO_ID,
      itens: [],
    });

    expect(resultado.success).toBe(false);
  });

  it("rejeita item com descricao vazia", () => {
    const resultado = criarComuniqueSeSchema.safeParse({
      modoCriacao: "manual",
      projetoId: PROJETO_ID,
      itens: [{ descricao: "" }],
    });

    expect(resultado.success).toBe(false);
  });
});

describe("criarComuniqueSeSchema (modoCriacao desconhecido)", () => {
  it("rejeita modoCriacao que não é pdf nem manual", () => {
    const resultado = criarComuniqueSeSchema.safeParse({ modoCriacao: "video", projetoId: PROJETO_ID });

    expect(resultado.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes de create.schema e confirmar que falham**

Run: `npx vitest run src/lib/validations/comunique-se/__tests__/create.schema.test.ts`
Expected: FAIL — o schema atual não aceita `modoCriacao`.

- [ ] **Step 3: Implementar o schema discriminado**

Substitua o conteúdo de `src/lib/validations/comunique-se/create.schema.ts` por:

```ts
import { z } from "zod";

const projetoIdSchema = z.string().uuid("Selecione um projeto.");

export const criarComuniqueSeSchema = z.discriminatedUnion("modoCriacao", [
  z.object({
    modoCriacao: z.literal("pdf"),
    projetoId: projetoIdSchema,
    pdfBase64: z.string().min(1, "Arquivo PDF ausente."),
  }),
  z.object({
    modoCriacao: z.literal("manual"),
    projetoId: projetoIdSchema,
    itens: z
      .array(z.object({ descricao: z.string().min(1, "Descreva a exigência.") }))
      .min(1, "Adicione pelo menos um item."),
  }),
]);

export type CriarComuniqueSeInput = z.infer<typeof criarComuniqueSeSchema>;
```

- [ ] **Step 4: Rodar os testes de create.schema e confirmar que passam**

Run: `npx vitest run src/lib/validations/comunique-se/__tests__/create.schema.test.ts`
Expected: PASS — 7 testes.

- [ ] **Step 5: Atualizar os testes de `toggle-item.schema.test.ts`**

Leia o arquivo existente primeiro, depois substitua o conteúdo inteiro por:

```ts
import { describe, expect, it } from "vitest";

import { alternarItemChecklistSchema } from "../toggle-item.schema";

describe("alternarItemChecklistSchema", () => {
  it("aceita itemId e concluida boolean", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc", concluida: true });

    expect(resultado.success).toBe(true);
  });

  it("aceita itemId e descricao", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc", descricao: "Texto corrigido" });

    expect(resultado.success).toBe(true);
  });

  it("aceita itemId com os dois campos ao mesmo tempo", () => {
    const resultado = alternarItemChecklistSchema.safeParse({
      itemId: "abc",
      concluida: true,
      descricao: "Texto corrigido",
    });

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

  it("rejeita quando nem concluida nem descricao vieram preenchidos", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc" });

    expect(resultado.success).toBe(false);
  });

  it("rejeita descricao vazia", () => {
    const resultado = alternarItemChecklistSchema.safeParse({ itemId: "abc", descricao: "" });

    expect(resultado.success).toBe(false);
  });
});
```

- [ ] **Step 6: Rodar os testes de toggle-item e confirmar que falham**

Run: `npx vitest run src/lib/validations/comunique-se/__tests__/toggle-item.schema.test.ts`
Expected: FAIL — o schema atual exige `concluida` sempre e não aceita `descricao`.

- [ ] **Step 7: Implementar o schema generalizado**

Substitua o conteúdo de `src/lib/validations/comunique-se/toggle-item.schema.ts` por:

```ts
import { z } from "zod";

export const alternarItemChecklistSchema = z
  .object({
    itemId: z.string().min(1, "itemId ausente."),
    concluida: z.boolean().optional(),
    descricao: z.string().min(1, "Descrição não pode ficar vazia.").optional(),
  })
  .refine((data) => data.concluida !== undefined || data.descricao !== undefined, {
    message: "Informe concluida ou descricao.",
  });

export type AlternarItemChecklistInput = z.infer<typeof alternarItemChecklistSchema>;
```

- [ ] **Step 8: Rodar os testes de toggle-item e confirmar que passam**

Run: `npx vitest run src/lib/validations/comunique-se/__tests__/toggle-item.schema.test.ts`
Expected: PASS — 7 testes.

- [ ] **Step 9: Escrever o teste do schema de adicionar item (vai falhar — o módulo não existe)**

Crie `src/lib/validations/comunique-se/__tests__/adicionar-item.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { adicionarItemChecklistSchema } from "../adicionar-item.schema";

describe("adicionarItemChecklistSchema", () => {
  it("aceita descricao não vazia", () => {
    const resultado = adicionarItemChecklistSchema.safeParse({ descricao: "Apresentar ART" });

    expect(resultado.success).toBe(true);
  });

  it("rejeita descricao vazia", () => {
    const resultado = adicionarItemChecklistSchema.safeParse({ descricao: "" });

    expect(resultado.success).toBe(false);
  });

  it("rejeita corpo sem descricao", () => {
    const resultado = adicionarItemChecklistSchema.safeParse({});

    expect(resultado.success).toBe(false);
  });
});
```

- [ ] **Step 10: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/validations/comunique-se/__tests__/adicionar-item.schema.test.ts`
Expected: FAIL — `Cannot find module '../adicionar-item.schema'`.

- [ ] **Step 11: Implementar o schema**

Crie `src/lib/validations/comunique-se/adicionar-item.schema.ts`:

```ts
import { z } from "zod";

export const adicionarItemChecklistSchema = z.object({
  descricao: z.string().min(1, "Descreva a exigência."),
});

export type AdicionarItemChecklistInput = z.infer<typeof adicionarItemChecklistSchema>;
```

- [ ] **Step 12: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/validations/comunique-se/__tests__/adicionar-item.schema.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 13: Type-check e commit**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: erros esperados nos arquivos que ainda chamam o schema antigo (`src/app/api/comunique-se/route.ts`, hooks) — serão corrigidos nas próximas tasks. Confirme que os erros são só nesses arquivos e não em nenhum dos que esta task tocou.

```bash
git add src/lib/validations/comunique-se
git commit -m "feat: add discriminated create schema and generalize item schemas"
```

---

### Task 6: Pipeline — detecção integrada e criação manual

**Files:**
- Modify: `src/lib/comunique-se/processar.ts`
- Modify: `src/lib/comunique-se/__tests__/processar.test.ts`

**Interfaces:**
- Consumes: `detectarModeloEmbutido` de `./modelo-detectar` (Task 3), `criarComuniqueSePronto` de `@/db/queries/comunique-se` (Task 4). O teste também usa `gerarModeloExportado` de `@/lib/comunique-se/modelo-exportar` (Task 2) pra gerar a fixture do round-trip completo (exportar → reimportar), em vez de montar o anexo manualmente.
- Produces: `export async function processarComuniqueSe(...)` — mesma assinatura de hoje, mas agora tenta detecção antes de extrair+IA. `export async function criarComuniqueSeManual(input: { projetoId: string; empresaId: string; itens: { descricao: string }[] }): Promise<ResultadoProcessamento>` (nova). `ResultadoProcessamento.pdfOriginalUrl` passa a ser `string | null`. `reprocessarComuniqueSe`'s terceiro parâmetro (`pdfOriginalUrl`) passa de `string` pra `string | null` — mesma assinatura de nome/posição, só o tipo alargado. Task 7 usa `criarComuniqueSeManual`.

- [ ] **Step 1: Escrever os testes novos (vão falhar — a integração e a função não existem)**

Em `src/lib/comunique-se/__tests__/processar.test.ts`, adicione o import de `gerarModeloExportado` (não precisa mockar — é código real, exercitando o round-trip completo: gera o modelo exportado e usa esse mesmo arquivo como entrada do pipeline):

```ts
import { gerarModeloExportado } from "@/lib/comunique-se/modelo-exportar";
```

(junto dos imports já existentes no topo do arquivo)

E adicione, dentro do describe `processarComuniqueSe`:

```ts
  it("detecta um modelo DocObra embutido (gerado por gerarModeloExportado) e pula a extração/IA", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdfComModelo = await gerarModeloExportado({
      referencia: "CS-0001",
      projetoNome: "Casa da Praia",
      itens: [{ id: "1", descricao: "Apresentar ART", concluida: true }],
    });

    const resultado = await processarComuniqueSe({
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      pdfBuffer: pdfComModelo,
    });

    expect(resultado.status).toBe("pronto");
    expect(comuniqueSeRouter.extractStructured).not.toHaveBeenCalled();

    const [linha] = await db.select().from(comuniqueSe);
    expect(linha.checklistJson).toMatchObject({
      itens: [{ descricao: "Apresentar ART", concluida: true }],
    });
  });
```

Adicione um novo describe, no fim do arquivo:

```ts
describe("criarComuniqueSeManual", () => {
  afterEach(limparBanco);

  it("cria já pronto, sem PDF, com os itens informados", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();

    const resultado = await criarComuniqueSeManual({
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      itens: [{ descricao: "Apresentar ART" }, { descricao: "Apresentar laudo de sondagem" }],
    });

    expect(resultado.status).toBe("pronto");
    expect(resultado.pdfOriginalUrl).toBeNull();

    const [linha] = await db.select().from(comuniqueSe);
    expect(linha.checklistJson).toMatchObject({
      itens: [{ descricao: "Apresentar ART", concluida: false }, { descricao: "Apresentar laudo de sondagem", concluida: false }],
    });
  });
});
```

Adicione `criarComuniqueSeManual` ao import de `../processar` no topo do arquivo, junto de `processarComuniqueSe` e `reprocessarComuniqueSe`.

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/comunique-se/__tests__/processar.test.ts`
Expected: FAIL — `criarComuniqueSeManual` não existe, e o teste de detecção passa pelo fluxo de IA de sempre (mock não configurado pra esse teste específico, causaria erro ou resultado errado).

- [ ] **Step 3: Implementar as mudanças em `processar.ts`**

No topo de `src/lib/comunique-se/processar.ts`, adicione o import:

```ts
import { detectarModeloEmbutido } from "./modelo-detectar";
```

Adicione `criarComuniqueSePronto` ao import já existente de `@/db/queries/comunique-se`.

Troque o tipo `ResultadoProcessamento`:

```ts
type ResultadoProcessamento = { id: string; numero: number; status: string; pdfOriginalUrl: string | null };
```

Troque a função `processarComuniqueSe` inteira por:

```ts
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

  const itensDetectados = await detectarModeloEmbutido(input.pdfBuffer);
  if (itensDetectados) {
    const itensComId: ChecklistItem[] = itensDetectados.map((item) => ({
      id: randomUUID(),
      descricao: item.descricao,
      concluida: item.concluida,
    }));
    await marcarComoPronto(id, itensComId);
    return { id, numero: criado.numero, status: "pronto", pdfOriginalUrl };
  }

  const resultado = await finalizarProcessamento(id, input.pdfBuffer);
  return { id, numero: criado.numero, status: resultado.status, pdfOriginalUrl };
}

export async function criarComuniqueSeManual(input: {
  projetoId: string;
  empresaId: string;
  itens: { descricao: string }[];
}): Promise<ResultadoProcessamento> {
  const id = randomUUID();
  const itensComId: ChecklistItem[] = input.itens.map((item) => ({
    id: randomUUID(),
    descricao: item.descricao,
    concluida: false,
  }));

  const criado = await criarComuniqueSePronto({
    id,
    projetoId: input.projetoId,
    empresaId: input.empresaId,
    itens: itensComId,
  });

  return { id, numero: criado.numero, status: "pronto", pdfOriginalUrl: null };
}
```

Não mexa na LÓGICA de `finalizarProcessamento` nem de `reprocessarComuniqueSe` — o retry só acontece quando o status já está `erro`, o que significa que a detecção já falhou na tentativa original (se tivesse detectado, o status já teria virado `pronto` direto, sem nunca chegar em `erro`), então repetir só o caminho de IA no retry continua correto.

Só o **tipo** do parâmetro de `reprocessarComuniqueSe` precisa mudar — a Task 1 tornou `ComuniqueSe.pdfOriginalUrl` (e, por consequência, `ResultadoProcessamento.pdfOriginalUrl` já editado acima) `string | null`, mas a assinatura de `reprocessarComuniqueSe` ainda espera `string`. Isso já quebra o type-check em dois lugares que esta task não toca de outra forma: a rota de retry (`src/app/api/comunique-se/[id]/retry/route.ts`, que passa `comuniqueSeEncontrado.pdfOriginalUrl` — agora `string | null` — pra essa função) e o teste já existente `reprocessarComuniqueSe` (que passa `linhaErro.pdfOriginalUrl`, mesmo motivo). Troque a assinatura:

```ts
export async function reprocessarComuniqueSe(
  id: string,
  numero: number,
  pdfOriginalUrl: string,
): Promise<ResultadoProcessamento> {
```

por:

```ts
export async function reprocessarComuniqueSe(
  id: string,
  numero: number,
  pdfOriginalUrl: string | null,
): Promise<ResultadoProcessamento> {
```

(o corpo da função não muda — ela só ecoa esse valor de volta no `ResultadoProcessamento` retornado, nunca usa `pdfOriginalUrl` pra ler o arquivo, então aceitar `null` aqui não quebra nada; na prática nunca chega `null` de verdade, já que retry só roda em Comunique-se que veio de PDF).

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/comunique-se/__tests__/processar.test.ts`
Expected: PASS — 6 testes (os 4 já existentes + os 2 novos).

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: os erros em `src/app/api/comunique-se/[id]/retry/route.ts` e no teste `reprocessarComuniqueSe` (presentes desde a Task 1) desaparecem. Deve sobrar só o erro em `src/app/dashboard/comunique-se/[id]/page.tsx`, que é intencionalmente deferido pra Task 12.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comunique-se/processar.ts src/lib/comunique-se/__tests__/processar.test.ts
git commit -m "feat: integrate embedded model detection and manual creation into pipeline"
```

---

### Task 7: Rota `POST /api/comunique-se` discriminada

**Files:**
- Modify: `src/app/api/comunique-se/route.ts`
- Modify: `src/app/api/comunique-se/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `criarComuniqueSeSchema`/`CriarComuniqueSeInput` (Task 5, discriminado), `processarComuniqueSe`/`criarComuniqueSeManual` de `@/lib/comunique-se/processar` (Task 6).
- Produces: `POST /api/comunique-se` aceitando `modoCriacao: "pdf" | "manual"` — nenhuma task futura consome diretamente.

- [ ] **Step 1: Atualizar os testes existentes pra incluir `modoCriacao: "pdf"`**

Em `src/app/api/comunique-se/__tests__/route.test.ts`, em TODOS os `criarRequestPost({ projetoId, pdfBase64: ... }, token)` (e variações) que hoje não têm `modoCriacao`, adicione `modoCriacao: "pdf"` ao objeto. Por exemplo:

```ts
    const response = await POST(
      criarRequestPost(
        { modoCriacao: "pdf", projetoId: "00000000-0000-0000-0000-000000000000", pdfBase64: PDF_BASE64_FAKE },
        token,
      ),
    );
```

Aplique essa mudança (adicionar `modoCriacao: "pdf"`) em todos os 5 lugares do arquivo que hoje mandam `pdfBase64` sem esse campo: "rejeita projeto de outra empresa", "rejeita arquivo que não é PDF", "rejeita arquivo maior que 10MB", "chama processarComuniqueSe e retorna 201", "retorna 500 quando processarComuniqueSe lança". Não mexa em "rejeita sem sessão" nem "rejeita dados inválidos com 400" (que já mandam corpo vazio/incompleto de propósito).

Adicione também, dentro do describe `POST /api/comunique-se`, o mock de `criarComuniqueSeManual` junto do já existente `processarComuniqueSe`:

```ts
vi.mock("@/lib/comunique-se/processar", () => ({
  processarComuniqueSe: vi.fn(),
  criarComuniqueSeManual: vi.fn(),
}));

import { criarComuniqueSeManual, processarComuniqueSe } from "@/lib/comunique-se/processar";
```

(troque o bloco de mock e o import que já existem por esses, mantendo os dois nomes).

E no `beforeEach` do describe `POST /api/comunique-se`, adicione o reset:

```ts
    vi.mocked(criarComuniqueSeManual).mockReset();
```

- [ ] **Step 2: Escrever os testes novos do modo manual (vão falhar — a rota não aceita ainda)**

No mesmo describe `POST /api/comunique-se`, adicione:

```ts
  it("modoCriacao manual: rejeita sem nenhum item com 400, sem chamar criarComuniqueSeManual", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();

    const response = await POST(criarRequestPost({ modoCriacao: "manual", projetoId, itens: [] }, token));

    expect(response.status).toBe(400);
    expect(criarComuniqueSeManual).not.toHaveBeenCalled();
  });

  it("modoCriacao manual: chama criarComuniqueSeManual e retorna 201 no sucesso", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(criarComuniqueSeManual).mockResolvedValue({
      id: "abc",
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: null,
    });

    const response = await POST(
      criarRequestPost({ modoCriacao: "manual", projetoId, itens: [{ descricao: "Apresentar ART" }] }, token),
    );

    expect(response.status).toBe(201);
    const corpo = await response.json();
    expect(corpo.comuniqueSe.status).toBe("pronto");
    expect(corpo.comuniqueSe.pdfOriginalUrl).toBeNull();
  });

  it("modoCriacao manual: rejeita projeto de outra empresa com 404", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(
      criarRequestPost(
        {
          modoCriacao: "manual",
          projetoId: "00000000-0000-0000-0000-000000000000",
          itens: [{ descricao: "Apresentar ART" }],
        },
        token,
      ),
    );

    expect(response.status).toBe(404);
    expect(criarComuniqueSeManual).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/app/api/comunique-se/__tests__/route.test.ts`
Expected: FAIL — a rota ainda espera só `pdfBase64` sem discriminar `modoCriacao`.

- [ ] **Step 4: Implementar a rota discriminada**

Em `src/app/api/comunique-se/route.ts`, troque a linha de import existente:

```ts
import { processarComuniqueSe } from "@/lib/comunique-se/processar";
```

por:

```ts
import { criarComuniqueSeManual, processarComuniqueSe } from "@/lib/comunique-se/processar";
```

Não mexa em mais nenhum import nem na função `GET` — só a linha acima e a função `POST` inteira, substituída por:

```ts
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

  try {
    if (parsed.data.modoCriacao === "manual") {
      const resultado = await criarComuniqueSeManual({
        projetoId: parsed.data.projetoId,
        empresaId: sessao.empresaId,
        itens: parsed.data.itens,
      });
      return NextResponse.json({ comuniqueSe: resultado }, { status: 201 });
    }

    const pdfBuffer = Buffer.from(parsed.data.pdfBase64, "base64");

    if (!ehPdfValido(pdfBuffer)) {
      return NextResponse.json({ error: "Arquivo não é um PDF válido." }, { status: 400 });
    }

    if (pdfBuffer.length > TAMANHO_MAXIMO_PDF_BYTES) {
      return NextResponse.json({ error: "Arquivo excede o tamanho máximo de 10MB." }, { status: 400 });
    }

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

Note que a validação de PDF (`ehPdfValido`/`TAMANHO_MAXIMO_PDF_BYTES`) só roda dentro do `if` do modo `pdf` — no modo `manual` não existe `pdfBase64` no payload.

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/app/api/comunique-se/__tests__/route.test.ts`
Expected: PASS — 13 testes (10 já existentes ajustados + 3 novos).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros nos arquivos tocados até aqui (ainda deve haver erros nos hooks/UI, que serão corrigidos nas Tasks 10-12).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/comunique-se/route.ts src/app/api/comunique-se/__tests__/route.test.ts
git commit -m "feat: support modoCriacao pdf/manual in POST /api/comunique-se"
```

---

### Task 8: Rotas de edição de item (adicionar, editar, remover)

**Files:**
- Modify: `src/app/api/comunique-se/[id]/itens/route.ts`
- Create: `src/app/api/comunique-se/[id]/itens/[itemId]/route.ts`
- Test: `src/app/api/comunique-se/[id]/itens/[itemId]/__tests__/route.test.ts`
- Test: modificar `src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts` (adicionar testes de `POST`, sem remover os de `PATCH`)

**Interfaces:**
- Consumes: `adicionarItemChecklist`/`removerItemChecklist` de `@/db/queries/comunique-se` (Task 4), `adicionarItemChecklistSchema` de `@/lib/validations/comunique-se/adicionar-item.schema` (Task 5).
- Produces: `POST /api/comunique-se/[id]/itens`, `DELETE /api/comunique-se/[id]/itens/[itemId]` — nenhuma task futura consome diretamente.

- [ ] **Step 1: Escrever os testes de `POST .../itens` (vão falhar — o handler não existe)**

Em `src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts`, adicione ao import do topo `POST` junto de `PATCH`:

```ts
import { PATCH, POST } from "@/app/api/comunique-se/[id]/itens/route";
```

E adicione um novo describe, no fim do arquivo:

```ts
describe("POST /api/comunique-se/[id]/itens", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await POST(criarRequest({ descricao: "x" }), { params: Promise.resolve({ id: "x" }) });
    expect(response.status).toBe(401);
  });

  it("rejeita corpo sem descricao com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoComChecklist();

    const response = await POST(criarRequest({}, token), { params: Promise.resolve({ id: comuniqueSeId }) });

    expect(response.status).toBe(400);
  });

  it("retorna 404 pra Comunique-se inexistente", async () => {
    const { token } = await criarSessaoComChecklist();

    const response = await POST(criarRequest({ descricao: "Novo item" }, token), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });

  it("rejeita adicionar item quando o Comunique-se ainda não está pronto com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoAindaProcessando();

    const response = await POST(criarRequest({ descricao: "Novo item" }, token), {
      params: Promise.resolve({ id: comuniqueSeId }),
    });

    expect(response.status).toBe(400);
  });

  it("adiciona o item e retorna a lista atualizada com 201", async () => {
    const { token, comuniqueSeId } = await criarSessaoComChecklist();

    const response = await POST(criarRequest({ descricao: "Novo item" }, token), {
      params: Promise.resolve({ id: comuniqueSeId }),
    });

    expect(response.status).toBe(201);
    const corpo = await response.json();
    expect(corpo.itens).toHaveLength(2);
    expect(corpo.itens[1].descricao).toBe("Novo item");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run "src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts"`
Expected: FAIL — `POST` não é exportado por `route.ts` ainda.

- [ ] **Step 3: Implementar o `POST` e generalizar o `PATCH`**

Substitua o conteúdo inteiro de `src/app/api/comunique-se/[id]/itens/route.ts` por:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { adicionarItemChecklist, atualizarItemChecklist, buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { adicionarItemChecklistSchema } from "@/lib/validations/comunique-se/adicionar-item.schema";
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

  const itens = await atualizarItemChecklist(id, parsed.data.itemId, {
    concluida: parsed.data.concluida,
    descricao: parsed.data.descricao,
  });
  if (!itens) {
    return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ itens });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = adicionarItemChecklistSchema.safeParse(body);
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

  const itens = await adicionarItemChecklist(id, parsed.data.descricao);
  if (!itens) {
    return NextResponse.json({ error: "Comunique-se não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ itens }, { status: 201 });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run "src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts"`
Expected: PASS — 11 testes (6 já existentes do `PATCH` + 5 novos do `POST`).

- [ ] **Step 5: Escrever os testes de `DELETE .../itens/[itemId]` (vão falhar — a rota não existe)**

Crie `src/app/api/comunique-se/[id]/itens/[itemId]/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { DELETE } from "@/app/api/comunique-se/[id]/itens/[itemId]/route";

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

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/comunique-se/x/itens/y", {
    method: "DELETE",
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("DELETE /api/comunique-se/[id]/itens/[itemId]", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await DELETE(criarRequest(), { params: Promise.resolve({ id: "x", itemId: "y" }) });
    expect(response.status).toBe(401);
  });

  it("retorna 404 pra Comunique-se inexistente", async () => {
    const { token } = await criarSessaoComChecklist();

    const response = await DELETE(criarRequest(token), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000", itemId: "y" }),
    });

    expect(response.status).toBe(404);
  });

  it("retorna 404 pra itemId inexistente", async () => {
    const { token, comuniqueSeId } = await criarSessaoComChecklist();

    const response = await DELETE(criarRequest(token), {
      params: Promise.resolve({ id: comuniqueSeId, itemId: "item-fantasma" }),
    });

    expect(response.status).toBe(404);
  });

  it("rejeita remover item quando o Comunique-se ainda não está pronto com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoAindaProcessando();

    const response = await DELETE(criarRequest(token), {
      params: Promise.resolve({ id: comuniqueSeId, itemId: "qualquer" }),
    });

    expect(response.status).toBe(400);
  });

  it("remove o item e retorna a lista atualizada com 200", async () => {
    const { token, comuniqueSeId, itemId } = await criarSessaoComChecklist();

    const response = await DELETE(criarRequest(token), {
      params: Promise.resolve({ id: comuniqueSeId, itemId }),
    });

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.itens).toEqual([]);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npx vitest run "src/app/api/comunique-se/[id]/itens/[itemId]/__tests__/route.test.ts"`
Expected: FAIL — `Cannot find module '@/app/api/comunique-se/[id]/itens/[itemId]/route'`.

- [ ] **Step 7: Implementar a rota `DELETE`**

Crie `src/app/api/comunique-se/[id]/itens/[itemId]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarComuniqueSeDaEmpresa, removerItemChecklist } from "@/db/queries/comunique-se";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id, itemId } = await params;
  const comuniqueSeEncontrado = await buscarComuniqueSeDaEmpresa(id, sessao.empresaId);
  if (!comuniqueSeEncontrado) {
    return NextResponse.json({ error: "Comunique-se não encontrado." }, { status: 404 });
  }
  if (comuniqueSeEncontrado.status !== "pronto") {
    return NextResponse.json({ error: "Esse Comunique-se ainda não está pronto." }, { status: 400 });
  }

  const itens = await removerItemChecklist(id, itemId);
  if (!itens) {
    return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ itens });
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run "src/app/api/comunique-se/[id]/itens/[itemId]/__tests__/route.test.ts"`
Expected: PASS — 5 testes.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/comunique-se/[id]/itens"
git commit -m "feat: add add/remove checklist item route handlers"
```

---

### Task 9: Rota `GET /api/comunique-se/[id]/modelo` (export)

**Files:**
- Create: `src/app/api/comunique-se/[id]/modelo/route.ts`
- Test: `src/app/api/comunique-se/[id]/modelo/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `buscarComuniqueSeDaEmpresa` de `@/db/queries/comunique-se` (já existe), `buscarProjetoDaEmpresa` de `@/db/queries/projeto` (já existe), `gerarModeloExportado` de `@/lib/comunique-se/modelo-exportar` (Task 2), `referenciaComuniqueSe` de `@/lib/referencia` (já existe). O teste também usa `detectarModeloEmbutido` de `@/lib/comunique-se/modelo-detectar` (Task 3) pra verificar o anexo do PDF gerado, em vez de reimplementar a leitura manual do `pdf-lib`.
- Produces: `GET /api/comunique-se/[id]/modelo` — nenhuma task futura consome diretamente.

- [ ] **Step 1: Escrever os testes (vão falhar — a rota não existe)**

Crie `src/app/api/comunique-se/[id]/modelo/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { detectarModeloEmbutido } from "@/lib/comunique-se/modelo-detectar";
import { GET } from "@/app/api/comunique-se/[id]/modelo/route";

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(usuario);
  await db.delete(projeto);
  await db.delete(empresa);
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/comunique-se/x/modelo", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("GET /api/comunique-se/[id]/modelo", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("retorna 401 sem sessão", async () => {
    const response = await GET(criarRequest(), { params: Promise.resolve({ id: "x" }) });
    expect(response.status).toBe(401);
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
      .values({
        projetoId: projetoA.id,
        numero: 1,
        status: "pronto",
        pdfOriginalUrl: "/x",
        checklistJson: { itens: [] },
      })
      .returning();
    const tokenB = await assinarToken({ userId: usuarioB.id, empresaId: empresaB.id, papel: usuarioB.papel });

    const response = await GET(criarRequest(tokenB), { params: Promise.resolve({ id: linhaA.id }) });

    expect(response.status).toBe(404);
  });

  it("retorna 400 quando o Comunique-se ainda não está pronto", async () => {
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

    const response = await GET(criarRequest(token), { params: Promise.resolve({ id: linha.id }) });

    expect(response.status).toBe(400);
  });

  it("gera o PDF com o checklist atual anexado", async () => {
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
      .values({
        projetoId: novoProjeto.id,
        numero: 1,
        status: "pronto",
        pdfOriginalUrl: "/x",
        checklistJson: { itens: [{ id: "1", descricao: "Apresentar ART", concluida: true }] },
      })
      .returning();
    const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });

    const response = await GET(criarRequest(token), { params: Promise.resolve({ id: linha.id }) });

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");

    const itensDetectados = await detectarModeloEmbutido(buffer);
    expect(itensDetectados).toEqual([{ descricao: "Apresentar ART", concluida: true }]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run "src/app/api/comunique-se/[id]/modelo/__tests__/route.test.ts"`
Expected: FAIL — `Cannot find module '@/app/api/comunique-se/[id]/modelo/route'`.

- [ ] **Step 3: Implementar a rota**

Crie `src/app/api/comunique-se/[id]/modelo/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { buscarProjetoDaEmpresa } from "@/db/queries/projeto";
import { referenciaComuniqueSe } from "@/lib/referencia";
import { gerarModeloExportado } from "@/lib/comunique-se/modelo-exportar";

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
  if (comuniqueSeEncontrado.status !== "pronto" || !comuniqueSeEncontrado.checklistJson) {
    return NextResponse.json({ error: "Esse Comunique-se ainda não está pronto." }, { status: 400 });
  }

  // buscarComuniqueSeDaEmpresa acima já confirma (via join) que o projeto existe
  // e pertence a essa empresa — não pode retornar null aqui.
  const projetoEncontrado = await buscarProjetoDaEmpresa(comuniqueSeEncontrado.projetoId, sessao.empresaId);

  const pdf = await gerarModeloExportado({
    referencia: referenciaComuniqueSe(comuniqueSeEncontrado.numero),
    projetoNome: projetoEncontrado!.nome,
    itens: comuniqueSeEncontrado.checklistJson.itens,
  });

  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf" } });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run "src/app/api/comunique-se/[id]/modelo/__tests__/route.test.ts"`
Expected: PASS — 4 testes (usa Puppeteer real internamente, pode levar alguns segundos).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/comunique-se/[id]/modelo"
git commit -m "feat: add GET /api/comunique-se/[id]/modelo export route"
```

---

### Task 10: Hooks React Query

**Files:**
- Modify: `src/hooks/use-alternar-item-checklist.ts`
- Create: `src/hooks/use-adicionar-item-checklist.ts`
- Create: `src/hooks/use-remover-item-checklist.ts`

**Interfaces:**
- Consumes: nada novo de tasks anteriores (só os endpoints já criados nas Tasks 7-9, via `fetch`).
- Produces: `useAlternarItemChecklist()` (mutationFn agora aceita `descricao?` além de `concluida?`), `useAdicionarItemChecklist()`, `useRemoverItemChecklist()`. Tasks 11 e 12 usam esses três hooks.

**Sem teste automatizado nesta task** — mesmo padrão já usado pros hooks equivalentes (`use-criar-comunique-se.ts`, `use-retry-comunique-se.ts`); cobertura vem da verificação manual (Task 13).

- [ ] **Step 1: Generalizar `useAlternarItemChecklist`**

Substitua o conteúdo de `src/hooks/use-alternar-item-checklist.ts` por:

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
  concluida?: boolean;
  descricao?: string;
}): Promise<ChecklistItem[]> {
  const response = await fetch(`/api/comunique-se/${input.comuniqueSeId}/itens`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: input.itemId, concluida: input.concluida, descricao: input.descricao }),
  });

  const data = (await response.json()) as { itens: ChecklistItem[] } | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return (data as { itens: ChecklistItem[] }).itens;
}

export function useAlternarItemChecklist() {
  return useMutation({ mutationFn: alternarItemRequest, scope: { id: "checklist-itens" } });
}
```

- [ ] **Step 2: Criar `useAdicionarItemChecklist`**

Crie `src/hooks/use-adicionar-item-checklist.ts`:

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

async function adicionarItemRequest(input: { comuniqueSeId: string; descricao: string }): Promise<ChecklistItem[]> {
  const response = await fetch(`/api/comunique-se/${input.comuniqueSeId}/itens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ descricao: input.descricao }),
  });

  const data = (await response.json()) as { itens: ChecklistItem[] } | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return (data as { itens: ChecklistItem[] }).itens;
}

export function useAdicionarItemChecklist() {
  return useMutation({ mutationFn: adicionarItemRequest, scope: { id: "checklist-itens" } });
}
```

- [ ] **Step 3: Criar `useRemoverItemChecklist`**

Crie `src/hooks/use-remover-item-checklist.ts`:

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

async function removerItemRequest(input: { comuniqueSeId: string; itemId: string }): Promise<ChecklistItem[]> {
  const response = await fetch(`/api/comunique-se/${input.comuniqueSeId}/itens/${input.itemId}`, {
    method: "DELETE",
  });

  const data = (await response.json()) as { itens: ChecklistItem[] } | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return (data as { itens: ChecklistItem[] }).itens;
}

export function useRemoverItemChecklist() {
  return useMutation({ mutationFn: removerItemRequest, scope: { id: "checklist-itens" } });
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros novos nos arquivos tocados até aqui (a UI que consome esses hooks ainda não foi atualizada — vira Tasks 11 e 12).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-alternar-item-checklist.ts src/hooks/use-adicionar-item-checklist.ts src/hooks/use-remover-item-checklist.ts
git commit -m "feat: add hooks for adding/removing checklist items, generalize toggle hook"
```

---

### Task 11: UI — toggle Enviar PDF/Digitar no drawer

**Files:**
- Modify: `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`

**Interfaces:**
- Consumes: `criarComuniqueSeSchema`/`CriarComuniqueSeInput` (Task 5, discriminado), `useCriarComuniqueSe` (já existe, tipo genérico sobre `CriarComuniqueSeInput` — sem mudança de código no hook).
- Produces: nada consumido por tasks futuras.

**Sem teste automatizado nesta task** (mesmo padrão do resto da UI). Cobertura vem da verificação manual (Task 13).

- [ ] **Step 1: Reescrever o formulário com o toggle**

Substitua o conteúdo inteiro de `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx` por:

```tsx
"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import type { Projeto } from "@/db/queries/projeto";
import { criarComuniqueSeSchema } from "@/lib/validations/comunique-se/create.schema";
import { useCriarComuniqueSe } from "@/hooks/use-criar-comunique-se";
import { ProjetoCombobox } from "@/components/common/projeto-combobox";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [modo, setModo] = useState<"pdf" | "manual">("pdf");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [itensDigitados, setItensDigitados] = useState<string[]>([""]);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarComuniqueSe();
  const { handleSubmit, control } = useForm<FormValues>();

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

  function handleItemDigitadoChange(indice: number, valor: string) {
    setItensDigitados((atual) => atual.map((item, i) => (i === indice ? valor : item)));
  }

  function handleAdicionarLinha() {
    setItensDigitados((atual) => [...atual, ""]);
  }

  function handleRemoverLinha(indice: number) {
    setItensDigitados((atual) => (atual.length === 1 ? atual : atual.filter((_, i) => i !== indice)));
  }

  async function onSubmit(values: FormValues) {
    setErro(null);

    if (modo === "pdf") {
      if (!arquivo) {
        setErro("Selecione um arquivo PDF.");
        return;
      }

      const pdfBase64 = arrayBufferParaBase64(await arquivo.arrayBuffer());
      const payload = { modoCriacao: "pdf" as const, projetoId: values.projetoId, pdfBase64 };

      const parsed = criarComuniqueSeSchema.safeParse(payload);
      if (!parsed.success) {
        setErro("Preencha os campos obrigatórios corretamente.");
        return;
      }

      criar.mutate(parsed.data, {
        onSuccess: () => onSuccess(),
        onError: (error) => setErro(error.message),
      });
      return;
    }

    const itensPreenchidos = itensDigitados.map((item) => item.trim()).filter((item) => item.length > 0);
    const payload = {
      modoCriacao: "manual" as const,
      projetoId: values.projetoId,
      itens: itensPreenchidos.map((descricao) => ({ descricao })),
    };

    const parsed = criarComuniqueSeSchema.safeParse(payload);
    if (!parsed.success) {
      setErro("Adicione pelo menos um item.");
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
        <Label>Como criar</Label>
        <div className="flex gap-2">
          <Button type="button" variant={modo === "pdf" ? "default" : "outline"} onClick={() => setModo("pdf")}>
            Enviar PDF
          </Button>
          <Button type="button" variant={modo === "manual" ? "default" : "outline"} onClick={() => setModo("manual")}>
            Digitar exigências
          </Button>
        </div>
      </div>

      {modo === "pdf" ? (
        <div className="grid gap-2">
          <Label htmlFor="pdf">Arquivo do Comunique-se (PDF)</Label>
          <input
            id="pdf"
            type="file"
            accept="application/pdf"
            onChange={handleArquivoSelecionado}
            className="rounded-md border border-input p-2 text-sm"
          />
          {arquivo && <p className="text-xs text-muted-foreground">{arquivo.name}</p>}
        </div>
      ) : (
        <div className="grid gap-2">
          <Label>Exigências</Label>
          <div className="grid gap-2">
            {itensDigitados.map((item, indice) => (
              <div key={indice} className="flex gap-2">
                <Input
                  value={item}
                  onChange={(event) => handleItemDigitadoChange(indice, event.target.value)}
                  placeholder="Descreva a exigência"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoverLinha(indice)}
                  disabled={itensDigitados.length === 1}
                >
                  Remover
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAdicionarLinha}>
            + Adicionar item
          </Button>
        </div>
      )}

      {erro && <p className="text-destructive text-sm">{erro}</p>}
      <Button type="submit" disabled={criar.isPending}>
        {criar.isPending ? "Processando..." : "Enviar Comunique-se"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/comunique-se/novo-comunique-se-form.tsx
git commit -m "feat: add PDF/manual toggle to comunique-se creation form"
```

---

### Task 12: UI — checklist editável + botão Baixar modelo

**Files:**
- Modify: `src/app/dashboard/comunique-se/[id]/checklist-itens.tsx`
- Modify: `src/app/dashboard/comunique-se/[id]/page.tsx`

**Interfaces:**
- Consumes: `useAlternarItemChecklist` (generalizado, Task 10), `useAdicionarItemChecklist`/`useRemoverItemChecklist` (Task 10).
- Produces: nada consumido por tasks futuras — última peça de UI antes da verificação manual.

**Sem teste automatizado nesta task**. Cobertura vem da verificação manual (Task 13).

- [ ] **Step 1: Reescrever `ChecklistItens` com edição inline, adicionar e remover**

Substitua o conteúdo inteiro de `src/app/dashboard/comunique-se/[id]/checklist-itens.tsx` por:

```tsx
"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { useAlternarItemChecklist } from "@/hooks/use-alternar-item-checklist";
import { useAdicionarItemChecklist } from "@/hooks/use-adicionar-item-checklist";
import { useRemoverItemChecklist } from "@/hooks/use-remover-item-checklist";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

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
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [novoItemTexto, setNovoItemTexto] = useState("");
  const alternar = useAlternarItemChecklist();
  const adicionar = useAdicionarItemChecklist();
  const remover = useRemoverItemChecklist();

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

  function iniciarEdicao(item: ChecklistItem) {
    setEditandoId(item.id);
    setTextoEdicao(item.descricao);
  }

  function confirmarEdicao(itemId: string) {
    const textoAntigo = itens.find((item) => item.id === itemId)?.descricao ?? "";
    const textoNovo = textoEdicao.trim();

    if (!textoNovo || textoNovo === textoAntigo) {
      setEditandoId(null);
      return;
    }

    setItens((atual) => atual.map((item) => (item.id === itemId ? { ...item, descricao: textoNovo } : item)));
    setEditandoId(null);

    alternar.mutate(
      { comuniqueSeId, itemId, descricao: textoNovo },
      {
        onError: () => {
          setItens((atual) => atual.map((item) => (item.id === itemId ? { ...item, descricao: textoAntigo } : item)));
        },
      },
    );
  }

  function handleRemover(itemId: string) {
    const itensAntes = itens;
    setItens((atual) => atual.filter((item) => item.id !== itemId));

    remover.mutate(
      { comuniqueSeId, itemId },
      {
        onError: () => setItens(itensAntes),
      },
    );
  }

  function handleAdicionar() {
    const descricao = novoItemTexto.trim();
    if (!descricao) return;

    setNovoItemTexto("");

    adicionar.mutate(
      { comuniqueSeId, descricao },
      {
        onSuccess: (itensAtualizados) => setItens(itensAtualizados),
      },
    );
  }

  return (
    <div className="grid gap-4">
      {itens.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma exigência ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {itens.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <Checkbox
                checked={item.concluida}
                onCheckedChange={(valor) => handleToggle(item.id, valor === true)}
              />
              {editandoId === item.id ? (
                <Input
                  autoFocus
                  value={textoEdicao}
                  onChange={(event) => setTextoEdicao(event.target.value)}
                  onBlur={() => confirmarEdicao(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") confirmarEdicao(item.id);
                    if (event.key === "Escape") setEditandoId(null);
                  }}
                  className="h-7 flex-1 text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => iniciarEdicao(item)}
                  className={cn(
                    "flex-1 text-left text-sm",
                    item.concluida && "text-muted-foreground line-through",
                  )}
                >
                  {item.descricao}
                </button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemover(item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={novoItemTexto}
          onChange={(event) => setNovoItemTexto(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleAdicionar();
          }}
          placeholder="Adicionar item"
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={handleAdicionar}>
          + Adicionar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar o botão "Baixar modelo" na página de detalhe**

Em `src/app/dashboard/comunique-se/[id]/page.tsx`, troque o bloco do cabeçalho:

```tsx
        <a href={comuniqueSeEncontrado.pdfOriginalUrl} className="text-sm underline">
          Baixar PDF original
        </a>
```

por:

```tsx
        <div className="flex gap-3">
          {comuniqueSeEncontrado.pdfOriginalUrl && (
            <a href={comuniqueSeEncontrado.pdfOriginalUrl} className="text-sm underline">
              Baixar PDF original
            </a>
          )}
          {comuniqueSeEncontrado.status === "pronto" && (
            <a href={`/api/comunique-se/${comuniqueSeEncontrado.id}/modelo`} className="text-sm underline">
              Baixar modelo
            </a>
          )}
        </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros.

- [ ] **Step 4: Rodar a suíte inteira e o build**

Run: `npm test`
Expected: PASS — todos os testes anteriores + os novos desta feature.

Run: `npm run build`
Expected: build passa, `/api/comunique-se/[id]/modelo` e `/api/comunique-se/[id]/itens/[itemId]` aparecem na saída como rotas geradas.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/comunique-se/[id]
git commit -m "feat: add editable checklist UI and export button"
```

---

### Task 13: Verificação manual do fluxo completo

**Files:** nenhum (task de verificação — só um commit final se algo precisar de ajuste).

**Interfaces:** nenhuma — consome tudo das Tasks 1-12.

- [ ] **Step 1: Build e suíte completos**

Run: `npm run build`
Expected: sucesso.

Run: `npm test`
Expected: 100% dos testes passando.

- [ ] **Step 2: Verificar criação manual e edição via navegador**

Suba o dev server numa porta alternativa. Com um usuário/projeto já existentes:

1. Acesse `/dashboard/comunique-se`, clique "Novo Comunique-se". Confirme: o toggle "Enviar PDF"/"Digitar exigências" aparece, começando em "Enviar PDF".
2. Clique "Digitar exigências". Confirme: campo de arquivo some, aparece uma lista com um campo de texto e um botão "+ Adicionar item".
3. Digite 2-3 exigências, adicionando linhas com "+ Adicionar item". Submeta. Confirme: fecha o drawer, a lista mostra o novo item como "pronto" direto (sem loading de IA).
4. Abra o checklist criado. Confirme: os itens digitados aparecem, todos desmarcados.
5. Clique no texto de um item — confirme que vira um campo editável; edite e pressione Enter — confirme que o texto muda e persiste depois de recarregar a página.
6. Clique "+ Adicionar" com um texto novo — confirme que o item aparece na lista.
7. Remova um item (ícone de lixeira) — confirme que some da lista e continua removido após recarregar.
8. Remova todos os itens até a lista ficar vazia — confirme a mensagem "Nenhuma exigência ainda." e que o campo de adicionar continua funcionando.

- [ ] **Step 3: Verificar export/import (round-trip)**

1. Crie (ou reaproveite) um Comunique-se `pronto` com pelo menos 2 itens.
2. Clique "Baixar modelo". Confirme: baixa um PDF (`Content-Type: application/pdf`), abra o arquivo e confirme que o conteúdo visual mostra o checklist.
3. Volte pra listagem, clique "Novo Comunique-se", modo "Enviar PDF", e suba esse mesmo arquivo baixado (selecionando o mesmo projeto ou outro).
4. Confirme: o novo Comunique-se fica `pronto` **quase instantaneamente** (sem o delay de uma chamada real de IA), com os mesmos itens do original (texto e estado concluído/pendente preservados).
5. Confirme, olhando os logs do servidor ou o tempo de resposta, que nenhuma chamada real ao Gemini/Claude aconteceu nesse upload específico (deve ser bem mais rápido que o fluxo normal de PDF real).

- [ ] **Step 4: Confirmar que o fluxo de PDF real (upload → IA) continua funcionando**

Suba um PDF de Comunique-se real (sem o anexo do DocObra) num Comunique-se novo. Confirme que passa pelo fluxo de sempre (extração + chamada real de IA) e chega em `pronto` com os itens extraídos do texto do documento — sem regressão nenhuma no caminho já existente.

- [ ] **Step 5: Parar o dev server**

Confirme que o processo foi encerrado.

- [ ] **Step 6: Commit final, só se algo precisou de ajuste**

```bash
git add -A
git commit -m "fix: <descrição específica do que a verificação manual encontrou>"
```

Se tudo passou de primeira, esta task não gera commit.
