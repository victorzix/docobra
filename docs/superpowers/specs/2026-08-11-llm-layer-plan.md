# Camada de LLM (core/llm/) — Fechamento de Lacunas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar 3 lacunas na camada `core/llm/` já existente (ordem de fallback hardcoded, `LLMRouter` cai pro próximo provider em qualquer erro inclusive erros de input nosso, e zero testes) sem redesenhar nada que já funciona.

**Architecture:** `core/llm/config.ts` (novo) resolve a ordem de fallback por caso de uso a partir de env vars; `LLMRouter.extractStructured` (existente, `src/core/llm/router.ts`) ganha uma validação de request no topo que lança `LLMValidationError` (nova, em `src/core/llm/types.ts`) sem tentar nenhum provider; `index.ts` (existente) passa a montar `memorialRouter`/`comuniqueSeRouter` via `resolverOrdem` em vez de um array hardcoded.

**Tech Stack:** TypeScript, Vitest (testes unitários puros, sem banco, sem chamada de rede — podem rodar em paralelo, `fileParallelism: false` no `vitest.config.ts` é só pros testes de integração de auth contra Postgres real e não afeta esta feature).

## Global Constraints

- Gemini é o provider default, Claude é fallback pago — não muda, não é escopo desta feature.
- Ordem de fallback por caso de uso é configurável (env var), nunca hardcoded no meio do código de negócio.
- Retry de erros transitórios (429/5xx/rede) é responsabilidade do SDK de cada provider (`max_retries`) — não implementar retry aqui.
- `GeminiProvider` e `ClaudeProvider` (`src/core/llm/gemini.ts`, `src/core/llm/claude.ts`) não são modificados nesta feature — eles continuam "burros", só falam com a API deles.
- Sem testes de integração reais contra as APIs do Gemini/Claude nesta etapa — nenhum teste desta feature faz chamada de rede.
- Nome de provider desconhecido numa env var `LLM_ORDER_*` falha fail-fast na inicialização do módulo (import de `core/llm/index.ts`), não na primeira request.
- Env var `LLM_ORDER_*` ausente ou vazia → default `"gemini,claude"`.

---

### Task 1: `LLMValidationError` + validação no `LLMRouter`

**Files:**
- Modify: `src/core/llm/types.ts` (22 linhas hoje)
- Modify: `src/core/llm/router.ts` (44 linhas hoje)
- Test: `src/core/llm/__tests__/router.test.ts` (novo)

**Interfaces:**
- Consumes: `LLMProvider`, `StructuredExtractionRequest`, `StructuredExtractionResult` (já existentes em `types.ts`, sem mudança de forma).
- Produces: `export class LLMValidationError extends Error {}` em `types.ts` — Task 3 não usa isso diretamente, mas o comportamento do `LLMRouter` que Task 3 testa (via `index.ts`) depende desta classe existir e ser lançada corretamente.

- [ ] **Step 1: Escrever os testes do `LLMRouter` (vão falhar — o arquivo de teste nem compila ainda porque `LLMValidationError` não existe)**

