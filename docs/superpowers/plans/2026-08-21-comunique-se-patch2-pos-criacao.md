# Patch 2 — Pós-criação: Downloads e Checklist (Comunique-se) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar feedback visual real nos dois downloads da página de detalhe
do Comunique-se (PDF original, modelo exportado) e fechar quatro lacunas
pequenas de robustez na edição do checklist.

**Architecture:** Um componente cliente compartilhado (`DownloadButton`)
substitui os dois `<a href>` da página de detalhe. As correções de
robustez do checklist são mudanças pontuais e independentes dentro de
`ChecklistItens` e do formulário de criação manual.

**Tech Stack:** Next.js App Router, React Query, Vitest.

## Global Constraints

- Sem comentários explicando O QUE o código faz.
- **Desvio do spec aprovado, decidido ao escrever este plano:** o spec
  (`docs/superpowers/specs/2026-08-21-comunique-se-patch2-pos-criacao-design.md`)
  propõe um teste automatizado pro `DownloadButton` usando
  `vi.stubGlobal("fetch", ...)`. Esse componente usa `document.createElement`
  e `URL.createObjectURL` — APIs de DOM que exigem `jsdom` (o
  `vitest.config.ts` deste projeto roda com `environment: "node"`, sem
  jsdom instalado). Nenhum componente/hook de UI deste módulo tem teste
  automatizado hoje (mesmo padrão já confirmado nas Tasks 10-12 do plano
  irmão `2026-08-21-comunique-se-editar-exportar.md`). Em vez de adicionar
  `jsdom` como dependência nova só pra este componente (fora de escopo
  deste patch), `DownloadButton` segue o mesmo padrão do resto da UI:
  sem teste automatizado, coberto pela verificação manual (Task 6).
- `DownloadButton` é a única abstração nova deste patch.
- O ícone de "carregando" reaproveita o padrão já usado em
  `retry-comunique-se-button.tsx` (`RefreshCw` do `lucide-react` +
  `animate-spin`), não o componente `LoadingSpinner` (que é uma animação
  3D de tela cheia, feita pra overlay de formulário — não cabe dentro de
  um botão inline).

---

### Task 1: Componente `DownloadButton`

**Files:**
- Create: `src/components/common/download-button.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `export function DownloadButton(props: { href: string; filename: string; label: string; loadingLabel: string }): JSX.Element`.
  Task 2 usa esse componente.

**Sem teste automatizado nesta task** (ver Global Constraints). Cobertura
vem da verificação manual (Task 6).

- [ ] **Step 1: Implementar o componente**

Crie `src/components/common/download-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";

interface DownloadButtonProps {
  href: string;
  filename: string;
  label: string;
  loadingLabel: string;
}

