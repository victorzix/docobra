# Shell Mínimo do Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o shell autenticado compartilhado (sidebar, nav, nome de empresa/usuário, logout funcional) que os dois módulos futuros do DocObra vão usar, substituindo o placeholder atual de `/dashboard`.

**Architecture:** `src/app/dashboard/layout.tsx` (Server Component) busca sessão + nomes via uma query Drizzle e monta o shell usando o `Sidebar` oficial do shadcn (estado próprio do componente, não Zustand) + um componente de nav e um de user-menu, ambos client components.

**Tech Stack:** Next.js App Router, Drizzle, shadcn/ui (`Sidebar`, já instalado: `Card`, `Button`), lucide-react, React Query (`useLogout` já existe), Vitest.

## Global Constraints

- Sidebar usa o componente oficial do shadcn com seu próprio estado interno — exceção pontual à regra geral de Zustand pra estado de UI client-side, decidida na spec.
- Nomes de empresa/usuário vêm de uma query ao banco no layout, nunca do payload do JWT.
- `/dashboard` (raiz) é uma home com 2 cards — não redireciona pro primeiro módulo.
- Logout redireciona pra `/login` sem `from=` (ação deliberada, diferente do redirect por sessão expirada).
- Sem teste de UI do `Sidebar` do shadcn em si (código de terceiro).
- `vitest.config.ts` usa `environment: "node"` (sem jsdom/RTL) — nenhuma task desta feature deve introduzir renderização de componente em teste; lógica testável é extraída em funções puras.
- Fora de escopo: landing/marketing page, conteúdo real dos 2 módulos, diferenciação de UI por `papel`, `error.tsx` customizado.

---

### Task 1: Query de nomes (`buscarNomesUsuarioEEmpresa`)

**Files:**
- Create: `src/db/queries/usuario.ts`
- Test: `src/db/queries/__tests__/usuario.test.ts`

**Interfaces:**
- Produces: `export interface NomesUsuarioEEmpresa { usuarioNome: string; empresaNome: string }` e `export async function buscarNomesUsuarioEEmpresa(userId: string): Promise<NomesUsuarioEEmpresa | null>` — Task 4 (layout) chama esta função com o `userId` da sessão.

- [ ] **Step 1: Escrever o teste de integração (vai falhar — o módulo não existe)**

Crie `src/db/queries/__tests__/usuario.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { empresa, usuario } from "@/db/schema";
import { buscarNomesUsuarioEEmpresa } from "../usuario";

async function limparBanco() {
  await db.delete(usuario);
  await db.delete(empresa);
}

describe("buscarNomesUsuarioEEmpresa", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("retorna os nomes de usuário e empresa quando o usuário existe", async () => {
    const [novaEmpresa] = await db
      .insert(empresa)
      .values({ nome: "Ancar Engenharia" })
      .returning();
    const [novoUsuario] = await db
      .insert(usuario)
      .values({
        nome: "Victor",
        email: "victor@ancar.com.br",
        senhaHash: "hash-fake",
        empresaId: novaEmpresa.id,
      })
      .returning();

    const resultado = await buscarNomesUsuarioEEmpresa(novoUsuario.id);

    expect(resultado).toEqual({ usuarioNome: "Victor", empresaNome: "Ancar Engenharia" });
  });

  it("retorna null sem lançar quando o usuário não existe", async () => {
    const resultado = await buscarNomesUsuarioEEmpresa("00000000-0000-0000-0000-000000000000");

    expect(resultado).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/db/queries/__tests__/usuario.test.ts`
Expected: FAIL — `Cannot find module '../usuario'` (ou equivalente).

- [ ] **Step 3: Implementar a query**

Crie `src/db/queries/usuario.ts`:

```ts
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { empresa, usuario } from "@/db/schema";

export interface NomesUsuarioEEmpresa {
  usuarioNome: string;
  empresaNome: string;
}

export async function buscarNomesUsuarioEEmpresa(
  userId: string,
): Promise<NomesUsuarioEEmpresa | null> {
  const resultado = await db
    .select({ usuarioNome: usuario.nome, empresaNome: empresa.nome })
    .from(usuario)
    .innerJoin(empresa, eq(usuario.empresaId, empresa.id))
    .where(eq(usuario.id, userId))
    .limit(1);

  return resultado[0] ?? null;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/db/queries/__tests__/usuario.test.ts`
