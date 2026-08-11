# Camada de LLM (core/llm/) — Design Spec

> **Para agentes:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar o plano gerado
> a partir deste spec.

## Estado atual

`src/core/llm/` já existe e não é greenfield: `types.ts`, `gemini.ts`,
`claude.ts`, `router.ts`, `index.ts` implementam `LLMProvider`,
`GeminiProvider`, `ClaudeProvider` e `LLMRouter` com fallback simples
(tenta cada provider em ordem, loga e cai pro próximo em qualquer erro).
`index.ts` já exporta `memorialRouter` e `comuniqueSeRouter`, hoje com a
mesma ordem hardcoded (`[GeminiProvider, ClaudeProvider]`).

Este spec cobre só as lacunas identificadas contra o `CLAUDE.md`, não um
redesenho da camada:

1. Ordem de fallback hardcoded em código, deveria ser configurável por
   caso de uso sem precisar editar `index.ts`.
2. `LLMRouter` cai pro próximo provider em **qualquer** erro, incluindo
   erros que nenhum provider vai resolver (schema/prompt inválido — erro
   do nosso próprio código, não do provider).
3. Nenhum teste na camada.

## Escopo

Dentro:
- `core/llm/config.ts` — parse da ordem de fallback a partir de env vars,
  uma por caso de uso.
- `LLMValidationError` em `types.ts` + validação de request no `LLMRouter`
  antes de tentar qualquer provider.
- Teste unitário do `LLMRouter` com providers fake.
- Atualização do `.env.example` com as novas env vars.

Fora de escopo (empurrado pra depois):
- Qualquer mudança em `GeminiProvider`/`ClaudeProvider` além do que já
  existe — eles continuam "burros", só falam com a API deles.
- Testes de integração reais contra Gemini/Claude (sem chamada de API
  nesta etapa, por decisão explícita).
- Os dois módulos consumidores (Memorial Descritivo, Comunique-se) — esta
  camada só precisa estar pronta para eles, não implementá-los.
- Retry de erros transitórios (429/5xx/rede) — já é responsabilidade do
  SDK de cada provider (`max_retries`), não muda aqui.

## Comportamento observável

### Ordem de fallback configurável

`core/llm/config.ts` exporta uma função que resolve a lista de providers
para um caso de uso a partir de uma env var:

```ts
export function resolverOrdem(
  env: string | undefined,
  providersDisponiveis: Record<string, LLMProvider>,
): LLMProvider[]
```

- Env var ausente ou vazia → default `"gemini,claude"`.
- Env var presente → split por vírgula, trim em cada nome, mapeado pro
  provider correspondente em `providersDisponiveis`.
- Nome de provider desconhecido na env var → lança erro imediatamente
  (fail-fast na inicialização do módulo, não em tempo de requisição).

`index.ts` passa a montar os routers assim:

```ts
const providersDisponiveis = { gemini: new GeminiProvider(), claude: new ClaudeProvider() };

export const memorialRouter = new LLMRouter(
  resolverOrdem(process.env.LLM_ORDER_MEMORIAL, providersDisponiveis),
);
export const comuniqueSeRouter = new LLMRouter(
  resolverOrdem(process.env.LLM_ORDER_COMUNIQUE_SE, providersDisponiveis),
);
```

`.env.example` ganha:
```
LLM_ORDER_MEMORIAL="gemini,claude"
LLM_ORDER_COMUNIQUE_SE="gemini,claude"
```

### Erro de input não tenta nenhum provider

`types.ts` ganha:
```ts
export class LLMValidationError extends Error {}
```

`LLMRouter.extractStructured` valida o request **antes** de entrar no
loop de providers:
- `req.userPrompt.trim()` vazio → `throw new LLMValidationError("userPrompt vazio.")`
- `req.schema` ausente ou `Object.keys(req.schema).length === 0` →
  `throw new LLMValidationError("schema vazio.")`

