# Patch 1 — Criação e Upload (Comunique-se + Memorial) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir três problemas do fluxo de criação que afetam tanto
Comunique-se quanto Memorial: codificação base64 síncrona que trava a aba,
ausência de cap no texto enviado à IA, e perda do contexto da linha criada
quando o processamento falha depois de persistir.

**Architecture:** Um helper de codificação assíncrona compartilhado
substitui a função duplicada nos dois módulos; uma truncagem simples é
aplicada ao texto do Comunique-se antes do prompt da IA; uma classe de erro
tipada (`CriacaoParcialError`) carrega o id da linha já persistida, da
camada de pipeline até o formulário, via a rota de API e o hook de mutation.

**Tech Stack:** Next.js App Router, React Query, Vitest (`environment: "node"`,
ver Global Constraints), Drizzle.

## Global Constraints

- Sem comentários explicando O QUE o código faz — só quando o PORQUÊ não é
  óbvio (CLAUDE.md).
- **Desvio do spec aprovado, decidido ao escrever este plano:** o spec
  (`docs/superpowers/specs/2026-08-21-comunique-se-patch1-criacao-design.md`)
  descreve o helper de base64 usando `FileReader.readAsDataURL`. O
  `vitest.config.ts` deste projeto roda com `environment: "node"` (sem
  jsdom instalado), e `FileReader` não existe em Node — só em browser/jsdom.
  Em vez de adicionar `jsdom` como dependência nova só pra isso (fora de
  escopo deste patch), o helper usa uma abordagem puramente JS que roda
  igual em Node e browser: processa o `ArrayBuffer` em chunks de 32KB
  (evita o pico de `String.fromCharCode(...array gigante)` que estoura a
  stack), cedendo o event loop entre chunks via `setTimeout(resolve, 0)`
  (não trava a thread principal), e usa `btoa` (global em Node 16+ e em
  todo browser) só uma vez no final. Resultado observável idêntico ao
  pedido no spec (assíncrono, não bloqueia, sem dependência nova) — só a
  técnica interna mudou, testável no ambiente Node já configurado.
- `CriacaoParcialError` preserva a mensagem do erro original — os testes
  já existentes que fazem `.rejects.toThrow("<mensagem original>")` em
  `src/lib/comunique-se/__tests__/processar.test.ts` e
  `src/lib/memorial/__tests__/gerar.test.ts` continuam passando sem
  modificação (checar isso explicitamente no passo de cada task que toca
  esses arquivos).
- Nenhuma abstração além da listada no spec — `CriacaoParcialError` e o
  helper de base64 são as únicas extrações novas.
- Hooks e componentes de formulário deste módulo não têm teste automatizado
  hoje (`src/hooks/__tests__` não existe pra nenhum hook de criação) — as
  tasks que tocam hooks/formulários seguem esse padrão já estabelecido, sem
  introduzir o primeiro teste de hook do projeto. Cobertura vem da task
  final de verificação manual.

---

### Task 1: Helper de base64 assíncrono, chunked, compartilhado

**Files:**
- Create: `src/lib/browser/arraybuffer-para-base64.ts`
- Test: `src/lib/browser/__tests__/arraybuffer-para-base64.test.ts`
- Modify: `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`
- Modify: `src/app/dashboard/memorial/gravador-audio.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `export async function arrayBufferParaBase64(buffer: ArrayBuffer): Promise<string>`.
  Nenhuma task futura deste plano consome diretamente (é folha), mas os dois
  componentes acima passam a importar essa versão em vez da cópia local.

- [ ] **Step 1: Escrever o teste (vai falhar — o módulo não existe)**

Crie `src/lib/browser/__tests__/arraybuffer-para-base64.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { arrayBufferParaBase64 } from "../arraybuffer-para-base64";