Expected: PASS — 2 testes.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries/usuario.ts src/db/queries/__tests__/usuario.test.ts
git commit -m "feat: add buscarNomesUsuarioEEmpresa query"
```

---

### Task 2: Sidebar do shadcn + componente de nav

**Files:**
- Install: `npx shadcn@latest add sidebar` (vai criar/atualizar `src/components/ui/sidebar.tsx` e trazer as dependências que faltarem — provavelmente `sheet`, `tooltip`, `separator`, `skeleton`, `input`, `button`; `input`/`button` já existem)
- Create: `src/components/dashboard/sidebar.tsx`
- Test: `src/components/dashboard/__tests__/sidebar.test.ts`

**Interfaces:**
- Consumes: primitivas do shadcn instaladas no passo acima — `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`, `SidebarInset`, todas de `@/components/ui/sidebar`. Se o CLI gerar nomes diferentes destes (a API é estável há várias versões do shadcn, mas confirme lendo o arquivo gerado antes de escrever o resto da task), ajuste os imports do componente pra bater com o que foi de fato instalado — isso não muda o comportamento exigido abaixo, só os nomes de import.
- Produces: `export function ehItemAtivo(pathname: string, href: string): boolean` (função pura, exportada de `sidebar.tsx`) e `export function DashboardSidebar({ footer }: { footer?: React.ReactNode })` (o componente, renderiza `footer` dentro do próprio `SidebarFooter` do shadcn) — Task 4 (layout) importa e usa `<DashboardSidebar footer={<UserMenu ... />} />`.

- [ ] **Step 1: Instalar o Sidebar do shadcn**

Run: `npx shadcn@latest add sidebar`

Depois de instalado, leia `src/components/ui/sidebar.tsx` e confirme que ele exporta `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`, `SidebarInset` (são os nomes documentados oficialmente pelo shadcn pra esse componente). Anote qualquer divergência antes de seguir pro Step 2.

- [ ] **Step 2: Escrever o teste da função pura `ehItemAtivo` (vai falhar — o módulo não existe)**

Crie `src/components/dashboard/__tests__/sidebar.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ehItemAtivo } from "../sidebar";