Essa validação lança direto, sem passar por nenhum provider — nenhuma
chamada de API é feita. Qualquer outro erro (rede, erro da API, JSON
malformado na resposta de um provider) continua o comportamento atual:
loga e cai pro próximo provider da lista; se todos falharem, propaga o
último erro capturado.

`LLMRouter.transcribeAudio` não recebe a mesma validação de schema (não
se aplica), mas mantém seu comportamento atual: se nenhum provider da
lista implementa `transcribeAudio`, lança
`"Nenhum provider disponível suporta transcrição de áudio."` sem tentar
nada.

## Modos de falha

| Cenário | Comportamento |
|---|---|
| `userPrompt` vazio ou só espaços | `LLMValidationError` imediato, nenhuma chamada de API |
| `schema` vazio/ausente | `LLMValidationError` imediato, nenhuma chamada de API |
| Nome de provider inválido em `LLM_ORDER_*` | Erro na inicialização do módulo (fail-fast, não em request) |
| Env var `LLM_ORDER_*` ausente | Default `"gemini,claude"`, sem erro |
| Gemini falha (rede/API/schema malformado na resposta) | Loga, tenta Claude |
| Gemini e Claude falham | Propaga o erro do Claude (último tentado) |
| Nenhum provider na lista suporta `transcribeAudio` | Erro dedicado, sem tentar nada |

## Como se prova que funciona

`core/llm/__tests__/router.test.ts`, providers fake implementando
`LLMProvider` (sem tocar `GeminiProvider`/`ClaudeProvider` reais):

- Sucesso no primeiro provider → não chama o segundo.
- Falha no primeiro (erro genérico) + sucesso no segundo → retorna o
  resultado do segundo, primeiro foi de fato chamado.
- Falha nos dois → propaga o erro do último.
- `userPrompt` vazio → `LLMValidationError`, nenhum provider fake chamado.
- `schema` vazio → `LLMValidationError`, nenhum provider fake chamado.
- `transcribeAudio`: mesmo padrão de fallback (sucesso/falha/propagação).
- `transcribeAudio`: nenhum provider da lista implementa → erro dedicado,
  nenhum provider chamado.

`core/llm/__tests__/config.test.ts`:
- Env var ausente → ordem default `[gemini, claude]`.
- Env var com ordem customizada (`"claude,gemini"`) → ordem respeitada.
- Env var com nome de provider desconhecido → lança erro.

## Decisões

- **Validação de input vive no `LLMRouter`, não nos providers.** Evita
  duplicar a mesma checagem em `GeminiProvider` e `ClaudeProvider`, e
  mantém os providers focados só em falar com a API deles.
- **Detecção por classe de erro dedicada (`LLMValidationError`), não por
  `instanceof` dos tipos de erro de cada SDK.** Acoplar o router aos
  internals do SDK do Gemini/Claude quebraria silenciosamente numa
  atualização de versão desses SDKs. `LLMValidationError` é nosso próprio
  tipo, sob nosso controle.
- **Ordem de fallback via env var, não arquivo de config TS ou tabela no
  banco.** Simples de ajustar em produção (Coolify) sem novo deploy de
  código, consistente com o resto da configuração do projeto (`.env`).
- **Nome de provider desconhecido na env var falha rápido na
  inicialização do módulo**, não na primeira request — um typo em
  `LLM_ORDER_MEMORIAL` não deve esperar o primeiro usuário gerar um
  memorial para ser descoberto.
- **Sem testes de integração real contra Gemini/Claude nesta etapa** —
  decisão explícita do usuário; a suíte não faz chamadas de API.

## Empurrado pra depois

- Módulos consumidores (Memorial Descritivo, Comunique-se) e seus usos
  reais de `memorialRouter`/`comuniqueSeRouter`.
- Testes de integração reais contra as APIs do Gemini/Claude.
- Qualquer lógica de retry/circuit-breaker além do que os SDKs já fazem.
- Observabilidade/métricas de qual provider foi usado por request (hoje
  só tem `console.error` no fallback).
