# Patch 1 — Criação e Upload (Comunique-se + Memorial) — Design

> Primeiro de dois patches curtos que corrigem itens deferidos das revisões finais
> das branches `feature/comunique-se` e `feature/comunique-se-editar-exportar`
> (ver memória `project-comunique-se-followups`). Este patch cobre tudo que
> acontece **durante** a criação de um Comunique-se ou Memorial — o segundo
> patch (spec separado) cobre o que acontece **depois** que a linha já existe
> (downloads, edição de checklist).

**Goal:** Corrigir três problemas do fluxo de criação que afetam tanto
Comunique-se quanto Memorial: codificação base64 síncrona que trava a aba,
ausência de cap no texto enviado à IA, e perda do contexto da linha criada
quando o processamento falha depois de persistir.

**Architecture:** Três mudanças independentes que compartilham o tema
"criação": (1) um helper de codificação assíncrona extraído pra um módulo
compartilhado; (2) uma truncagem simples no texto antes do prompt da IA;
(3) uma classe de erro tipada que carrega o id da linha já persistida,
propagada da camada de pipeline até o formulário via a rota de API e o hook
de mutation, pra permitir fechar o drawer e navegar direto pra ela.

**Tech Stack:** Sem mudança — Next.js App Router, React Query, Zod, Drizzle.

## Global Constraints

- Sem comentários explicando O QUE o código faz — só quando o PORQUÊ não é
  óbvio (CLAUDE.md).
- Nenhuma abstração além do que este patch pede — a classe de erro tipada e
  o helper de base64 são as ÚNICAS extrações novas, e só porque já existiam
  literalmente duplicadas nos dois módulos.
- TDD obrigatório em toda mudança de lógica (Vitest); mudanças de UI sem
  teste automatizado seguem o padrão já estabelecido no resto do módulo
  (cobertura por verificação manual).
- `.env.test` continua isolado do storage de dev (`COMUNIQUE_SE_STORAGE_DIR`,
  `MEMORIAL_STORAGE_DIR`) — não mexer nisso, já está correto.

---

## 1. `arrayBufferParaBase64` síncrono → assíncrono, extraído pra helper compartilhado

**Problema:** A função hoje roda um loop `for...of` com `String.fromCharCode`
byte a byte, duplicada em `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`
e `src/app/dashboard/memorial/gravador-audio.tsx`. Pra um PDF de até 10MB
(o teto de upload do Comunique-se) isso trava a thread principal por tempo
perceptível.

**Solução:** Extrair um helper único em
`src/lib/browser/arraybuffer-para-base64.ts`, usando `FileReader.readAsDataURL`
sobre um `Blob` construído do `ArrayBuffer` — o browser faz a codificação
nativamente (fora da thread de JS síncrono), e o resultado (`data:*/*;base64,`)
é fatiado depois da vírgula pra extrair só o base64. Isso é assíncrono
(`Promise<string>`) mas não bloqueia a thread principal em nenhum ponto,
diferente do loop atual.

Assinatura: `export async function arrayBufferParaBase64(buffer: ArrayBuffer): Promise<string>`.

