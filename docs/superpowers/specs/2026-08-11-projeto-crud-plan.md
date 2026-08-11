# CRUD Mínimo de Projeto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar + listar `Projeto`, escopado à empresa do usuário logado — o pré-requisito que os dois módulos de produto (Memorial Descritivo, Comunique-se) precisam antes de poder ser usados de ponta a ponta.

**Architecture:** Query layer (`src/db/queries/projeto.ts`) + um Route Handler só de criação (`POST /api/projetos`, protegido manualmente lendo o cookie de sessão direto do `NextRequest` — o middleware não cobre `/api/*`, e `getSessionUser()` não funciona chamado direto num teste, ver Task 2) + uma página de listagem que busca direto no Server Component (essa sim pode usar `getSessionUser()`, que funciona normalmente dentro de um Server Component real) + um dialog client-side pra criar.

**Tech Stack:** Next.js App Router, Drizzle, Zod, React Hook Form, React Query, shadcn (`Dialog`, `Card`, `Button`, `Input`, `Form` — todos já instalados).

## Global Constraints

- `empresaId` sempre vem da sessão, nunca do body da request.
- Sem paginação, busca ou filtro na listagem.
- Sem editar/excluir nesta feature.
- `POST /api/projetos` precisa checar a sessão manualmente e retornar `401` se ausente — diferente das rotas de `/dashboard/*`, `/api/*` não é coberto pelo matcher do `proxy.ts` (`["/dashboard/:path*"]`). Lê o cookie direto do `NextRequest` (não `getSessionUser()`) — `next/headers`'s `cookies()` lança erro fora do request scope real do Next, o que quebraria o teste do Route Handler chamando `POST()` direto.
- Listagem busca direto num Server Component (sem Route Handler `GET`, sem React Query) — só a criação usa Route Handler + mutation.

---

### Task 1: Query layer (`listarProjetos`, `criarProjeto`)

**Files:**
- Create: `src/db/queries/projeto.ts`
- Test: `src/db/queries/__tests__/projeto.test.ts`

**Interfaces:**
- Produces: `export interface Projeto { id: string; nome: string; endereco: string | null; createdAt: Date }`, `export async function listarProjetos(empresaId: string): Promise<Projeto[]>`, `export async function criarProjeto(input: { nome: string; endereco?: string; empresaId: string }): Promise<Projeto>` — Task 2 (Route Handler) chama `criarProjeto`; Task 3 (página) chama `listarProjetos`.

- [ ] **Step 1: Escrever os testes de integração (vão falhar — o módulo não existe)**

Crie `src/db/queries/__tests__/projeto.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { empresa, projeto } from "@/db/schema";
import { criarProjeto, listarProjetos } from "../projeto";

async function limparBanco() {
  await db.delete(projeto);
  await db.delete(empresa);
}

describe("criarProjeto", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria um projeto com os dados informados", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();

    const resultado = await criarProjeto({
      nome: "Casa da Praia",
      endereco: "Rua das Flores, 123",
      empresaId: novaEmpresa.id,
    });

    expect(resultado.nome).toBe("Casa da Praia");
    expect(resultado.endereco).toBe("Rua das Flores, 123");
    expect(resultado.id).toBeDefined();
  });

  it("cria um projeto sem endereço", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();

    const resultado = await criarProjeto({ nome: "Casa da Praia", empresaId: novaEmpresa.id });

    expect(resultado.endereco).toBeNull();
  });
});

describe("listarProjetos", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("lista só os projetos da empresa pedida, mais recente primeiro", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    await db.insert(projeto).values({ nome: "Projeto Antigo", empresaId: novaEmpresa.id });
    await db.insert(projeto).values({ nome: "Projeto Novo", empresaId: novaEmpresa.id });

    const resultado = await listarProjetos(novaEmpresa.id);

    expect(resultado).toHaveLength(2);
    expect(resultado[0].nome).toBe("Projeto Novo");
    expect(resultado[1].nome).toBe("Projeto Antigo");
  });

  it("não retorna projetos de outra empresa", async () => {
    const [empresaA] = await db.insert(empresa).values({ nome: "Empresa A" }).returning();
    const [empresaB] = await db.insert(empresa).values({ nome: "Empresa B" }).returning();
    await db.insert(projeto).values({ nome: "Projeto A", empresaId: empresaA.id });
    await db.insert(projeto).values({ nome: "Projeto B", empresaId: empresaB.id });

    const resultado = await listarProjetos(empresaA.id);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nome).toBe("Projeto A");
  });

  it("retorna lista vazia quando a empresa não tem projetos", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();

    const resultado = await listarProjetos(novaEmpresa.id);

    expect(resultado).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/db/queries/__tests__/projeto.test.ts`