describe("ehItemAtivo", () => {
  it("retorna true quando o pathname é exatamente o href", () => {
    expect(ehItemAtivo("/dashboard/memorial", "/dashboard/memorial")).toBe(true);
  });

  it("retorna true quando o pathname é uma sub-rota do href", () => {
    expect(ehItemAtivo("/dashboard/memorial/123", "/dashboard/memorial")).toBe(true);
  });

  it("retorna false quando o pathname é outra rota", () => {
    expect(ehItemAtivo("/dashboard/comunique-se", "/dashboard/memorial")).toBe(false);
  });

  it("retorna false quando o pathname só compartilha o prefixo textual sem ser sub-rota", () => {
    expect(ehItemAtivo("/dashboard/memorial-antigo", "/dashboard/memorial")).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/components/dashboard/__tests__/sidebar.test.ts`
Expected: FAIL — `Cannot find module '../sidebar'` (ou equivalente).

- [ ] **Step 4: Implementar `ehItemAtivo` e o componente `DashboardSidebar`**

Crie `src/components/dashboard/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, ClipboardList } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const ITENS_NAV = [
  { href: "/dashboard/memorial", label: "Memorial Descritivo", icon: FileText },
  { href: "/dashboard/comunique-se", label: "Comunique-se", icon: ClipboardList },
];

export function ehItemAtivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface DashboardSidebarProps {
  footer?: React.ReactNode;
}

export function DashboardSidebar({ footer }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 text-sm font-semibold">DocObra</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {ITENS_NAV.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={ehItemAtivo(pathname, item.href)}>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      {footer && <SidebarFooter>{footer}</SidebarFooter>}
    </Sidebar>
  );
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/components/dashboard/__tests__/sidebar.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/sidebar.tsx src/components/ui src/components/dashboard/sidebar.tsx src/components/dashboard/__tests__/sidebar.test.ts package.json package-lock.json
git commit -m "feat: add dashboard sidebar nav using shadcn Sidebar"
```

(O `git add src/components/ui` cobre qualquer outro primitivo que o CLI do shadcn tenha instalado como dependência no Step 1 — ex. `sheet.tsx`, `tooltip.tsx`, `separator.tsx`, `skeleton.tsx` — e `package.json`/`package-lock.json` cobrem as dependências npm que vierem com eles, ex. `@radix-ui/react-dialog` já existe, mas outras podem ser novas.)

---

### Task 3: User menu (nomes + logout)

**Files:**
- Create: `src/components/dashboard/user-menu.tsx`

**Interfaces:**
- Consumes: `useLogout` de `@/hooks/use-logout` (já existe, sem mudança de forma — `useMutation` do React Query, `mutate()` sem argumentos, `isPending`/`isError`/`error` no retorno). `NomesUsuarioEEmpresa` de `@/db/queries/usuario` (Task 1) — este componente recebe os 2 nomes via props, não busca sozinho (a busca é no layout, Server Component).
- Produces: `export function UserMenu(props: { usuarioNome: string; empresaNome: string })` — Task 4 (layout) importa e usa `<UserMenu usuarioNome={...} empresaNome={...} />`.

**Sem teste automatizado nesta task** — mesmo padrão já usado nas páginas de login/register da feature de auth (nenhuma delas tem teste unitário próprio; a cobertura vem da verificação manual final, Task 5 deste plano). Este componente é puramente apresentacional + uma chamada de mutation já testada na origem (`useLogout`); testar o "render" exigiria React Testing Library + jsdom, que este projeto não usa (ver Global Constraints).

- [ ] **Step 1: Implementar o componente**

Crie `src/components/dashboard/user-menu.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

import { useLogout } from "@/hooks/use-logout";
import { Button } from "@/components/ui/button";

interface UserMenuProps {
  usuarioNome: string;
  empresaNome: string;
}

export function UserMenu({ usuarioNome, empresaNome }: UserMenuProps) {
  const router = useRouter();
  const logout = useLogout();

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => router.push("/login"),
    });
  }

  return (
    <div className="flex flex-col gap-2 px-2 py-1">
      <div className="text-sm">
        <p className="font-medium">{usuarioNome}</p>
        <p className="text-muted-foreground text-xs">{empresaNome}</p>
      </div>
      {logout.isError && (
        <p className="text-destructive text-xs">{logout.error.message}</p>
      )}
      <Button variant="outline" size="sm" disabled={logout.isPending} onClick={handleLogout}>
        {logout.isPending ? "Saindo..." : "Sair"}
      </Button>
    </div>
  );
}
```

`UserMenu` renderiza só o conteúdo (nomes + botão), sem se auto-envolver em `SidebarFooter` — quem decide onde isso entra na árvore da sidebar é `DashboardSidebar` (Task 2), que recebe este componente via a prop `footer` e o envolve no próprio `SidebarFooter` do shadcn. Isso evita `UserMenu` acoplado a uma posição estrutural específica dentro da sidebar.

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: sem novos erros introduzidos por este arquivo (o componente ainda não é usado em lugar nenhum até a Task 4, então isso confirma só que o arquivo em si é válido).

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/user-menu.tsx
git commit -m "feat: add dashboard user menu with logout"
```

---

### Task 4: Layout do shell + páginas (`/dashboard`, `/dashboard/memorial`, `/dashboard/comunique-se`)

**Files:**
- Modify: `src/app/dashboard/page.tsx` (reescrever completamente — hoje é o placeholder de uma linha)
- Create: `src/app/dashboard/layout.tsx`
- Create: `src/app/dashboard/memorial/page.tsx`
- Create: `src/app/dashboard/comunique-se/page.tsx`