Crie `src/core/llm/__tests__/router.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { LLMRouter } from "../router";
import { LLMValidationError } from "../types";
import type { LLMProvider, StructuredExtractionResult } from "../types";

function criarProviderFake(
  nome: string,
  comportamento:
    | { tipo: "sucesso"; resultado: StructuredExtractionResult }
    | { tipo: "falha"; erro: Error },
  comTranscricao = false,
): LLMProvider {
  const provider: LLMProvider = {
    name: nome,
    extractStructured: vi.fn(async () => {
      if (comportamento.tipo === "falha") throw comportamento.erro;
      return comportamento.resultado;
    }),
  };

  if (comTranscricao) {
    provider.transcribeAudio = vi.fn(async () => {
      if (comportamento.tipo === "falha") throw comportamento.erro;
      return `${nome} transcreveu`;
    });
  }

  return provider;
}

describe("LLMRouter.extractStructured", () => {
  const requestValido = { userPrompt: "extraia isso", schema: { type: "object" } };

  it("retorna do primeiro provider sem chamar o segundo", async () => {
    const resultadoEsperado: StructuredExtractionResult = { data: { ok: true }, provider: "p1", raw: {} };
    const provider1 = criarProviderFake("p1", { tipo: "sucesso", resultado: resultadoEsperado });
    const provider2 = criarProviderFake("p2", {
      tipo: "sucesso",
      resultado: { data: {}, provider: "p2", raw: {} },
    });

    const router = new LLMRouter([provider1, provider2]);
    const resultado = await router.extractStructured(requestValido);

    expect(resultado).toBe(resultadoEsperado);
    expect(provider2.extractStructured).not.toHaveBeenCalled();
  });

  it("cai pro segundo provider quando o primeiro falha", async () => {
    const provider1 = criarProviderFake("p1", { tipo: "falha", erro: new Error("p1 caiu") });
    const resultadoEsperado: StructuredExtractionResult = { data: { ok: true }, provider: "p2", raw: {} };
    const provider2 = criarProviderFake("p2", { tipo: "sucesso", resultado: resultadoEsperado });

    const router = new LLMRouter([provider1, provider2]);
    const resultado = await router.extractStructured(requestValido);

    expect(resultado).toBe(resultadoEsperado);
    expect(provider1.extractStructured).toHaveBeenCalledOnce();
  });

  it("propaga o erro do último provider quando todos falham", async () => {
    const erroFinal = new Error("p2 caiu");
    const provider1 = criarProviderFake("p1", { tipo: "falha", erro: new Error("p1 caiu") });
    const provider2 = criarProviderFake("p2", { tipo: "falha", erro: erroFinal });

    const router = new LLMRouter([provider1, provider2]);

    await expect(router.extractStructured(requestValido)).rejects.toBe(erroFinal);
  });

  it("lança LLMValidationError sem chamar nenhum provider quando userPrompt é vazio", async () => {
    const provider1 = criarProviderFake("p1", {
      tipo: "sucesso",
      resultado: { data: {}, provider: "p1", raw: {} },
    });
    const router = new LLMRouter([provider1]);

    await expect(
      router.extractStructured({ userPrompt: "   ", schema: { type: "object" } }),
    ).rejects.toThrow(LLMValidationError);
    expect(provider1.extractStructured).not.toHaveBeenCalled();
  });

  it("lança LLMValidationError sem chamar nenhum provider quando schema é vazio", async () => {
    const provider1 = criarProviderFake("p1", {
      tipo: "sucesso",
      resultado: { data: {}, provider: "p1", raw: {} },
    });
    const router = new LLMRouter([provider1]);

    await expect(
      router.extractStructured({ userPrompt: "extraia isso", schema: {} }),
    ).rejects.toThrow(LLMValidationError);
    expect(provider1.extractStructured).not.toHaveBeenCalled();
  });
});

describe("LLMRouter.transcribeAudio", () => {
  const audio = Buffer.from("fake-audio");

  it("retorna do primeiro provider que suporta transcrição, sem chamar o segundo", async () => {
    const provider1 = criarProviderFake(
      "p1",
      { tipo: "sucesso", resultado: { data: {}, provider: "p1", raw: {} } },
      true,
    );
    const provider2 = criarProviderFake(
      "p2",
      { tipo: "sucesso", resultado: { data: {}, provider: "p2", raw: {} } },
      true,
    );

    const router = new LLMRouter([provider1, provider2]);
    const resultado = await router.transcribeAudio(audio, "audio/wav");

    expect(resultado).toBe("p1 transcreveu");
    expect(provider2.transcribeAudio).not.toHaveBeenCalled();
  });

  it("cai pro segundo provider quando o primeiro falha na transcrição", async () => {
    const provider1 = criarProviderFake("p1", { tipo: "falha", erro: new Error("p1 caiu") }, true);
    const provider2 = criarProviderFake(
      "p2",
      { tipo: "sucesso", resultado: { data: {}, provider: "p2", raw: {} } },
      true,
    );

    const router = new LLMRouter([provider1, provider2]);
    const resultado = await router.transcribeAudio(audio, "audio/wav");

    expect(resultado).toBe("p2 transcreveu");
  });

  it("propaga o erro do último provider quando todos falham na transcrição", async () => {
    const erroFinal = new Error("p2 caiu");
    const provider1 = criarProviderFake("p1", { tipo: "falha", erro: new Error("p1 caiu") }, true);
    const provider2 = criarProviderFake("p2", { tipo: "falha", erro: erroFinal }, true);

    const router = new LLMRouter([provider1, provider2]);

    await expect(router.transcribeAudio(audio, "audio/wav")).rejects.toBe(erroFinal);
  });

  it("lança erro dedicado quando nenhum provider da lista suporta transcrição", async () => {
    const provider1 = criarProviderFake(
      "p1",
      { tipo: "sucesso", resultado: { data: {}, provider: "p1", raw: {} } },
      false,
    );

    const router = new LLMRouter([provider1]);

    await expect(router.transcribeAudio(audio, "audio/wav")).rejects.toThrow(
      "Nenhum provider disponível suporta transcrição de áudio.",
    );
    expect(provider1.extractStructured).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (import de `LLMValidationError` quebra a suíte)**

Run: `npx vitest run src/core/llm/__tests__/router.test.ts`
Expected: FAIL — erro de import/compilação, `LLMValidationError` não existe em `../types`. Os testes de fallback (que não dependem de `LLMValidationError`) também devem falhar nesse ponto porque o arquivo inteiro não compila.

- [ ] **Step 3: Adicionar `LLMValidationError` em `types.ts`**

No final de `src/core/llm/types.ts` (depois da interface `LLMProvider`, linha 21), adicione:

```ts