export function DownloadButton({ href, filename, label, loadingLabel }: DownloadButtonProps) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleClick() {
    setErro(null);
    setCarregando(true);

    try {
      const response = await fetch(href);

      if (!response.ok) {
        let mensagem = "Não foi possível baixar o arquivo.";
        try {
          const corpo = await response.json();
          if (typeof corpo.error === "string") mensagem = corpo.error;
        } catch {
          // corpo de erro nao veio como JSON -- mantem a mensagem generica
        }
        setErro(mensagem);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível baixar o arquivo.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={carregando}
        className="flex items-center gap-1.5 text-sm underline disabled:no-underline disabled:opacity-60"
      >
        {carregando ? <RefreshCw className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        {carregando ? loadingLabel : label}
      </button>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/common/download-button.tsx
git commit -m "feat: add DownloadButton with loading state and inline error handling"
```

---

### Task 2: Trocar os links de download por `DownloadButton` na página de detalhe

**Files:**
- Modify: `src/app/dashboard/comunique-se/[id]/page.tsx`

**Interfaces:**
- Consumes: `DownloadButton` (Task 1).
- Produces: nada consumido por outras tasks.

**Sem teste automatizado nesta task.** Cobertura vem da verificação manual
(Task 6).

- [ ] **Step 1: Atualizar `page.tsx`**

Em `src/app/dashboard/comunique-se/[id]/page.tsx`, adicione o import:

```ts
import { DownloadButton } from "@/components/common/download-button";
```

Troque o bloco:

```tsx
        <div className="flex gap-3">
          {comuniqueSeEncontrado.pdfOriginalUrl && (
            <a href={comuniqueSeEncontrado.pdfOriginalUrl} className="text-sm underline">
              Baixar PDF original
            </a>
          )}
          {comuniqueSeEncontrado.status === "pronto" && (
            <a href={`/api/comunique-se/${comuniqueSeEncontrado.id}/modelo`} download className="text-sm underline">
              Baixar modelo
            </a>
          )}
        </div>
```

por:

```tsx
        <div className="flex gap-3">
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
        </div>
```

(`referenciaComuniqueSe` já está importado no topo do arquivo, usado
logo acima nesse mesmo componente — não precisa de novo import)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/comunique-se/[id]/page.tsx
git commit -m "feat: use DownloadButton for original PDF and exported model downloads"
```

---

### Task 3: Robustez de `handleAdicionar`/`handleRemover` no checklist

**Files:**
- Modify: `src/app/dashboard/comunique-se/[id]/checklist-itens.tsx`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada consumido por outras tasks.

**Sem teste automatizado nesta task** (mesmo padrão do resto do componente).
Cobertura vem da verificação manual (Task 6).

- [ ] **Step 1: Corrigir `handleAdicionar`**

Em `src/app/dashboard/comunique-se/[id]/checklist-itens.tsx`, adicione o
estado logo depois de `const [novoItemTexto, setNovoItemTexto] = useState("");`:

```ts
  const [erroAdicionar, setErroAdicionar] = useState<string | null>(null);
```

Troque a função `handleAdicionar` inteira:

```ts
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
```

por:

```ts
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

- [ ] **Step 2: Corrigir `handleRemover`**

Troque a função `handleRemover` inteira:

```ts
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
```

por:

```ts
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

- [ ] **Step 3: Mostrar `erroAdicionar` na tela**

No final do JSX do componente, troque:

```tsx
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

por:

```tsx
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
      {erroAdicionar && <p className="text-xs text-destructive">{erroAdicionar}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/comunique-se/[id]/checklist-itens.tsx"
git commit -m "fix: restore typed text and show inline error when adding a checklist item fails, fix stale rollback snapshot on remove"
```

---

### Task 4: Key estável na lista de itens manuais do formulário de criação

**Files:**
- Modify: `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada consumido por outras tasks.

**Sem teste automatizado nesta task.** Cobertura vem da verificação manual
(Task 6).

- [ ] **Step 1: Trocar o estado `itensDigitados` por uma lista de objetos com id**

Em `src/app/dashboard/comunique-se/novo-comunique-se-form.tsx`, troque:

```ts
  const [itensDigitados, setItensDigitados] = useState<string[]>([""]);
```

por:

```ts
  const [itensDigitados, setItensDigitados] = useState<{ id: string; texto: string }[]>([
    { id: crypto.randomUUID(), texto: "" },
  ]);
```

- [ ] **Step 2: Atualizar os handlers**

Troque:

```ts
  function handleItemDigitadoChange(indice: number, valor: string) {
    setItensDigitados((atual) => atual.map((item, i) => (i === indice ? valor : item)));
  }

  function handleAdicionarLinha() {
    setItensDigitados((atual) => [...atual, ""]);
  }

  function handleRemoverLinha(indice: number) {
    setItensDigitados((atual) => (atual.length === 1 ? atual : atual.filter((_, i) => i !== indice)));
  }
```

por:

```ts
  function handleItemDigitadoChange(id: string, valor: string) {
    setItensDigitados((atual) => atual.map((item) => (item.id === id ? { ...item, texto: valor } : item)));
  }

  function handleAdicionarLinha() {
    setItensDigitados((atual) => [...atual, { id: crypto.randomUUID(), texto: "" }]);
  }

  function handleRemoverLinha(id: string) {
    setItensDigitados((atual) => (atual.length === 1 ? atual : atual.filter((item) => item.id !== id)));
  }
```

- [ ] **Step 3: Atualizar `onSubmit`**

Troque a linha (dentro do branch manual de `onSubmit`):

```ts
    const itensPreenchidos = itensDigitados.map((item) => item.trim()).filter((item) => item.length > 0);
```

por:

```ts
    const itensPreenchidos = itensDigitados.map((item) => item.texto.trim()).filter((texto) => texto.length > 0);
```

- [ ] **Step 4: Atualizar o JSX da lista**

Troque:

```tsx
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
```

por:

```tsx
            {itensDigitados.map((item) => (
              <div key={item.id} className="flex gap-2">
                <Input
                  value={item.texto}
                  onChange={(event) => handleItemDigitadoChange(item.id, event.target.value)}
                  placeholder="Descreva a exigência"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoverLinha(item.id)}
                  disabled={itensDigitados.length === 1}
                >
                  Remover
                </Button>
              </div>
            ))}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/comunique-se/novo-comunique-se-form.tsx
git commit -m "fix: use stable per-row id instead of array index as React key in manual item list"
```

---

### Task 5: Testes de 404 cross-empresa nas 3 rotas de item

**Files:**
- Modify: `src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts`
- Modify: `src/app/api/comunique-se/[id]/itens/[itemId]/__tests__/route.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Teste cross-empresa pro `PATCH`**

Em `src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts`,
`assinarToken` já está importado no topo do arquivo (usado pelos helpers
`criarSessaoComChecklist`/`criarSessaoAindaProcessando`) — não precisa de
import novo.

No describe `PATCH /api/comunique-se/[id]/itens`, logo depois do teste
existente "retorna 404 pra Comunique-se inexistente", adicione:

```ts
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
        checklistJson: { itens: [{ id: "item-1", descricao: "Apresentar ART", concluida: false }] },
      })
      .returning();
    const tokenB = await assinarToken({ userId: usuarioB.id, empresaId: empresaB.id, papel: usuarioB.papel });

    const response = await PATCH(criarRequest({ itemId: "item-1", concluida: true }, tokenB), {
      params: Promise.resolve({ id: linhaA.id }),
    });

    expect(response.status).toBe(404);
  });
```

- [ ] **Step 2: Teste cross-empresa pro `POST`**

No mesmo arquivo, no describe `POST /api/comunique-se/[id]/itens`, logo
depois do teste existente "retorna 404 pra Comunique-se inexistente",
adicione:

```ts
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

    const response = await POST(criarRequest({ descricao: "Novo item" }, tokenB), {
      params: Promise.resolve({ id: linhaA.id }),
    });

    expect(response.status).toBe(404);
  });