**Interfaces:**
- Consumes: `getSessionUser` de `@/lib/auth/session` (já existe), `buscarNomesUsuarioEEmpresa` de `@/db/queries/usuario` (Task 1), `DashboardSidebar` de `@/components/dashboard/sidebar` (Task 2), `UserMenu` de `@/components/dashboard/user-menu` (Task 3), `SidebarProvider`/`SidebarInset`/`SidebarTrigger` de `@/components/ui/sidebar` (Task 2's install).
- Produces: nada consumido por tasks futuras deste plano — esta é a task de integração final antes da verificação manual.

- [ ] **Step 1: Criar o layout do shell**

Crie `src/app/dashboard/layout.tsx`:

```tsx
import { getSessionUser } from "@/lib/auth/session";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessionUser();
  const nomes = sessao ? await buscarNomesUsuarioEEmpresa(sessao.userId) : null;

  return (
    <SidebarProvider>
      <DashboardSidebar
        footer={
          nomes && <UserMenu usuarioNome={nomes.usuarioNome} empresaNome={nomes.empresaNome} />
        }
      />
      <SidebarInset>
        <header className="flex h-14 items-center border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

`DashboardSidebar` recebe `UserMenu` via a prop `footer` e o envolve no próprio `SidebarFooter` do shadcn (Task 2) — assim `SidebarFooter` fica corretamente aninhado dentro de `<Sidebar>`, não como filho solto de `SidebarProvider` (`SidebarFooter` é posicionado via flexbox pelo `Sidebar` que o envolve; fora dele, não se junta visualmente à sidebar).

Se `sessao` for `null` (não deveria ser alcançável — o middleware já protege `/dashboard/:path*` — mas por defesa em profundidade), `nomes` fica `null` e o `UserMenu` simplesmente não renderiza, sem quebrar a página.

- [ ] **Step 2: Reescrever a home do dashboard**

Substitua todo o conteúdo de `src/app/dashboard/page.tsx` por:

```tsx
import Link from "next/link";

import { getSessionUser } from "@/lib/auth/session";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function DashboardPage() {
  const sessao = await getSessionUser();
  const nomes = sessao ? await buscarNomesUsuarioEEmpresa(sessao.userId) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Olá, {nomes?.usuarioNome ?? "usuário"}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/dashboard/memorial">
          <Card className="hover:bg-accent transition-colors">
            <CardHeader>
              <CardTitle>Memorial Descritivo</CardTitle>
              <CardDescription>Gerar documento técnico a partir de um formulário.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/dashboard/comunique-se">
          <Card className="hover:bg-accent transition-colors">
            <CardHeader>
              <CardTitle>Comunique-se</CardTitle>
              <CardDescription>Traduzir exigências da prefeitura em checklist.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Criar as páginas placeholder dos 2 módulos**

Crie `src/app/dashboard/memorial/page.tsx`:

```tsx
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function MemorialPage() {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Memorial Descritivo</CardTitle>
        <CardDescription>Em breve.</CardDescription>
      </CardHeader>
    </Card>
  );
}
```

Crie `src/app/dashboard/comunique-se/page.tsx`:

```tsx
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ComuniqueSePage() {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Comunique-se</CardTitle>
        <CardDescription>Em breve.</CardDescription>
      </CardHeader>
    </Card>
  );
}
```

- [ ] **Step 4: Rodar a suíte inteira e o build**

Run: `npm test`
Expected: PASS — todos os testes anteriores + os 6 novos desta feature (2 da query + 4 do `ehItemAtivo`) verdes.

Run: `npm run build`
Expected: build passa, `/dashboard`, `/dashboard/memorial`, `/dashboard/comunique-se` aparecem na saída como rotas geradas.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/layout.tsx src/app/dashboard/page.tsx src/app/dashboard/memorial/page.tsx src/app/dashboard/comunique-se/page.tsx
git commit -m "feat: build authenticated dashboard shell with sidebar and module placeholders"
```

---

### Task 5: Verificação manual do fluxo completo

**Files:** nenhum (task de verificação, sem código novo — só um commit final se algo precisar de ajuste).

**Interfaces:** nenhuma — consome tudo das Tasks 1-4.

- [ ] **Step 1: Build e suíte completos**

Run: `npm run build`
Expected: sucesso, sem erros.

Run: `npm test`
Expected: 100% dos testes passando.

- [ ] **Step 2: Subir o servidor de dev e verificar manualmente (use Playwright ou navegador real)**

Run: `npm run dev -- -p 3100` (porta alternativa pra não colidir com outro processo)

Com um usuário já registrado (ou registre um novo via `/register`):

1. Acesse `/dashboard` autenticado. Confirme: sidebar aparece com 2 itens de nav (Memorial Descritivo, Comunique-se); nome da empresa e do usuário aparecem no rodapé da sidebar; a home mostra "Olá, {nome}" + os 2 cards.
2. Clique no card/nav "Memorial Descritivo". Confirme: navega pra `/dashboard/memorial`, mostra "Em breve", o item correspondente na sidebar aparece marcado como ativo.
3. Clique no card/nav "Comunique-se". Confirme o mesmo, pra `/dashboard/comunique-se`.
4. Clique em "Sair". Confirme: redireciona pra `/login` (sem `from=` na URL); tentar acessar `/dashboard` de novo exige login.
5. Redimensione a janela pra largura mobile (ou use as ferramentas de emulação do navegador). Confirme: a sidebar se comporta como drawer/overlay (comportamento nativo do `Sidebar` do shadcn — só confirme que não quebra, não que tenha uma aparência específica).

- [ ] **Step 3: Parar o servidor de dev**

Confirme que o processo foi encerrado (não deixar rodando em background).

- [ ] **Step 4: Commit final, só se algo precisou de ajuste**

Se a verificação manual encontrar algo quebrado, corrija e comite:

```bash
git add -A
git commit -m "fix: <descrição específica do que a verificação manual encontrou>"
```

Se tudo passou de primeira, esta task não gera commit — só confirma o que já está feito.
