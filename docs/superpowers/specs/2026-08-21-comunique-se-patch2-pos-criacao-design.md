# Patch 2 — Pós-criação: Downloads e Checklist (Comunique-se) — Design

> Segundo de dois patches curtos que corrigem itens deferidos das revisões
> finais das branches `feature/comunique-se` e `feature/comunique-se-editar-exportar`
> (ver memória `project-comunique-se-followups`). Este patch cobre tudo que
> acontece **depois** que um Comunique-se já existe — o Patch 1 (spec
> separado) cobre o fluxo de criação em si (comunique-se + memorial). Este
> patch é comunique-se-only.

**Goal:** Dar feedback visual real nos dois downloads da página de detalhe
(PDF original, modelo exportado) e fechar quatro lacunas pequenas de
robustez na edição do checklist.

**Architecture:** Um componente cliente compartilhado (`DownloadButton`)
substitui os dois `<a href>` da página de detalhe, encapsulando fetch +
estado de carregamento + download via blob + erro inline. As correções de
robustez do checklist são mudanças pontuais e independentes dentro de
`ChecklistItens` e do formulário de criação manual — nenhuma delas introduz
uma abstração nova.

**Tech Stack:** Sem mudança — Next.js App Router, React Query, Vitest.

## Global Constraints

- Sem comentários explicando O QUE o código faz.
- `DownloadButton` é a única abstração nova deste patch — os outros quatro
  itens são correções pontuais, sem extrair nada novo.
- TDD obrigatório na lógica testável (o componente de download em si, os
  testes de rota); UI sem teste automatizado segue o padrão já estabelecido
  no resto do módulo, coberto por verificação manual.

---

## 1. Downloads com loading + erro inline (`DownloadButton`)

**Problema:** "Baixar PDF original" e "Baixar modelo"
(`src/app/dashboard/comunique-se/[id]/page.tsx`) são `<a href>` simples —
cliques navegam a aba inteira pra fora do app, sem nenhum feedback durante a
espera (o modelo exportado gera PDF via Puppeteer, alguns segundos), e uma
falha (ex: arquivo sumiu do storage) mostra uma resposta JSON crua na tela
em vez de um erro tratado.

**Solução:** Novo componente cliente
`src/components/common/download-button.tsx`:

```tsx
interface DownloadButtonProps {
  href: string;
  filename: string;
  label: string;
  loadingLabel: string;
}
```

Ao clicar: `fetch(href)`. Enquanto pendente, o botão fica desabilitado e
mostra `loadingLabel` (com um spinner pequeno, reaproveitando o padrão visual
já usado em `LoadingSpinner`, mas inline no botão — não a tela cheia). Se
`response.ok` for falso, tenta ler o corpo como JSON pra pegar `error` (com
fallback pra uma mensagem genérica se não for JSON), e mostra isso como texto
inline abaixo do botão (mesmo padrão visual `text-destructive text-sm` já
usado no resto do módulo). Se `response.ok`, lê o corpo como `blob()`, cria
uma URL via `URL.createObjectURL`, dispara um clique num `<a>` sintético com
`download={filename}`, e revoga a URL logo depois (`URL.revokeObjectURL`).

O `filename` vem de fora (a página já sabe formatar a referência via
`referenciaComuniqueSe`), então o componente não depende de
`Content-Disposition` nem precisa parsear headers — mais simples e não exige
mudar a rota de PDF original.

Em `page.tsx`, os dois blocos:
```tsx
{comuniqueSeEncontrado.pdfOriginalUrl && (
  <DownloadButton
    href={comuniqueSeEncontrado.pdfOriginalUrl}
    filename={`comunique-se-${referenciaComuniqueSe(comuniqueSeEncontrado.numero)}-original.pdf`}
    label="Baixar PDF original"
    loadingLabel="Baixando..."
  />
)}
{comuniqueSeEncontrado.status === "pronto" && (
  <DownloadButton
    href={`/api/comunique-se/${comuniqueSeEncontrado.id}/modelo`}
    filename={`modelo-${referenciaComuniqueSe(comuniqueSeEncontrado.numero)}.pdf`}
    label="Baixar modelo"
    loadingLabel="Gerando..."
  />
)}
```

**Teste:** um teste do componente usando `vi.stubGlobal("fetch", ...)` pra
simular sucesso (confirma que `URL.createObjectURL` foi chamado e o link
sintético recebeu o `filename` certo) e falha (confirma que a mensagem de
erro aparece).

---

## 2. `handleAdicionar` perde texto digitado em falha silenciosa

**Problema:** `src/app/dashboard/comunique-se/[id]/checklist-itens.tsx`'s
`handleAdicionar` limpa `novoItemTexto` antes da mutation resolver e não tem
`onError` — se a request falhar, o texto some sem nenhuma mensagem.