```

- [ ] **Step 3: Rodar e confirmar que passam**

Run: `npx vitest run "src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts"`
Expected: PASS — todos os testes do arquivo, incluindo os 2 novos.

- [ ] **Step 4: Teste cross-empresa pro `DELETE`**

Em `src/app/api/comunique-se/[id]/itens/[itemId]/__tests__/route.test.ts`,
logo depois do teste existente "retorna 404 pra Comunique-se inexistente",
adicione:

```ts
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
        checklistJson: { itens: [{ id: "item-1", descricao: "Apresentar ART", concluida: false }] },
      })
      .returning();
    const tokenB = await assinarToken({ userId: usuarioB.id, empresaId: empresaB.id, papel: usuarioB.papel });

    const response = await DELETE(criarRequest(tokenB), {
      params: Promise.resolve({ id: linhaA.id, itemId: "item-1" }),
    });

    expect(response.status).toBe(404);
  });
```

`assinarToken` já está importado no topo deste arquivo também (mesmo motivo
do arquivo anterior) — não precisa de import novo.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run "src/app/api/comunique-se/[id]/itens/[itemId]/__tests__/route.test.ts"`
Expected: PASS — todos os testes do arquivo, incluindo o novo.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/comunique-se/[id]/itens/__tests__/route.test.ts" "src/app/api/comunique-se/[id]/itens/[itemId]/__tests__/route.test.ts"
git commit -m "test: add cross-empresa 404 coverage to the 3 checklist item routes"
```

---

### Task 6: Verificação manual do fluxo completo

**Files:** nenhum (task de verificação — só um commit final se algo
precisar de ajuste).

**Interfaces:** nenhuma — consome tudo das Tasks 1-5.

- [ ] **Step 1: Build e suíte completos**

Run: `npm run build`
Expected: sucesso.

Run: `npm test`
Expected: 100% dos testes passando.

- [ ] **Step 2: Verificar os dois downloads via navegador**

Suba o dev server numa porta alternativa. Abra um Comunique-se `pronto` com
PDF original (upload real) e clique "Baixar PDF original" — confirme:
o botão mostra "Baixando..." com o ícone girando por um instante, e o
arquivo é salvo pelo navegador (não navega a aba pra fora do app). Clique
"Baixar modelo" — confirme: mostra "Gerando..." durante a geração via
Puppeteer (alguns segundos), depois salva o PDF do modelo. Force um erro
(ex.: pare o dev server bem no meio de um clique, ou renomeie
temporariamente o arquivo salvo em disco do PDF original antes de clicar)
e confirme que aparece uma mensagem de erro inline, sem navegar pra
nenhuma página crua.

- [ ] **Step 3: Verificar a robustez do checklist**

No mesmo Comunique-se, adicione um item, remova outro, edite o texto de um
terceiro — confirme que tudo continua funcionando como antes. Pra testar o
`handleAdicionar`: pare o dev server bem depois de clicar "+ Adicionar" (ou
use as devtools do navegador pra bloquear a requisição) e confirme que o
texto digitado volta pro campo com uma mensagem de erro, em vez de
desaparecer.

- [ ] **Step 4: Verificar a lista manual de criação**

No drawer "Novo Comunique-se", modo "Digitar exigências", adicione 3-4
linhas, digite algo diferente em cada uma, remova uma do meio — confirme
que o foco/cursor nas linhas restantes se comporta normalmente (sem pular
pro campo errado).

- [ ] **Step 5: Parar o dev server**

Confirme que o processo foi encerrado.

- [ ] **Step 6: Commit final, só se algo precisou de ajuste**

```bash
git add -A
git commit -m "fix: <descrição específica do que a verificação manual encontrou>"
```

Se tudo passou de primeira, esta task não gera commit.