Expected: FAIL — `Cannot find module '../projeto'` (ou equivalente).

- [ ] **Step 3: Implementar a query layer**

Crie `src/db/queries/projeto.ts`:

```ts
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { projeto } from "@/db/schema";

export interface Projeto {
  id: string;
  nome: string;
  endereco: string | null;
  createdAt: Date;
}

const CAMPOS_PROJETO = {
  id: projeto.id,
  nome: projeto.nome,
  endereco: projeto.endereco,
  createdAt: projeto.createdAt,
};

export async function listarProjetos(empresaId: string): Promise<Projeto[]> {
  return db
    .select(CAMPOS_PROJETO)
    .from(projeto)
    .where(eq(projeto.empresaId, empresaId))
    .orderBy(desc(projeto.createdAt));
}

export async function criarProjeto(input: {
  nome: string;
  endereco?: string;
  empresaId: string;
}): Promise<Projeto> {
  const [criado] = await db.insert(projeto).values(input).returning(CAMPOS_PROJETO);
  return criado;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/db/queries/__tests__/projeto.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries/projeto.ts src/db/queries/__tests__/projeto.test.ts
git commit -m "feat: add projeto query layer (criar, listar)"
```

---

### Task 2: `POST /api/projetos`

**Files:**
- Create: `src/lib/validations/projeto/create.schema.ts`
- Create: `src/app/api/projetos/route.ts`
- Test: `src/app/api/projetos/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `criarProjeto` de `@/db/queries/projeto` (Task 1, sem mudança de forma), `verificarToken` de `@/lib/auth/jwt` e `SESSION_COOKIE_NAME` de `@/lib/auth/constants` (já existem — este Route Handler lê a sessão direto do `NextRequest`, não via `getSessionUser()`; ver nota no Step 2 sobre o motivo).
- Produces: `export const criarProjetoSchema` e `export type CriarProjetoInput = z.infer<typeof criarProjetoSchema>` — Task 3 (UI) usa esse tipo no formulário. `POST /api/projetos` retorna `201 { projeto: Projeto }` no sucesso, `400 { error, fields? }` em validação, `401 { error }` sem sessão, `500 { error }` em erro interno.

- [ ] **Step 1: Escrever o schema Zod**

Crie `src/lib/validations/projeto/create.schema.ts`:

```ts
import { z } from "zod";

export const criarProjetoSchema = z.object({
  nome: z.string().min(1, "Informe o nome do projeto."),
  endereco: z.string().optional(),
});