export class LLMValidationError extends Error {}
```

- [ ] **Step 4: Adicionar a validação no topo de `LLMRouter.extractStructured`**

Em `src/core/llm/router.ts`, troque o import do topo:

```ts
import type {
  LLMProvider,
  StructuredExtractionRequest,
  StructuredExtractionResult,
} from "./types";
```

por:

```ts
import type {
  LLMProvider,
  StructuredExtractionRequest,
  StructuredExtractionResult,
} from "./types";
import { LLMValidationError } from "./types";
```

E no início do corpo de `extractStructured` (logo depois de `async extractStructured<T = unknown>(req: StructuredExtractionRequest): Promise<StructuredExtractionResult<T>> {`, antes de `let lastError: unknown;`), adicione:

```ts
    if (!req.userPrompt.trim()) {
      throw new LLMValidationError("userPrompt vazio.");
    }
    if (!req.schema || Object.keys(req.schema).length === 0) {
      throw new LLMValidationError("schema vazio.");
    }

```

O resto do método (`transcribeAudio` incluído) não muda.

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/core/llm/__tests__/router.test.ts`
Expected: PASS — 9 testes (5 em `extractStructured`, 4 em `transcribeAudio`).

- [ ] **Step 6: Commit**

```bash
git add src/core/llm/types.ts src/core/llm/router.ts src/core/llm/__tests__/router.test.ts
git commit -m "feat: validate LLMRouter request before trying providers"
```

---

### Task 2: `core/llm/config.ts` — ordem de fallback configurável

**Files:**
- Create: `src/core/llm/config.ts`
- Test: `src/core/llm/__tests__/config.test.ts` (novo)

**Interfaces:**
- Consumes: `LLMProvider` (de `./types`, sem mudança de forma).
- Produces: `export function resolverOrdem(env: string | undefined, providersDisponiveis: Record<string, LLMProvider>): LLMProvider[]` — Task 3 importa e chama esta função exatamente com essa assinatura.

- [ ] **Step 1: Escrever os testes (vão falhar — o módulo não existe ainda)**

Crie `src/core/llm/__tests__/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { resolverOrdem } from "../config";
import type { LLMProvider } from "../types";

function providerFake(nome: string): LLMProvider {
  return {
    name: nome,
    extractStructured: async () => ({ data: {}, provider: nome, raw: {} }),
  };
}

describe("resolverOrdem", () => {
  const gemini = providerFake("gemini");
  const claude = providerFake("claude");
  const providersDisponiveis = { gemini, claude };

  it("usa a ordem default gemini,claude quando a env var está ausente", () => {
    const ordem = resolverOrdem(undefined, providersDisponiveis);
    expect(ordem).toEqual([gemini, claude]);
  });

  it("usa a ordem default gemini,claude quando a env var está vazia", () => {
    const ordem = resolverOrdem("", providersDisponiveis);
    expect(ordem).toEqual([gemini, claude]);
  });

  it("respeita a ordem customizada da env var", () => {
    const ordem = resolverOrdem("claude,gemini", providersDisponiveis);
    expect(ordem).toEqual([claude, gemini]);
  });

  it("aceita espaços em torno dos nomes", () => {
    const ordem = resolverOrdem(" claude , gemini ", providersDisponiveis);
    expect(ordem).toEqual([claude, gemini]);
  });

  it("lança erro quando a env var cita um provider desconhecido", () => {
    expect(() => resolverOrdem("gemini,openai", providersDisponiveis)).toThrow(
      'Provider desconhecido em LLM_ORDER: "openai"',
    );
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/core/llm/__tests__/config.test.ts`
Expected: FAIL — `Cannot find module '../config'` (ou equivalente).

- [ ] **Step 3: Implementar `config.ts`**

Crie `src/core/llm/config.ts`:

```ts
import type { LLMProvider } from "./types";

export function resolverOrdem(
  env: string | undefined,
  providersDisponiveis: Record<string, LLMProvider>,
): LLMProvider[] {
  const valor = env?.trim() ? env : "gemini,claude";
  const nomes = valor.split(",").map((nome) => nome.trim());

  return nomes.map((nome) => {
    const provider = providersDisponiveis[nome];
    if (!provider) {
      throw new Error(`Provider desconhecido em LLM_ORDER: "${nome}"`);
    }
    return provider;
  });
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/core/llm/__tests__/config.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/config.ts src/core/llm/__tests__/config.test.ts
git commit -m "feat: add resolverOrdem to configure LLM fallback order via env var"
```

---

### Task 3: Ligar `resolverOrdem` em `index.ts` + `.env.example`

**Files:**
- Modify: `src/core/llm/index.ts` (12 linhas hoje)
- Modify: `.env.example` (raiz do projeto)
- Test: `src/core/llm/__tests__/index.test.ts` (novo)

**Interfaces:**
- Consumes: `resolverOrdem` (Task 2, `./config`), `GeminiProvider`/`ClaudeProvider`/`LLMRouter` (já existentes, sem mudança de forma).
- Produces: `memorialRouter`, `comuniqueSeRouter` (já existiam como export, tipo não muda — continuam `LLMRouter`). Nenhuma task futura depende de forma nova aqui.

**Por que o teste usa mocks:** `GeminiProvider`/`ClaudeProvider` instanciam clients reais dos SDKs (`GoogleGenAI`, `Anthropic`) no construtor, que podem exigir uma API key válida no ambiente. Testar a árvore de wiring de `index.ts` sem mockar esses dois módulos exigiria chaves de API reais (ou pelo menos presentes) só pra rodar o teste — não é isso que estamos testando aqui (a lógica de wiring, não os providers reais), então os módulos `../gemini` e `../claude` são mockados.

- [ ] **Step 1: Escrever o teste de wiring (vai falhar — env vars ainda não são lidas)**

Crie `src/core/llm/__tests__/index.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../gemini", () => ({
  GeminiProvider: class {
    name = "gemini";
    extractStructured = vi.fn();
  },
}));

vi.mock("../claude", () => ({
  ClaudeProvider: class {
    name = "claude";
    extractStructured = vi.fn();
  },
}));

const ENV_VARS = ["LLM_ORDER_MEMORIAL", "LLM_ORDER_COMUNIQUE_SE"] as const;

describe("core/llm/index wiring", () => {
  const originais: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const chave of ENV_VARS) originais[chave] = process.env[chave];
    vi.resetModules();
  });

  afterEach(() => {
    for (const chave of ENV_VARS) {
      const valorOriginal = originais[chave];
      if (valorOriginal === undefined) delete process.env[chave];
      else process.env[chave] = valorOriginal;
    }
  });

  it("usa a ordem default gemini,claude pros dois routers quando as env vars estão ausentes", async () => {
    delete process.env.LLM_ORDER_MEMORIAL;
    delete process.env.LLM_ORDER_COMUNIQUE_SE;

    const { memorialRouter, comuniqueSeRouter, LLMRouter } = await import("../index");

    expect(memorialRouter).toBeInstanceOf(LLMRouter);
    // acessa o campo privado `providers` via cast pra any — aceitável só em teste
    expect((memorialRouter as any).providers.map((p: any) => p.name)).toEqual(["gemini", "claude"]);
    expect((comuniqueSeRouter as any).providers.map((p: any) => p.name)).toEqual(["gemini", "claude"]);
  });

  it("respeita LLM_ORDER_MEMORIAL e LLM_ORDER_COMUNIQUE_SE independentemente", async () => {
    process.env.LLM_ORDER_MEMORIAL = "claude,gemini";
    process.env.LLM_ORDER_COMUNIQUE_SE = "gemini,claude";

    const { memorialRouter, comuniqueSeRouter } = await import("../index");

    expect((memorialRouter as any).providers.map((p: any) => p.name)).toEqual(["claude", "gemini"]);
    expect((comuniqueSeRouter as any).providers.map((p: any) => p.name)).toEqual(["gemini", "claude"]);
  });

  it("lança erro na inicialização quando a env var cita um provider desconhecido", async () => {
    process.env.LLM_ORDER_MEMORIAL = "gemini,openai";

    await expect(import("../index")).rejects.toThrow(
      'Provider desconhecido em LLM_ORDER: "openai"',
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/core/llm/__tests__/index.test.ts`
Expected: FAIL — os dois primeiros testes falham porque `index.ts` ainda ignora as env vars (ordem sempre `[gemini, claude]` fixa); o terceiro falha porque nada lança erro hoje.

- [ ] **Step 3: Atualizar `index.ts`**

Substitua todo o conteúdo de `src/core/llm/index.ts` por:

```ts
import { GeminiProvider } from "./gemini";
import { ClaudeProvider } from "./claude";
import { LLMRouter } from "./router";
import { resolverOrdem } from "./config";

export * from "./types";
export { GeminiProvider, ClaudeProvider, LLMRouter, resolverOrdem };

const providersDisponiveis = {
  gemini: new GeminiProvider(),
  claude: new ClaudeProvider(),
};

export const memorialRouter = new LLMRouter(
  resolverOrdem(process.env.LLM_ORDER_MEMORIAL, providersDisponiveis),
);
export const comuniqueSeRouter = new LLMRouter(
  resolverOrdem(process.env.LLM_ORDER_COMUNIQUE_SE, providersDisponiveis),
);
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/core/llm/__tests__/index.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 5: Atualizar `.env.example`**

Em `.env.example`, depois da linha `ANTHROPIC_API_KEY=""` (dentro do bloco "Camada de LLM"), adicione:

```
LLM_ORDER_MEMORIAL="gemini,claude"
LLM_ORDER_COMUNIQUE_SE="gemini,claude"
```

- [ ] **Step 6: Rodar a suíte inteira e o typecheck pra confirmar que nada quebrou**

Run: `npm test`
Expected: PASS — todos os testes de auth (26) + os novos desta feature (9 + 5 + 3 = 17) verdes, 43 no total.

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/core/llm/index.ts .env.example src/core/llm/__tests__/index.test.ts
git commit -m "feat: wire memorialRouter/comuniqueSeRouter to configurable fallback order"
```