describe("arrayBufferParaBase64", () => {
  it("codifica um buffer pequeno corretamente", async () => {
    const buffer = new TextEncoder().encode("Olá, DocObra!").buffer;

    const resultado = await arrayBufferParaBase64(buffer);

    expect(resultado).toBe(Buffer.from("Olá, DocObra!").toString("base64"));
  });

  it("codifica um buffer vazio como string vazia", async () => {
    const resultado = await arrayBufferParaBase64(new ArrayBuffer(0));

    expect(resultado).toBe("");
  });

  it("codifica um buffer maior que um chunk (32KB) sem perder bytes", async () => {
    const tamanho = 32_768 * 2 + 500; // atravessa 2 chunks inteiros + resto
    const bytes = new Uint8Array(tamanho);
    for (let i = 0; i < tamanho; i++) {
      bytes[i] = i % 256;
    }

    const resultado = await arrayBufferParaBase64(bytes.buffer);

    expect(resultado).toBe(Buffer.from(bytes).toString("base64"));
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/browser/__tests__/arraybuffer-para-base64.test.ts`
Expected: FAIL — `Cannot find module '../arraybuffer-para-base64'`.

- [ ] **Step 3: Implementar o helper**

Crie `src/lib/browser/arraybuffer-para-base64.ts`:

```ts
const TAMANHO_CHUNK = 32_768;

export async function arrayBufferParaBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binario = "";

  for (let offset = 0; offset < bytes.length; offset += TAMANHO_CHUNK) {
    const chunk = bytes.subarray(offset, offset + TAMANHO_CHUNK);
    binario += String.fromCharCode(...chunk);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return btoa(binario);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/browser/__tests__/arraybuffer-para-base64.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 5: Atualizar `novo-comunique-se-form.tsx` pra usar o helper**

Em `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`, remova a
função local `arrayBufferParaBase64` (linhas 26-33) e adicione o import:

```ts
import { arrayBufferParaBase64 } from "@/lib/browser/arraybuffer-para-base64";
```

(junto dos outros imports no topo, mantendo a ordem: libs externas primeiro,
depois `@/` internos, como já está no arquivo)

Troque a linha dentro de `onSubmit`:

```ts
      const pdfBase64 = arrayBufferParaBase64(await arquivo.arrayBuffer());
```

por:

```ts
      const pdfBase64 = await arrayBufferParaBase64(await arquivo.arrayBuffer());
```

- [ ] **Step 6: Atualizar `gravador-audio.tsx` pra usar o helper**

Em `src/app/dashboard/memorial/gravador-audio.tsx`, remova a função local
`arrayBufferParaBase64` (linhas 41-48) e adicione o import:

```ts
import { arrayBufferParaBase64 } from "@/lib/browser/arraybuffer-para-base64";
```

Troque a linha dentro de `recorder.onstop` (já é uma arrow function `async`):

```ts
      onGravado(arrayBufferParaBase64(buffer), mimeType);
```

por:

```ts
      onGravado(await arrayBufferParaBase64(buffer), mimeType);
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros novos nos dois arquivos tocados.

- [ ] **Step 8: Commit**

```bash
git add src/lib/browser src/app/dashboard/comunique-se/novo-comunique-se-form.tsx src/app/dashboard/memorial/gravador-audio.tsx
git commit -m "feat: extract async chunked base64 helper, remove blocking main-thread loop"
```

---

### Task 2: Cap de ~100.000 caracteres no texto extraído do PDF antes da IA

**Files:**
- Modify: `src/lib/comunique-se/processar.ts`
- Modify: `src/lib/comunique-se/__tests__/processar.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada consumido por outras tasks (mudança interna de
  `finalizarProcessamento`).

- [ ] **Step 1: Escrever o teste (vai falhar — sem cap ainda)**

Este arquivo NÃO mocka `extrairTextoPdf` — os testes existentes usam PDFs
reais gerados via Puppeteer (helper `gerarPdfDeTeste`, já no arquivo) e a
extração de texto real (`pdf-parse`). Siga o mesmo padrão: gere um PDF real
com um parágrafo bem maior que o cap, extraia o texto de verdade (pra saber
o tamanho ANTES da truncagem) e confirme que o prompt que chega na IA
(mockada) foi cortado em exatamente 100.000 caracteres.

Adicione o import no topo do arquivo, junto dos já existentes:

```ts
import { extrairTextoPdf } from "../extrair-texto";
```

E adicione, dentro do describe `processarComuniqueSe`:

```ts
  it("trunca o texto extraído em 100.000 caracteres antes de mandar pra IA", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdf = await gerarPdfDeTeste(`<p>${"a".repeat(150_000)}</p>`);
    const textoCompleto = await extrairTextoPdf(pdf);
    expect(textoCompleto.length).toBeGreaterThan(100_000);

    vi.mocked(comuniqueSeRouter.extractStructured).mockResolvedValue({
      data: { itens: [{ descricao: "Item" }] },
      provider: "fake",
      raw: {},
    });

    await processarComuniqueSe({
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      pdfBuffer: pdf,
    });

    const chamada = vi.mocked(comuniqueSeRouter.extractStructured).mock.calls[0][0];
    expect(chamada.userPrompt.length).toBe(100_000);
    expect(chamada.userPrompt).toBe(textoCompleto.slice(0, 100_000));
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/comunique-se/__tests__/processar.test.ts`
Expected: FAIL — `chamada.userPrompt.length` é igual a `textoCompleto.length`
(sem corte), não `100000`.

- [ ] **Step 3: Implementar o cap**

Em `src/lib/comunique-se/processar.ts`, adicione a constante logo depois dos
imports:

```ts
const LIMITE_CARACTERES_TEXTO_PDF = 100_000;
```

Dentro de `finalizarProcessamento`, troque:

```ts
    const texto = await extrairTextoPdf(pdfBuffer);
    if (!texto) {
      throw new Error("PDF sem texto extraível.");
    }
```

por:

```ts
    const textoBruto = await extrairTextoPdf(pdfBuffer);
    if (!textoBruto) {
      throw new Error("PDF sem texto extraível.");
    }
    const texto = textoBruto.slice(0, LIMITE_CARACTERES_TEXTO_PDF);
```

(a variável `texto` continua sendo usada em `userPrompt: texto` logo abaixo,
sem outra mudança nessa chamada)

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/comunique-se/__tests__/processar.test.ts`
Expected: PASS — todos os testes do arquivo, incluindo o novo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comunique-se/processar.ts src/lib/comunique-se/__tests__/processar.test.ts
git commit -m "feat: cap extracted PDF text at 100k chars before sending to LLM"
```

---

### Task 3: Classe `CriacaoParcialError`

**Files:**
- Create: `src/lib/erros/criacao-parcial.ts`
- Test: `src/lib/erros/__tests__/criacao-parcial.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export class CriacaoParcialError extends Error { constructor(message: string, id: string); readonly id: string; }`.
  Tasks 4, 5, 6, 7, 8, 9 usam essa classe.

- [ ] **Step 1: Escrever o teste (vai falhar — a classe não existe)**

Crie `src/lib/erros/__tests__/criacao-parcial.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CriacaoParcialError } from "../criacao-parcial";

describe("CriacaoParcialError", () => {
  it("carrega a mensagem e o id, e é uma instância de Error", () => {
    const erro = new CriacaoParcialError("Erro ao processar.", "abc-123");

    expect(erro).toBeInstanceOf(Error);
    expect(erro.message).toBe("Erro ao processar.");
    expect(erro.id).toBe("abc-123");
    expect(erro.name).toBe("CriacaoParcialError");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/erros/__tests__/criacao-parcial.test.ts`
Expected: FAIL — `Cannot find module '../criacao-parcial'`.

- [ ] **Step 3: Implementar a classe**

Crie `src/lib/erros/criacao-parcial.ts`:

```ts
export class CriacaoParcialError extends Error {
  constructor(
    message: string,
    public readonly id: string,
  ) {
    super(message);
    this.name = "CriacaoParcialError";
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/erros/__tests__/criacao-parcial.test.ts`
Expected: PASS — 1 teste.

- [ ] **Step 5: Commit**

```bash
git add src/lib/erros
git commit -m "feat: add CriacaoParcialError to carry a persisted row id on pipeline failure"
```

---

### Task 4: Comunique-se — `finalizarProcessamento` lança `CriacaoParcialError`

**Files:**
- Modify: `src/lib/comunique-se/processar.ts`
- Modify: `src/lib/comunique-se/__tests__/processar.test.ts`

**Interfaces:**
- Consumes: `CriacaoParcialError` (Task 3).
- Produces: `processarComuniqueSe`/`reprocessarComuniqueSe` agora rejeitam
  com `CriacaoParcialError` (mesma mensagem de antes) em vez de `Error`
  genérico, quando a falha acontece depois da linha já persistida. Task 6
  usa isso.

- [ ] **Step 1: Escrever o teste (vai falhar — ainda lança `Error` puro)**

Em `src/lib/comunique-se/__tests__/processar.test.ts`, adicione o import no
topo (junto dos já existentes):

```ts
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
```

E adicione, dentro do describe `processarComuniqueSe`:

```ts
  it("lança CriacaoParcialError com o id da linha já persistida quando a IA falha", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdf = await gerarPdfDeTeste("<p>Exigencia numero um: apresentar ART.</p>");
    vi.mocked(comuniqueSeRouter.extractStructured).mockRejectedValue(new Error("LLM indisponível"));

    let erroCapturado: unknown;
    try {
      await processarComuniqueSe({
        projetoId: novoProjeto.id,
        empresaId: novaEmpresa.id,
        pdfBuffer: pdf,
      });
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeInstanceOf(CriacaoParcialError);
    expect((erroCapturado as CriacaoParcialError).message).toBe("LLM indisponível");
    const [linha] = await db.select().from(comuniqueSe);
    expect((erroCapturado as CriacaoParcialError).id).toBe(linha.id);
  });
```

`gerarPdfDeTeste` é o helper já existente no topo do arquivo (usa Puppeteer
pra gerar um PDF real) — reaproveite-o, não redeclare.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/comunique-se/__tests__/processar.test.ts`
Expected: FAIL — `erroCapturado` é um `Error` comum, não `CriacaoParcialError`
(`toBeInstanceOf(CriacaoParcialError)` falha).

- [ ] **Step 3: Implementar a mudança**

Em `src/lib/comunique-se/processar.ts`, adicione o import:

```ts
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
```

Troque o catch de `finalizarProcessamento`:

```ts
  } catch (error) {
    await marcarComoErro(id);
    throw error;
  }
```

por:

```ts
  } catch (error) {
    await marcarComoErro(id);
    throw new CriacaoParcialError(error instanceof Error ? error.message : "Erro ao processar.", id);
  }
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/comunique-se/__tests__/processar.test.ts`
Expected: PASS — todos os testes do arquivo, incluindo os já existentes que
fazem `.rejects.toThrow("LLM indisponível")` e `.rejects.toThrow("PDF sem
texto extraível.")` (continuam passando porque `CriacaoParcialError`
preserva a mensagem original) e o novo teste deste passo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comunique-se/processar.ts src/lib/comunique-se/__tests__/processar.test.ts
git commit -m "feat: throw CriacaoParcialError from comunique-se pipeline on post-persist failure"
```

---

### Task 5: Memorial — `finalizarGeracao` ganha catch e lança `CriacaoParcialError`

**Files:**
- Modify: `src/lib/memorial/gerar.ts`
- Modify: `src/lib/memorial/__tests__/gerar.test.ts`

**Interfaces:**
- Consumes: `CriacaoParcialError` (Task 3).
- Produces: `gerarMemorial`/`regerarMemorial` agora rejeitam com
  `CriacaoParcialError` (mesma mensagem de antes) em vez de `Error`
  genérico. Task 7 usa isso.

- [ ] **Step 1: Escrever o teste (vai falhar — ainda lança `Error` puro)**

Em `src/lib/memorial/__tests__/gerar.test.ts`, adicione o import no topo:

```ts
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
```

Troque o teste existente "propaga o erro e deixa o registro em rascunho
quando o LLM falha" (linhas 129-143) — mantendo a mesma configuração de
mock e a mesma asserção de status, mas capturando o erro pra checar o tipo:

```ts
  it("propaga CriacaoParcialError e deixa o registro em rascunho quando o LLM falha", async () => {
    const novoProjeto = await criarProjetoDeTeste();
    vi.mocked(memorialRouter.extractStructured).mockRejectedValue(new Error("LLM indisponível"));

    let erroCapturado: unknown;
    try {
      await gerarMemorial(
        { projetoId: novoProjeto.id, tipoConstrucao: "residencial", modoEspecificacoes: "texto" },
        { ...CONTEXTO, empresaId: novoProjeto.empresaId },
      );
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeInstanceOf(CriacaoParcialError);
    expect((erroCapturado as CriacaoParcialError).message).toBe("LLM indisponível");

    const [linha] = await db.select().from(memorialDescritivo);
    expect(linha.status).toBe("rascunho");
    expect(linha.documentoGeradoUrl).toBeNull();
    expect((erroCapturado as CriacaoParcialError).id).toBe(linha.id);
  });
```

Não mexa no outro teste de falha ("modo áudio: se a prosa falhar...",
linhas 145-173) — ele continua com `.rejects.toThrow(...)`, que também
funciona sem mudança nenhuma (ver Global Constraints).

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/memorial/__tests__/gerar.test.ts`
Expected: FAIL — só o teste reescrito neste passo falha (`erroCapturado`
ainda é `Error` comum), o resto do arquivo passa normalmente.

- [ ] **Step 3: Implementar a mudança**

Em `src/lib/memorial/gerar.ts`, adicione o import:

```ts
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
```

Troque a função `finalizarGeracao` inteira (assinatura e corpo idênticos ao
que já existe, só envolvidos num `try/catch` novo) por:

```ts
async function finalizarGeracao(
  memorialId: string,
  numero: number,
  respostas: RespostasParaGeracao,
  contexto: ContextoMemorial,
): Promise<ResultadoGeracao> {
  try {
    const dadosParaProsa = {
      projeto: contexto.projetoNome,
      endereco: contexto.projetoEndereco ?? undefined,
      tipoConstrucao: respostas.tipoConstrucao,
      numeroPavimentos: respostas.numeroPavimentos,
      areaConstruida: respostas.areaConstruida,
      areaTerreno: respostas.areaTerreno,
      especificacoes: respostas.especificacoes,
    };

    const prosa = await memorialRouter.extractStructured<{
      descricaoGeral: string;
      especificacoesTecnicas: string;
    }>({
      systemPrompt:
        "Você é um engenheiro redigindo um memorial descritivo técnico em português formal, seguindo a norma ABNT. " +
        "Refira-se ao projeto pelo nome informado — nunca inclua identificadores técnicos (IDs, UUIDs) no texto.",
      userPrompt: JSON.stringify(dadosParaProsa),
      schema: SCHEMA_PROSA,
    });

    const html = gerarHtmlMemorial({
      referencia: referenciaMemorial(numero),
      projetoNome: contexto.projetoNome,
      projetoEndereco: contexto.projetoEndereco,
      empresaNome: contexto.empresaNome,
      usuarioNome: contexto.usuarioNome,
      tipoConstrucao: respostas.tipoConstrucao,
      numeroPavimentos: respostas.numeroPavimentos,
      areaConstruida: respostas.areaConstruida,
      areaTerreno: respostas.areaTerreno,
      descricaoGeral: prosa.data.descricaoGeral,
      especificacoesTecnicas: prosa.data.especificacoesTecnicas,
    });

    const pdfBuffer = await gerarPdf(html);
    await salvarArquivo(`${memorialId}.pdf`, pdfBuffer);
    const documentoGeradoUrl = `/api/memoriais/${memorialId}/pdf`;

    await marcarComoGerado(memorialId, { documentoGeradoUrl });

    return { id: memorialId, numero, status: "gerado", documentoGeradoUrl };
  } catch (error) {
    throw new CriacaoParcialError(error instanceof Error ? error.message : "Erro ao gerar o memorial.", memorialId);
  }
}
```

Nenhuma linha do corpo original mudou — só o `try {` logo depois da
assinatura e o `catch` no lugar do fechamento da função, com o corpo
original indentado um nível a mais.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/memorial/__tests__/gerar.test.ts`
Expected: PASS — todos os testes do arquivo, incluindo o teste reescrito
neste passo e o outro teste de falha ("modo áudio: se a prosa falhar...",
que segue passando via `.rejects.toThrow("LLM indisponível")` sem
modificação).

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorial/gerar.ts src/lib/memorial/__tests__/gerar.test.ts
git commit -m "feat: throw CriacaoParcialError from memorial pipeline on post-persist failure"
```

---

### Task 6: Rota `POST /api/comunique-se` inclui o id no corpo do 500

**Files:**
- Modify: `src/app/api/comunique-se/route.ts`
- Modify: `src/app/api/comunique-se/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `CriacaoParcialError` (Task 3), `processarComuniqueSe`/`criarComuniqueSeManual`
  agora podem rejeitar com esse tipo (Task 4).
- Produces: `POST /api/comunique-se` retorna `{ error, id }` (status 500)
  quando a causa é `CriacaoParcialError`, mantendo o corpo genérico de hoje
  pra qualquer outro erro. Task 8 usa esse campo `id`.

- [ ] **Step 1: Escrever o teste (vai falhar — a rota não inclui `id` ainda)**

Em `src/app/api/comunique-se/__tests__/route.test.ts`, adicione o import no
topo:

```ts
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
```

E adicione, no describe `POST /api/comunique-se`, logo depois do teste
existente "retorna 500 quando processarComuniqueSe lança":

```ts
  it("retorna 500 com o id da linha quando processarComuniqueSe lança CriacaoParcialError", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(processarComuniqueSe).mockRejectedValue(new CriacaoParcialError("falhou", "linha-123"));

    const response = await POST(
      criarRequestPost({ modoCriacao: "pdf", projetoId, pdfBase64: PDF_BASE64_FAKE }, token),
    );

    expect(response.status).toBe(500);
    const corpo = await response.json();
    expect(corpo.id).toBe("linha-123");
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/api/comunique-se/__tests__/route.test.ts`
Expected: FAIL — `corpo.id` é `undefined`.

- [ ] **Step 3: Implementar a mudança**

Em `src/app/api/comunique-se/route.ts`, adicione o import:

```ts
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
```

Troque o catch do `POST`:

```ts
  } catch (error) {
    console.error("[POST /api/comunique-se]", error);
    return NextResponse.json({ error: "Erro ao processar o Comunique-se, tente novamente." }, { status: 500 });
  }
```

por:

```ts
  } catch (error) {
    if (error instanceof CriacaoParcialError) {
      return NextResponse.json({ error: error.message, id: error.id }, { status: 500 });
    }
    console.error("[POST /api/comunique-se]", error);
    return NextResponse.json({ error: "Erro ao processar o Comunique-se, tente novamente." }, { status: 500 });
  }
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/app/api/comunique-se/__tests__/route.test.ts`
Expected: PASS — todos os testes do arquivo, incluindo o já existente
"retorna 500 quando processarComuniqueSe lança" (que usa um `Error` comum,
sem `id`, e continua caindo no branch genérico) e o novo teste deste passo.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/comunique-se/route.ts src/app/api/comunique-se/__tests__/route.test.ts
git commit -m "feat: include persisted row id in 500 body when pipeline throws CriacaoParcialError"
```

---

### Task 7: Rota `POST /api/memoriais` inclui o id no corpo do 500

**Files:**
- Modify: `src/app/api/memoriais/route.ts`
- Modify: `src/app/api/memoriais/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `CriacaoParcialError` (Task 3), `gerarMemorial` agora pode
  rejeitar com esse tipo (Task 5).
- Produces: `POST /api/memoriais` retorna `{ error, id }` (status 500)
  quando a causa é `CriacaoParcialError`. Task 9 usa esse campo `id`.

- [ ] **Step 1: Escrever o teste (vai falhar — a rota não inclui `id` ainda)**

Em `src/app/api/memoriais/__tests__/route.test.ts`, adicione o import no
topo:

```ts
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
```

E adicione, logo depois do teste existente "retorna 500 quando gerarMemorial
lança":

```ts
  it("retorna 500 com o id da linha quando gerarMemorial lança CriacaoParcialError", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(gerarMemorial).mockRejectedValue(new CriacaoParcialError("falhou", "memorial-123"));

    const response = await POST(
      criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(500);
    const corpo = await response.json();
    expect(corpo.id).toBe("memorial-123");
  });
```

`criarRequest`/`criarSessaoComProjeto` são os helpers já existentes no topo
do arquivo — reaproveite-os, não redeclare.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/api/memoriais/__tests__/route.test.ts`
Expected: FAIL — `corpo.id` é `undefined`.

- [ ] **Step 3: Implementar a mudança**

Em `src/app/api/memoriais/route.ts`, adicione o import:

```ts
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
```

Troque o catch do `POST`:

```ts
  } catch (error) {
    console.error("[POST /api/memoriais]", error);
    return NextResponse.json({ error: "Erro ao gerar o memorial, tente novamente." }, { status: 500 });
  }
```

por:

```ts
  } catch (error) {
    if (error instanceof CriacaoParcialError) {
      return NextResponse.json({ error: error.message, id: error.id }, { status: 500 });
    }
    console.error("[POST /api/memoriais]", error);
    return NextResponse.json({ error: "Erro ao gerar o memorial, tente novamente." }, { status: 500 });
  }
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/app/api/memoriais/__tests__/route.test.ts`
Expected: PASS — todos os testes do arquivo, incluindo o já existente e o
novo.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/memoriais/route.ts src/app/api/memoriais/__tests__/route.test.ts
git commit -m "feat: include persisted row id in 500 body when memorial pipeline throws CriacaoParcialError"
```

---

### Task 8: Hooks `useCriarComuniqueSe`/`useCriarMemorial` lançam `CriacaoParcialError`

**Files:**
- Modify: `src/hooks/use-criar-comunique-se.ts`
- Modify: `src/hooks/use-criar-memorial.ts`

**Interfaces:**
- Consumes: `CriacaoParcialError` (Task 3), campo `id` no corpo de erro
  (Tasks 6, 7).
- Produces: as mutations de `useCriarComuniqueSe`/`useCriarMemorial` agora
  rejeitam com `CriacaoParcialError` (em vez de `Error` genérico) quando o
  corpo de erro da API tem um campo `id`. Task 9 usa isso.

**Sem teste automatizado nesta task** — nenhum hook de criação tem teste
hoje (ver Global Constraints); cobertura vem da verificação manual (Task 10).

- [ ] **Step 1: Atualizar `use-criar-comunique-se.ts`**

Substitua o conteúdo inteiro de `src/hooks/use-criar-comunique-se.ts` por:

```ts
import { useMutation } from "@tanstack/react-query";

import type { CriarComuniqueSeInput } from "@/lib/validations/comunique-se/create.schema";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";

interface ComuniqueSeCriadoResponse {
  comuniqueSe: { id: string; numero: number; status: string; pdfOriginalUrl: string | null };
}

interface ApiErrorBody {
  error: string;
  fields?: Record<string, string[]>;
  id?: string;
}

async function criarComuniqueSeRequest(input: CriarComuniqueSeInput): Promise<ComuniqueSeCriadoResponse> {
  const response = await fetch("/api/comunique-se", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as ComuniqueSeCriadoResponse | ApiErrorBody;

  if (!response.ok) {
    const erro = data as ApiErrorBody;
    if (erro.id) {
      throw new CriacaoParcialError(erro.error, erro.id);
    }
    throw new Error(erro.error);
  }

  return data as ComuniqueSeCriadoResponse;
}

export function useCriarComuniqueSe() {
  return useMutation({ mutationFn: criarComuniqueSeRequest });
}
```

- [ ] **Step 2: Atualizar `use-criar-memorial.ts`**

Substitua o conteúdo inteiro de `src/hooks/use-criar-memorial.ts` por:

```ts
import { useMutation } from "@tanstack/react-query";

import type { CriarMemorialInput } from "@/lib/validations/memorial/create.schema";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";

interface MemorialResponse {
  memorial: { id: string; status: string; documentoGeradoUrl: string | null };
}

interface ApiErrorBody {
  error: string;
  fields?: Record<string, string[]>;
  id?: string;
}

async function criarMemorialRequest(input: CriarMemorialInput): Promise<MemorialResponse> {
  const response = await fetch("/api/memoriais", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as MemorialResponse | ApiErrorBody;

  if (!response.ok) {
    const erro = data as ApiErrorBody;
    if (erro.id) {
      throw new CriacaoParcialError(erro.error, erro.id);
    }
    throw new Error(erro.error);
  }

  return data as MemorialResponse;
}

export function useCriarMemorial() {
  return useMutation({ mutationFn: criarMemorialRequest });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros novos nos dois arquivos.

- [ ] **Step 4: Rodar a suíte inteira (regressão)**

Run: `npm test`
Expected: PASS — nenhum teste existente depende do formato exato de erro
lançado por esses hooks (não têm teste próprio), então nada deveria
quebrar.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-criar-comunique-se.ts src/hooks/use-criar-memorial.ts
git commit -m "feat: throw CriacaoParcialError from creation hooks when API response carries an id"
```

---

### Task 9: Formulários — erro com id fecha o drawer e navega pra linha criada

**Files:**
- Modify: `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`
- Modify: `src/app/dashboard/memorial/novo-memorial-form.tsx`

**Interfaces:**
- Consumes: `CriacaoParcialError` (Task 3), hooks lançando esse tipo
  (Task 8).
- Produces: nada consumido por outras tasks deste plano.

**Sem teste automatizado nesta task** (mesmo padrão do resto da UI destes
dois módulos). Cobertura vem da verificação manual (Task 10).

- [ ] **Step 1: Atualizar `novo-comunique-se-form.tsx`**

Este arquivo já foi tocado pela Task 1 (import do helper de base64,
`await` na linha de `pdfBase64`) — parta do estado atual do arquivo, não do
estado original.

Adicione os imports no topo:

```ts
import { useRouter } from "next/navigation";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
```

Dentro do componente, logo depois da linha `const criar = useCriarComuniqueSe();`,
adicione:

```ts
  const router = useRouter();
```

Troque as DUAS ocorrências (uma no branch `modoCriacao === "pdf"`, outra no
branch manual) de:

```ts
      criar.mutate(parsed.data, {
        onSuccess: () => onSuccess(),
        onError: (error) => setErro(error.message),
      });
```

por:

```ts
      criar.mutate(parsed.data, {
        onSuccess: () => onSuccess(),
        onError: (error) => {
          if (error instanceof CriacaoParcialError) {
            onSuccess();
            router.push(`/dashboard/comunique-se/${error.id}`);
            return;
          }
          setErro(error.message);
        },
      });
```

(o branch manual não tem `return` extra antes dessa chamada — troque
exatamente o bloco `criar.mutate(parsed.data, { onSuccess: () => onSuccess(), onError: (error) => setErro(error.message) });`
onde ele aparecer, nos dois lugares)

- [ ] **Step 2: Atualizar `novo-memorial-form.tsx`**

Adicione os imports no topo:

```ts
import { useRouter } from "next/navigation";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
```

Dentro do componente, logo depois da linha `const criar = useCriarMemorial();`,
adicione:

```ts
  const router = useRouter();
```

Troque:

```ts
    criar.mutate(parsed.data, {
      onSuccess: () => onSuccess(),
      onError: (error) => setErro(error.message),
    });
```

por:

```ts
    criar.mutate(parsed.data, {
      onSuccess: () => onSuccess(),
      onError: (error) => {
        if (error instanceof CriacaoParcialError) {
          onSuccess();
          router.push(`/dashboard/memorial/${error.id}`);
          return;
        }
        setErro(error.message);
      },
    });
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros novos nos dois arquivos.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/comunique-se/novo-comunique-se-form.tsx src/app/dashboard/memorial/novo-memorial-form.tsx
git commit -m "feat: redirect to the persisted row on CriacaoParcialError instead of showing a dead-end error"
```

---

### Task 10: Verificação manual do fluxo completo

**Files:** nenhum (task de verificação — só um commit final se algo
precisar de ajuste).

**Interfaces:** nenhuma — consome tudo das Tasks 1-9.

- [ ] **Step 1: Build e suíte completos**

Run: `npm run build`
Expected: sucesso.

Run: `npm test`
Expected: 100% dos testes passando.

- [ ] **Step 2: Verificar que o upload de PDF grande não trava a UI**

Suba o dev server numa porta alternativa. Com um usuário/projeto já
existentes, no drawer "Novo Comunique-se", modo "Enviar PDF", selecione um
PDF próximo do teto de 10MB (gere um localmente se não tiver um à mão — ex.
um PDF com várias páginas de imagem). Confirme: a aba continua respondendo
(consegue mover o mouse, o spinner de "Processando" gira normalmente)
enquanto o base64 é calculado antes do envio — sem congelamento perceptível.

- [ ] **Step 3: Verificar o cap de texto pra IA**

Não precisa de um PDF realmente gigante pra confirmar isso via UI — a
cobertura principal já é o teste automatizado da Task 2. Só confirme, pelos
logs do servidor durante um upload de PDF real qualquer, que a chamada à IA
segue funcionando normalmente (sem regressão no caminho feliz).

- [ ] **Step 4: Verificar o redirect em caso de falha do pipeline**

Force uma falha na IA (ex.: derrube a rede momentaneamente ou use uma chave
de API inválida temporariamente numa aba de teste) e crie um Comunique-se
via upload de PDF. Confirme: o drawer fecha sozinho, a navegação leva direto
pra `/dashboard/comunique-se/<id>` da linha criada, e o botão "Tentar
novamente" já está visível ali (sem precisar voltar pra lista). Repita o
mesmo teste pro Memorial (`/dashboard/memorial/<id>`).

Restaure a configuração normal da IA depois do teste.

- [ ] **Step 5: Parar o dev server**

Confirme que o processo foi encerrado.

- [ ] **Step 6: Commit final, só se algo precisou de ajuste**

```bash
git add -A
git commit -m "fix: <descrição específica do que a verificação manual encontrou>"
```

Se tudo passou de primeira, esta task não gera commit.