export type CriarProjetoInput = z.infer<typeof criarProjetoSchema>;
```

- [ ] **Step 2: Escrever os testes do Route Handler (vão falhar — o arquivo não existe)**

Crie `src/app/api/projetos/__tests__/route.test.ts`:

**Por que `NextRequest` e não o `Request` que os testes de auth usam:** `getSessionUser()` (usado nas páginas) lê o cookie via `cookies()` de `next/headers`, que só funciona dentro do runtime real do Next — chamado direto num teste Vitest (fora do request scope real), ele lança `` `cookies` was called outside a request scope `` (verificado diretamente antes de escrever este plano). Por isso o Route Handler desta task lê o cookie direto do `NextRequest` (`request.cookies.get(...)`, o mesmo padrão que `src/proxy.ts` já usa) em vez de `getSessionUser()` — funciona igual em produção e é testável diretamente, sem precisar simular o runtime do Next.

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { POST } from "@/app/api/projetos/route";

async function limparBanco() {
  await db.delete(projeto);
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarSessao() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({
      nome: "Victor",
      email: "victor@ancar.com.br",
      senhaHash: "hash-fake",
      empresaId: novaEmpresa.id,
    })
    .returning();

  const token = await assinarToken({
    userId: novoUsuario.id,
    empresaId: novaEmpresa.id,
    papel: novoUsuario.papel,
  });

  return { empresaId: novaEmpresa.id, token };
}

function criarRequest(body: unknown, token?: string) {
  return new NextRequest("http://localhost/api/projetos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/projetos", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria um projeto escopado à empresa da sessão e retorna 201", async () => {
    const { empresaId, token } = await criarSessao();

    const response = await POST(
      criarRequest({ nome: "Casa da Praia", endereco: "Rua X, 123" }, token),
    );

    expect(response.status).toBe(201);
    const corpo = await response.json();
    expect(corpo.projeto.nome).toBe("Casa da Praia");

    const projetos = await db.select().from(projeto);
    expect(projetos).toHaveLength(1);
    expect(projetos[0].empresaId).toBe(empresaId);
  });

  it("rejeita nome vazio com 400", async () => {
    const { token } = await criarSessao();

    const response = await POST(criarRequest({ nome: "" }, token));

    expect(response.status).toBe(400);
  });

  it("rejeita request sem sessão com 401", async () => {
    const response = await POST(criarRequest({ nome: "Casa da Praia" }));

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/app/api/projetos/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/projetos/route'` (ou equivalente).

- [ ] **Step 4: Implementar o Route Handler**

Crie `src/app/api/projetos/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { criarProjeto } from "@/db/queries/projeto";
import { criarProjetoSchema } from "@/lib/validations/projeto/create.schema";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = criarProjetoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const projeto = await criarProjeto({ ...parsed.data, empresaId: sessao.empresaId });
    return NextResponse.json({ projeto }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projetos]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/app/api/projetos/__tests__/route.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations/projeto/create.schema.ts src/app/api/projetos/route.ts src/app/api/projetos/__tests__/route.test.ts
git commit -m "feat: add POST /api/projetos route handler"
```

---

### Task 3: Página `/dashboard/projetos` + dialog de criação + nav

**Files:**
- Create: `src/hooks/use-criar-projeto.ts`
- Create: `src/app/dashboard/projetos/page.tsx`
- Create: `src/app/dashboard/projetos/novo-projeto-dialog.tsx`
- Modify: `src/components/dashboard/sidebar.tsx` (adicionar item de nav)

**Interfaces:**
- Consumes: `criarProjetoSchema`/`CriarProjetoInput` de `@/lib/validations/projeto/create.schema` (Task 2), `listarProjetos` de `@/db/queries/projeto` (Task 1).
- Produces: nada consumido por tasks futuras deste plano — task de integração final antes da verificação manual.

**Sem teste automatizado nesta task** — mesmo padrão das páginas de login/register/dashboard da feature de auth (sem RTL/jsdom neste projeto). Cobertura vem da verificação manual (Task 4).

- [ ] **Step 1: Hook de mutation**

Crie `src/hooks/use-criar-projeto.ts`:

```ts
import { useMutation } from "@tanstack/react-query";

import type { CriarProjetoInput } from "@/lib/validations/projeto/create.schema";
import type { Projeto } from "@/db/queries/projeto";

interface ProjetoResponse {
  projeto: Projeto;
}

interface ApiErrorBody {
  error: string;
  fields?: Record<string, string[]>;
}

async function criarProjetoRequest(input: CriarProjetoInput): Promise<ProjetoResponse> {
  const response = await fetch("/api/projetos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as ProjetoResponse | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return data as ProjetoResponse;
}

export function useCriarProjeto() {
  return useMutation({ mutationFn: criarProjetoRequest });
}
```

- [ ] **Step 2: Dialog de criação**