Os dois call-sites (`novo-comunique-se-form.tsx`'s `onSubmit`, e
`gravador-audio.tsx`'s callback de gravação) passam a importar e `await` essa
função em vez de ter a implementação local.

**Teste:** um teste de unidade no novo arquivo, usando o ambiente jsdom já
configurado no projeto (que expõe `FileReader`/`Blob`), verificando que um
buffer conhecido produz a string base64 esperada.

---

## 2. Cap de ~100.000 caracteres no texto extraído do PDF antes da IA

**Problema:** `src/lib/comunique-se/processar.ts`'s `finalizarProcessamento`
manda o texto extraído inteiro (`extrairTextoPdf`) pro `userPrompt` da IA sem
limite. Um PDF muito denso perto do teto de 10MB pode estourar o context
window de ambos os providers, falhando permanentemente (o retry reenviaria o
mesmo texto).

**Solução:** Truncar o texto extraído num cap fixo de **100.000 caracteres**
antes de montar o `userPrompt`, silenciosamente (sem aviso na UI, por
decisão explícita — ver conversa de brainstorm). Uma constante
`LIMITE_CARACTERES_TEXTO_PDF = 100_000` no topo de `processar.ts`, aplicada
com `texto.slice(0, LIMITE_CARACTERES_TEXTO_PDF)` logo após a checagem de
"PDF sem texto extraível".

**Teste:** um teste que monta um texto sintético maior que o cap e confirma
que o `userPrompt` passado pro `comuniqueSeRouter.extractStructured` (mockado)
recebeu no máximo `LIMITE_CARACTERES_TEXTO_PDF` caracteres.

---

## 3. Erro 500 no pipeline → drawer fecha e leva direto pra linha criada

**Problema:** Em ambos os módulos, quando a etapa de IA/PDF falha DEPOIS que
a linha já foi persistida (`criarComuniqueSeProcessando`/`criarMemorialRascunho`),
o erro que sobe até a rota de API é um `Error` genérico sem o id da linha.
O drawer de criação mostra uma mensagem de erro solta, e o usuário pode
reenviar o formulário e criar uma linha duplicada, quando a linha original já
existe e só precisa do botão "Tentar novamente" (que já existe na página de
detalhe/lista).

**Solução:**

- Novo arquivo `src/lib/erros/criacao-parcial.ts`:
  ```ts
  export class CriacaoParcialError extends Error {
    constructor(message: string, public readonly id: string) {
      super(message);
      this.name = "CriacaoParcialError";
    }
  }
  ```
- `finalizarProcessamento` (comunique-se, `processar.ts`) e `finalizarGeracao`
  (memorial, `gerar.ts`) trocam `throw error;` no catch por
  `throw new CriacaoParcialError(error instanceof Error ? error.message : "Erro ao processar.", id)`
  (usando o `id`/`memorialId` que a função já tem em escopo).
- `POST /api/comunique-se` e `POST /api/memoriais` capturam esse tipo
  especificamente ANTES do catch genérico e incluem o id no corpo:
  ```ts
  } catch (error) {
    if (error instanceof CriacaoParcialError) {
      return NextResponse.json({ error: error.message, id: error.id }, { status: 500 });
    }
    console.error("[POST /api/comunique-se]", error);
    return NextResponse.json({ error: "Erro ao processar o Comunique-se, tente novamente." }, { status: 500 });
  }
  ```
- `useCriarComuniqueSe`/`useCriarMemorial`: o corpo de erro parseado (`ApiErrorBody`)
  ganha um campo opcional `id?: string`; quando presente, a função de request
  lança `new CriacaoParcialError(data.error, data.id)` em vez de `new Error(data.error)`.
- Nos dois formulários (`novo-comunique-se-form.tsx`, `novo-memorial-form.tsx`),
  o `onError` do `criar.mutate` passa a checar
  `error instanceof CriacaoParcialError`: se for, chama `onSuccess()` (fecha o
  drawer, invalida a query da lista — a linha já existe e vai aparecer) e
  `router.push(`/dashboard/comunique-se/${error.id}`)` (ou `/dashboard/memorial/${error.id}`).
  Se não for (erro de rede antes de qualquer persistência, erro de validação
  vindo do 400, etc.), comportamento atual é mantido (`setErro(error.message)`,
  drawer continua aberto).

**Por que isso não precisa de um novo status no Memorial:** o Memorial não
tem status `"erro"` (só `"rascunho"`/`"gerado"`) — e não precisa ganhar um,
porque o retry já funciona checando `status !== "gerado"`. A linha fica em
`"rascunho"`, redirecionamos pra ela, o botão de retry já está lá.

**Teste:** nas duas rotas de API, um teste que força `finalizarProcessamento`/
`finalizarGeracao` a lançar (mock) e confirma que o 500 retornado inclui o
`id` correto. Nos hooks, um teste que confirma que um corpo de erro com `id`
produz uma instância de `CriacaoParcialError` com esse id.

---

## Arquivos tocados

- **Novo:** `src/lib/browser/arraybuffer-para-base64.ts` (+ teste)
- **Novo:** `src/lib/erros/criacao-parcial.ts`
- **Modificado:** `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`
  (usa o helper; `onError` checa `CriacaoParcialError`)
- **Modificado:** `src/app/dashboard/memorial/gravador-audio.tsx` (usa o helper)
- **Modificado:** `src/app/dashboard/memorial/novo-memorial-form.tsx` (`onError`
  checa `CriacaoParcialError`)
- **Modificado:** `src/lib/comunique-se/processar.ts` (cap de texto,
  `CriacaoParcialError` no catch de `finalizarProcessamento`)
- **Modificado:** `src/lib/memorial/gerar.ts` (`CriacaoParcialError` no catch
  de `finalizarGeracao` — hoje esse catch nem existe, precisa ser adicionado)
- **Modificado:** `src/app/api/comunique-se/route.ts` (catch de `CriacaoParcialError`)
- **Modificado:** `src/app/api/memoriais/route.ts` (catch de `CriacaoParcialError`)
- **Modificado:** `src/hooks/use-criar-comunique-se.ts` (lança `CriacaoParcialError`
  quando o corpo de erro traz `id`)
- **Modificado:** `src/hooks/use-criar-memorial.ts` (idem)

## Fora de escopo (fica pro Patch 2 ou depois)

- Downloads (PDF original, modelo exportado) com loading/erro inline.
- Robustez de edição do checklist (`handleAdicionar`/`handleRemover`, key da
  lista manual, cobertura de teste cross-empresa).
- Qualquer mudança de UX no Memorial além do redirect de erro acima (item 3).