**Solução:** Guardar o texto antes de limpar o campo; adicionar `onError` que
restaura o texto no campo E mostra uma mensagem de erro inline (novo estado
`erroAdicionar: string | null`, mesmo padrão visual dos outros erros do
módulo — sem toast, a tela não tem esse mecanismo):

```tsx
function handleAdicionar() {
  const descricao = novoItemTexto.trim();
  if (!descricao) return;

  setNovoItemTexto("");
  setErroAdicionar(null);

  adicionar.mutate(
    { comuniqueSeId, descricao },
    {
      onSuccess: (itensAtualizados) => setItens(itensAtualizados),
      onError: (error) => {
        setNovoItemTexto(descricao);
        setErroAdicionar(error.message);
      },
    },
  );
}
```

---

## 3. `handleRemover` pode restaurar snapshot desatualizado

**Problema:** `itensAntes = itens` captura o estado no momento da chamada.
Se duas remoções acontecem no mesmo ciclo de render e a segunda falha, seu
rollback restaura um snapshot que ainda contém o primeiro item (já removido
com sucesso).

**Solução:** Em vez de restaurar o array capturado antes, o rollback
reinsere apenas o item específico que falhou, na posição correta, calculando
a partir do estado ATUAL (função de updater do `setState`, não uma
referência congelada):

```tsx
function handleRemover(itemId: string) {
  const itemRemovido = itens.find((item) => item.id === itemId);
  const indiceOriginal = itens.findIndex((item) => item.id === itemId);
  setItens((atual) => atual.filter((item) => item.id !== itemId));

  remover.mutate(
    { comuniqueSeId, itemId },
    {
      onError: () => {
        if (!itemRemovido) return;
        setItens((atual) => {
          const copia = [...atual];
          copia.splice(indiceOriginal, 0, itemRemovido);
          return copia;
        });
      },
    },
  );
}
```

Isso corrige a race porque o rollback opera sobre o estado atual (via
updater function) em vez de uma cópia congelada de antes de QUALQUER
remoção concorrente.

---

## 4. Key por índice na lista de itens manuais do formulário de criação

**Problema:** `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`
usa o índice do array como `key` na lista de campos de texto do modo
"Digitar exigências" — pode causar um soluço de foco/cursor ao remover uma
linha do meio.

**Solução:** Trocar o estado `itensDigitados: string[]` por
`itensDigitados: { id: string; texto: string }[]`, gerando `id` via
`crypto.randomUUID()` uma vez por linha (na criação da linha, não a cada
render), e usando esse `id` como `key`. Os handlers (`handleItemDigitadoChange`,
`handleAdicionarLinha`, `handleRemoverLinha`) e o `onSubmit` (que hoje filtra
`itensDigitados.map((item) => item.trim())...`) são ajustados pra operar
sobre `.texto` em vez do valor direto.

---

## 5. Teste de 404 cross-empresa faltando em 3 rotas de item

**Problema:** `PATCH`/`POST /api/comunique-se/[id]/itens` e
`DELETE /api/comunique-se/[id]/itens/[itemId]` só testam "linha inexistente"
(`id` aleatório), não "linha existe mas pertence a outra empresa" — a rota
já trata os dois casos igual (`buscarComuniqueSeDaEmpresa` retorna `null`
pros dois), só falta o teste explícito.

**Solução:** Copiar o fixture de duas empresas já escrito em
`src/app/api/comunique-se/[id]/modelo/__tests__/route.test.ts` (cria
`empresaA`/`empresaB`, um Comunique-se em A, token de B) pros três arquivos
de teste de item, um novo caso "retorna 404 pra Comunique-se de outra
empresa" em cada.

---

## Arquivos tocados

- **Novo:** `src/components/common/download-button.tsx` (+ teste)
- **Modificado:** `src/app/dashboard/comunique-se/[id]/page.tsx` (troca os
  dois `<a>` por `DownloadButton`)
- **Modificado:** `src/app/dashboard/comunique-se/[id]/checklist-itens.tsx`
  (`handleAdicionar`, `handleRemover`)
- **Modificado:** `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`
  (key estável na lista manual — único ponto de sobreposição com o Patch 1,
  que mexe na mesma tela pra base64/redirect de erro, em trechos diferentes)
- **Modificado:** `src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts`,
  `src/app/api/comunique-se/[id]/itens/[itemId]/__tests__/route.test.ts`
  (novos testes cross-empresa)

## Fora de escopo (Patch 1 ou depois)

- Codificação base64 do upload, cap de texto pra IA, redirect de erro de
  criação — tudo isso é Patch 1.
- Qualquer mudança no Memorial.