Crie `src/app/dashboard/projetos/novo-projeto-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import {
  criarProjetoSchema,
  type CriarProjetoInput,
} from "@/lib/validations/projeto/create.schema";
import { useCriarProjeto } from "@/hooks/use-criar-projeto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function NovoProjetoDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const criar = useCriarProjeto();

  const form = useForm<CriarProjetoInput>({
    resolver: zodResolver(criarProjetoSchema),
    defaultValues: { nome: "", endereco: "" },
  });

  function onSubmit(values: CriarProjetoInput) {
    criar.mutate(values, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        router.refresh();
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Novo projeto</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endereco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {criar.isError && (
              <p className="text-destructive text-sm">{criar.error.message}</p>
            )}
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? "Criando..." : "Criar projeto"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Página de listagem**

Crie `src/app/dashboard/projetos/page.tsx`:

```tsx
import { getSessionUser } from "@/lib/auth/session";
import { listarProjetos } from "@/db/queries/projeto";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NovoProjetoDialog } from "./novo-projeto-dialog";

export default async function ProjetosPage() {
  const sessao = await getSessionUser();
  const projetos = sessao ? await listarProjetos(sessao.empresaId) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projetos</h1>
        <NovoProjetoDialog />
      </div>
      {projetos.length === 0 ? (
        <p className="text-muted-foreground">Nenhum projeto ainda.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projetos.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>{p.nome}</CardTitle>
                {p.endereco && <CardDescription>{p.endereco}</CardDescription>}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Adicionar "Projetos" na sidebar**

Em `src/components/dashboard/sidebar.tsx`, importe `FolderKanban` de `lucide-react` junto dos ícones já importados:

```ts
import { FileText, ClipboardList, FolderKanban } from "lucide-react";
```

E adicione uma entrada no início de `ITENS_NAV` (antes de Memorial Descritivo):

```ts
const ITENS_NAV = [
  { href: "/dashboard/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/dashboard/memorial", label: "Memorial Descritivo", icon: FileText },
  { href: "/dashboard/comunique-se", label: "Comunique-se", icon: ClipboardList },
];
```

Nada mais nesse arquivo muda — `ehItemAtivo` e o resto do componente já funcionam com qualquer item da lista.

- [ ] **Step 5: Rodar a suíte inteira e o build**

Run: `npm test`
Expected: PASS — todos os testes anteriores + os 9 novos desta feature (6 da Task 1 + 3 da Task 2) verdes.

Run: `npm run build`
Expected: build passa, `/dashboard/projetos` aparece na saída como rota gerada.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-criar-projeto.ts src/app/dashboard/projetos/page.tsx src/app/dashboard/projetos/novo-projeto-dialog.tsx src/components/dashboard/sidebar.tsx
git commit -m "feat: add projetos page with create dialog and nav item"
```

---

### Task 4: Verificação manual do fluxo completo

**Files:** nenhum (task de verificação — só um commit final se algo precisar de ajuste).

**Interfaces:** nenhuma — consome tudo das Tasks 1-3.

- [ ] **Step 1: Build e suíte completos**

Run: `npm run build`
Expected: sucesso.

Run: `npm test`
Expected: 100% dos testes passando.

- [ ] **Step 2: Subir o dev server e verificar manualmente (Playwright ou navegador real)**

Run: `npm run dev -- -p 3100`

Com um usuário já registrado (ou registre um novo via `/register`):

1. Acesse `/dashboard/projetos`. Confirme: item "Projetos" aparece na sidebar, marcado ativo; página mostra "Nenhum projeto ainda." (se for a primeira vez).
2. Clique "Novo projeto", preencha nome + endereço, submeta. Confirme: dialog fecha, o projeto aparece na lista sem precisar recarregar a página manualmente.
3. Crie um segundo projeto sem endereço. Confirme: aparece na lista, sem quebrar (endereço vazio não gera erro visual).
4. Tente submeter o formulário com nome vazio. Confirme: erro inline aparece, nada é criado.
5. Registre um segundo usuário (segunda empresa, via `/register` com dados diferentes). Confirme: `/dashboard/projetos` desse segundo usuário mostra "Nenhum projeto ainda." — não vê os projetos do primeiro usuário.

- [ ] **Step 3: Parar o dev server**

Confirme que o processo foi encerrado.

- [ ] **Step 4: Commit final, só se algo precisou de ajuste**

```bash
git add -A
git commit -m "fix: <descrição específica do que a verificação manual encontrou>"
```

Se tudo passou de primeira, esta task não gera commit.
