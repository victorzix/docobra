# Landing Page (Página de Vendas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o boilerplate do `create-next-app` em `src/app/page.tsx`
por uma landing page real de apresentação/vendas do DocObra, com hero (cena 3D
com scroll), seção "como funciona" (com screenshots reais do app), planos
(sem preço), FAQ, e CTA final — tudo em `/`, sempre visível, sem redirect
condicionado à sessão.

**Architecture:** Feature puramente de frontend/apresentação. `src/app/page.tsx`
vira um Server Component fino que só busca a sessão (`getSessionUser()`) e
empilha seis seções isoladas de `src/components/landing/`. Cada seção é um
componente com uma responsabilidade só; a única com estado/lógica de
scroll é `scroll-scene.tsx` (Anime.js). Sem rota de API nova, sem mutação,
sem schema novo.

**Tech Stack:** Next.js App Router (Server Components), Framer Motion
(`whileInView`), Anime.js v4 (`onScroll`), shadcn/ui (`Button`, `Card`,
`Accordion` — este último ainda não instalado).

## Global Constraints

- **Sem rota de API, mutação ou schema novo.** Toda a feature vive em
  `src/app/page.tsx` + `src/components/landing/`.
- **Sem redirect condicional por sessão.** `/` sempre renderiza a landing,
  logado ou não — decisão explícita, revertendo uma proposta inicial. A
  única coisa que muda com a sessão é o CTA do header.
- **Anime.js fica restrito a `src/components/landing/scroll-scene.tsx`.**
  Nenhum outro arquivo desta feature usa Anime.js — o resto usa Framer
  Motion (`whileInView`), consistente com o resto do app.
- **Sem teste automatizado nesta feature.** Mesmo padrão já confirmado nos
  planos irmãos (`2026-08-21-comunique-se-editar-exportar.md`,
  `2026-08-21-comunique-se-patch2-pos-criacao.md`): não há RTL/jsdom neste
  projeto (`vitest.config.ts` roda com `environment: "node"`), e não faz
  sentido adicionar jsdom só pra esta feature sem lógica de negócio. Cada
  task fecha com `npx tsc --noEmit -p tsconfig.json` (zero erros) e a
  verificação final é manual, via dev server (Task 9).
- **Copy toda em PT-BR**, tom direto — mesmo estilo de
  `src/app/(auth)/register/register-form.tsx`.
- **Sem preço em R$ nos planos.** Os dois CTAs de plano ("Começar agora")
  levam pra `/register`, sem seleção de plano real — o campo `plano` da
  tabela `Empresa` não é setado dinamicamente por esta feature.
- **Linguagem visual consistente com as telas de auth**: navy escuro
  (`#0a2c4d`) + cyan (`cyan-400`/`cyan-600`/`cyan-700`) como acento, `font-mono`
  pra rótulos pequenos em caixa alta (mesmo padrão de
  `register-form.tsx`).
- **`Accordion` do shadcn ainda não existe** em `src/components/ui/` —
  precisa ser adicionado via `npx shadcn@latest add accordion` antes de
  ser usado (Task 7). Não escrever um accordion à mão.
- **`getSessionUser()`** (`src/lib/auth/session.ts`) é a única fonte de
  sessão usada — mesma função que `src/app/dashboard/layout.tsx:16` já usa.
  Chamada uma única vez, em `page.tsx`; `LandingHeader` recebe o resultado
  como prop booleana (`logado`), nunca chama `getSessionUser()` sozinho —
  isso mantém `LandingHeader` um componente puro/presentacional.

---

### Task 1: `LandingHeader`

**Files:**
- Create: `src/components/landing/header.tsx`

**Interfaces:**
- Consumes: `Button` de `@/components/ui/button`, `Link` de `next/link`.
- Produces: `export function LandingHeader(props: { logado: boolean }): JSX.Element`. Task 9 usa este componente.

**Sem teste automatizado nesta task** (ver Global Constraints). Cobertura
vem da verificação manual (Task 9).

- [ ] **Step 1: Implementar o componente**

Crie `src/components/landing/header.tsx`:

```tsx
import Link from "next/link";

import { Button } from "@/components/ui/button";

const LINKS_NAV = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader({ logado }: { logado: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a2c4d]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0a2c4d]/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-mono text-lg font-semibold tracking-tight text-white">
          DocObra
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS_NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-slate-300 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {logado ? (
            <Button asChild size="sm" className="bg-cyan-600 text-white hover:bg-cyan-500">
              <Link href="/dashboard">Ir pro dashboard</Link>
            </Button>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-sm text-slate-300 transition-colors hover:text-white sm:inline"
              >
                Entrar
              </Link>
              <Button asChild size="sm" className="bg-cyan-600 text-white hover:bg-cyan-500">
                <Link href="/register">Cadastre-se</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/header.tsx
git commit -m "feat: add landing page header with session-aware CTA"
```

---

### Task 2: `ScrollScene` (cena 3D com Anime.js, guiada por scroll)

**Files:**
- Create: `src/components/landing/scroll-scene.tsx`

**Interfaces:**
- Consumes: `animate`, `createDrawable`, `createScope`, `createTimeline`, `onScroll`, `stagger` de `animejs` (já instalado, `"animejs": "^4.5.0"`).
- Produces: `export function ScrollScene(): JSX.Element`. Task 3 usa este componente.

**Referência de implementação:** adaptado de `src/app/(auth)/floor-scene.tsx`
(mesmo padrão de planta baixa isométrica desenhada por `createDrawable` +
`createTimeline`), trocando o autoplay-e-loop por `onScroll` (scroll-driven,
`sync: true`) — sem o drag por ponteiro (não faz sentido numa cena de
fundo do hero).

**Sem teste automatizado nesta task** (ver Global Constraints). Cobertura
vem da verificação manual (Task 9).

- [ ] **Step 1: Implementar o componente**

Crie `src/components/landing/scroll-scene.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { createDrawable, createScope, createTimeline, onScroll, stagger, type Scope } from "animejs";

const WALLS = [
  { key: "top", x1: 10, y1: 10, x2: 230, y2: 10 },
  { key: "right", x1: 230, y1: 10, x2: 230, y2: 170 },
  { key: "bottom", x1: 230, y1: 170, x2: 10, y2: 170 },
  { key: "left", x1: 10, y1: 170, x2: 10, y2: 10 },
  { key: "div-v-a", x1: 120, y1: 10, x2: 120, y2: 35 },
  { key: "div-v-b", x1: 120, y1: 60, x2: 120, y2: 170 },
  { key: "div-h-a", x1: 10, y1: 90, x2: 180, y2: 90 },
  { key: "div-h-b", x1: 205, y1: 90, x2: 230, y2: 90 },
];

const ROOMS = [
  { key: "sala", x: 98, y: 84, label: "SALA" },
  { key: "quarto", x: 175, y: 72, label: "QUARTO" },
  { key: "cozinha", x: 65, y: 112, label: "COZINHA" },
  { key: "banho", x: 175, y: 148, label: "BANHO" },
];

type Furniture =
  | { key: string; type: "rect"; x: number; y: number; width: number; height: number }
  | { key: string; type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { key: string; type: "circle"; cx: number; cy: number; r: number }
  | { key: string; type: "ellipse"; cx: number; cy: number; rx: number; ry: number };

const FURNITURE: Furniture[] = [
  { key: "sofa-body", type: "rect", x: 16, y: 18, width: 16, height: 46 },
  { key: "sofa-seam-1", type: "line", x1: 16, y1: 33, x2: 32, y2: 33 },
  { key: "sofa-seam-2", type: "line", x1: 16, y1: 49, x2: 32, y2: 49 },
  { key: "mesa-centro", type: "rect", x: 40, y: 32, width: 18, height: 16 },
  { key: "cama-corpo", type: "rect", x: 145, y: 16, width: 48, height: 32 },
  { key: "cama-travesseiro", type: "rect", x: 150, y: 19, width: 38, height: 9 },
  { key: "bancada", type: "rect", x: 16, y: 148, width: 98, height: 13 },
  { key: "fogao-1", type: "circle", cx: 40, cy: 154.5, r: 4 },
  { key: "fogao-2", type: "circle", cx: 55, cy: 154.5, r: 4 },
  { key: "pia-cozinha", type: "rect", x: 90, y: 150, width: 16, height: 9 },
  { key: "vaso-tanque", type: "rect", x: 198, y: 98, width: 15, height: 9 },
  { key: "vaso-bacia", type: "ellipse", cx: 205.5, cy: 119, rx: 9, ry: 12 },
  { key: "pia-banho-bancada", type: "rect", x: 133, y: 98, width: 22, height: 11 },
  { key: "pia-banho-cuba", type: "circle", cx: 144, cy: 103.5, r: 3.5 },
];

export function ScrollScene() {
  const root = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<Scope | null>(null);

  useEffect(() => {
    scopeRef.current = createScope({ root }).add(() => {
      if (!root.current) return;
      const target = root.current;

      const walls = createDrawable(".wall");
      const furniture = createDrawable(".furniture");

      createTimeline({
        autoplay: onScroll({
          target,
          sync: true,
          enter: "bottom bottom",
          leave: "top top",
        }),
      })
        .add(walls, {
          draw: ["0 0", "0 1"],
          duration: 500,
          delay: stagger(110),
          ease: "inOutSine",
        })
        .add(
          furniture,
          { draw: ["0 0", "0 1"], duration: 350, delay: stagger(45), ease: "outQuad" },
          "-=100",
        )
        .add(".room-label", { opacity: [0, 1], duration: 300, delay: stagger(70) }, "-=150")
        .add(".scene-wrap", { rotateZ: [0, 340], duration: 900, ease: "linear" }, "-=100");
    });

    return () => scopeRef.current?.revert();
  }, []);

  return (
    <div ref={root} className="pointer-events-none flex h-full w-full items-center justify-center">
      <div style={{ perspective: "1400px" }}>
        <div className="scene-wrap" style={{ transformStyle: "preserve-3d", transform: "rotateX(58deg)" }}>
          <svg width={280} height={200} viewBox="0 0 240 180" fill="none">
            {WALLS.map((w) => (
              <line
                key={w.key}
                className="wall"
                x1={w.x1}
                y1={w.y1}
                x2={w.x2}
                y2={w.y2}
                stroke="#67e8f9"
                strokeWidth={2}
                strokeLinecap="square"
              />
            ))}
            {FURNITURE.map((f) => {
              const props = {
                key: f.key,
                className: "furniture",
                stroke: "#67e8f9",
                strokeWidth: 1.25,
                strokeLinecap: "round" as const,
              };
              if (f.type === "rect") {
                return <rect {...props} x={f.x} y={f.y} width={f.width} height={f.height} />;
              }
              if (f.type === "line") {
                return <line {...props} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />;
              }
              if (f.type === "circle") {
                return <circle {...props} cx={f.cx} cy={f.cy} r={f.r} />;
              }
              return <ellipse {...props} cx={f.cx} cy={f.cy} rx={f.rx} ry={f.ry} />;
            })}
            {ROOMS.map((r) => (
              <text
                key={r.key}
                className="room-label opacity-0"
                x={r.x}
                y={r.y}
                textAnchor="middle"
                fill="#67e8f9"
                fillOpacity={0.75}
                fontSize={9}
                fontFamily="var(--font-geist-mono)"
                letterSpacing={0.5}
              >
                {r.label}
              </text>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/scroll-scene.tsx
git commit -m "feat: add scroll-driven 3D scene for landing hero"
```

---

### Task 3: `Hero`

**Files:**
- Create: `src/components/landing/hero.tsx`

**Interfaces:**
- Consumes: `ScrollScene` (Task 2), `Button` de `@/components/ui/button`, `motion` de `framer-motion`, `Link` de `next/link`.
- Produces: `export function Hero(): JSX.Element`. Task 9 usa este componente.

**Sem teste automatizado nesta task** (ver Global Constraints). Cobertura
vem da verificação manual (Task 9).

- [ ] **Step 1: Implementar o componente**

Crie `src/components/landing/hero.tsx`:

```tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { ScrollScene } from "./scroll-scene";

export function Hero() {
  return (
    <section className="relative flex h-screen min-h-[640px] items-center overflow-hidden bg-[#0a2c4d]">
      <div className="absolute inset-0 -z-0 opacity-80">
        <ScrollScene />
      </div>
      <div className="absolute inset-0 -z-0 bg-gradient-to-b from-[#0a2c4d]/40 via-[#0a2c4d]/70 to-[#0a2c4d]" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="font-mono text-xs font-medium tracking-widest text-cyan-400 uppercase"
        >
          Documentação técnica para engenharia e arquitetura
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl"
        >
          Documentação técnica sem perder o dia inteiro nela.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-5 text-lg text-slate-300"
        >
          Gere Memorial Descritivo em ABNT a partir de um formulário curto e
          traduza as exigências do Comunique-se da prefeitura em um checklist
          simples — os dois em minutos, não em horas.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8"
        >
          <Button
            asChild
            size="lg"
            className="bg-cyan-600 text-white shadow-lg shadow-cyan-900/30 hover:bg-cyan-500"
          >
            <Link href="/register">Comece agora</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/hero.tsx
git commit -m "feat: add landing page hero section"
```

---

### Task 4: Screenshots reais do dashboard (Memorial e Comunique-se)

**Files:**
- Create: `public/landing/screenshots/memorial.png`
- Create: `public/landing/screenshots/comunique-se.png`

**Interfaces:**
- Consumes: nada de código. Produz os dois arquivos de imagem que a Task 5
  (`ComoFunciona`) referencia via `next/image` em
  `/landing/screenshots/memorial.png` e `/landing/screenshots/comunique-se.png`.

**Sem teste automatizado nesta task** — é uma task de geração de conteúdo
estático, não de código. Cobertura é o próprio arquivo de imagem existir
com o conteúdo certo (conferido visualmente no Step 6).

As rotas existentes hoje: Memorial **não tem página de detalhe** (só lista
em `/dashboard/memorial`, com o formulário de criação num drawer); o
Comunique-se **tem** página de detalhe em `/dashboard/comunique-se/[id]`
com o checklist. Por isso os dois prints são de telas diferentes: o drawer
de criação do Memorial (ilustra "formulário curto") e a tela de detalhe do
Comunique-se (ilustra o checklist traduzido).

- [ ] **Step 1: Garantir que o dev server está rodando**

Verifique se `http://localhost:3000` responde. Se não, rode em background:

```bash
npm run dev
```

Aguarde a mensagem `Ready` antes de prosseguir.

- [ ] **Step 2: Criar uma conta demo via Playwright**

Use `mcp__playwright__browser_navigate` pra ir em `http://localhost:3000/register`
e `mcp__playwright__browser_fill_form` (ou `browser_type` campo a campo) pra
criar uma conta com:
- Nome da empresa: `DocObra Demo`
- Seu nome: `Demo`
- Email: `demo-landing@docobra.local`
- Senha: `DemoLanding123!`

Envie o formulário e confirme que caiu em `/dashboard`.

- [ ] **Step 3: Criar um projeto de exemplo**

Em `/dashboard/projetos`, use o fluxo já existente de criação de projeto
(dialog "Novo projeto") pra criar um projeto chamado `Residência Vista Mar`.

- [ ] **Step 4: Screenshot do formulário do Memorial Descritivo**

Vá em `/dashboard/memorial`, abra o drawer de novo Memorial (botão "Novo
Memorial Descritivo"), selecione o projeto `Residência Vista Mar` e
preencha alguns campos do formulário (não precisa enviar). Com o drawer
aberto e preenchido, tire um screenshot recortado só na área do drawer
(`mcp__playwright__browser_take_screenshot` com o `ref` do elemento do
drawer, não a tela inteira) e salve em `public/landing/screenshots/memorial.png`.

- [ ] **Step 5: Screenshot do checklist do Comunique-se**

Em `/dashboard/comunique-se`, crie um Comunique-se usando o modo "Digitar"
(criação manual, já existente) pro projeto `Residência Vista Mar`, com um
título como `Comunique-se — Alvará de Construção` e 4 itens de checklist,
por exemplo:
- `Apresentar ART do responsável técnico`
- `Regularizar recuo lateral mínimo de 1,5m`
- `Anexar planta de situação atualizada`
- `Comprovar taxa de permeabilidade do lote`

Abra a página de detalhe desse Comunique-se (`/dashboard/comunique-se/[id]`)
e tire um screenshot recortado na área do card do checklist, salvo em
`public/landing/screenshots/comunique-se.png`.

- [ ] **Step 6: Conferir os dois arquivos**

Confirme que os dois PNGs existem e abrem como imagem válida:

```bash
file public/landing/screenshots/memorial.png public/landing/screenshots/comunique-se.png
```

Expected: `PNG image data` nas duas linhas.

- [ ] **Step 7: Commit**

```bash
git add public/landing/screenshots/memorial.png public/landing/screenshots/comunique-se.png
git commit -m "feat: add real dashboard screenshots for landing page"
```

---

### Task 5: `ComoFunciona`

**Files:**
- Create: `src/components/landing/como-funciona.tsx`

**Interfaces:**
- Consumes: `motion` de `framer-motion`, `Image` de `next/image`, os dois
  PNGs da Task 4 (`/landing/screenshots/memorial.png`,
  `/landing/screenshots/comunique-se.png`).
- Produces: `export function ComoFunciona(): JSX.Element` (seção com
  `id="como-funciona"`, âncora do header — Task 1). Task 9 usa este
  componente.

**Sem teste automatizado nesta task** (ver Global Constraints). Cobertura
vem da verificação manual (Task 9).

- [ ] **Step 1: Implementar o componente**

Crie `src/components/landing/como-funciona.tsx`:

```tsx
"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const BLOCOS = [
  {
    key: "memorial",
    titulo: "Memorial Descritivo em minutos",
    descricao:
      "Preencha um formulário curto — pode ser até por áudio — e receba um documento técnico completo, já formatado em ABNT, pronto pra protocolar.",
    imagem: "/landing/screenshots/memorial.png",
    alt: "Formulário de criação do Memorial Descritivo no DocObra",
  },
  {
    key: "comunique-se",
    titulo: "Entenda o Comunique-se sem reler o PDF inteiro",
    descricao:
      "Suba o PDF que a prefeitura emitiu e receba um checklist em linguagem simples, com cada exigência traduzida em uma tarefa objetiva.",
    imagem: "/landing/screenshots/comunique-se.png",
    alt: "Checklist de exigências do Comunique-se no DocObra",
  },
];

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="bg-background px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-xs font-medium tracking-widest text-cyan-700 uppercase">
            Como funciona
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Dois módulos, dois problemas resolvidos
          </h2>
        </div>

        <div className="mt-16 grid gap-16">
          {BLOCOS.map((bloco, indice) => (
            <motion.div
              key={bloco.key}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className={`grid items-center gap-10 md:grid-cols-2 ${
                indice % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div className="overflow-hidden rounded-xl border shadow-sm">
                <Image
                  src={bloco.imagem}
                  alt={bloco.alt}
                  width={960}
                  height={640}
                  className="h-auto w-full"
                />
              </div>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight">{bloco.titulo}</h3>
                <p className="mt-3 text-muted-foreground">{bloco.descricao}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/como-funciona.tsx
git commit -m "feat: add landing page 'como funciona' section"
```

---

### Task 6: `Planos`

**Files:**
- Create: `src/components/landing/planos.tsx`

**Interfaces:**
- Consumes: `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter` de `@/components/ui/card`, `Button` de `@/components/ui/button`, `Check` de `lucide-react`, `Link` de `next/link`.
- Produces: `export function Planos(): JSX.Element` (seção com `id="planos"`,
  âncora do header — Task 1). Task 9 usa este componente.

**Sem teste automatizado nesta task** (ver Global Constraints). Cobertura
vem da verificação manual (Task 9).

- [ ] **Step 1: Implementar o componente**

Crie `src/components/landing/planos.tsx`:

```tsx
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PLANOS = [
  {
    key: "essencial",
    nome: "Essencial",
    descricao: "Pra quem tá começando a validar o fluxo digital.",
    destaque: false,
    itens: [
      "Projetos limitados por mês",
      "Memorial Descritivo completo",
      "Tradutor de Comunique-se completo",
      "Suporte por email",
    ],
  },
  {
    key: "escritorio",
    nome: "Escritório",
    descricao: "Pra escritórios com volume maior de projetos rodando ao mesmo tempo.",
    destaque: true,
    itens: [
      "Projetos ilimitados",
      "Memorial Descritivo completo",
      "Tradutor de Comunique-se completo",
      "Suporte prioritário",
    ],
  },
];

export function Planos() {
  return (
    <section id="planos" className="bg-muted/30 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-xs font-medium tracking-widest text-cyan-700 uppercase">
            Planos
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Um plano pra cada volume de projeto
          </h2>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-6 sm:grid-cols-2">
          {PLANOS.map((plano) => (
            <Card
              key={plano.key}
              className={plano.destaque ? "border-cyan-600 shadow-md shadow-cyan-900/10" : ""}
            >
              <CardHeader>
                <CardTitle className="text-xl">{plano.nome}</CardTitle>
                <CardDescription>{plano.descricao}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-3">
                  {plano.itens.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-cyan-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full bg-cyan-600 text-white hover:bg-cyan-500">
                  <Link href="/register">Começar agora</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/planos.tsx
git commit -m "feat: add landing page planos section"
```

---

### Task 7: `Faq`

**Files:**
- Create: `src/components/ui/accordion.tsx` (via CLI)
- Create: `src/components/landing/faq.tsx`

**Interfaces:**
- Consumes: `Accordion`/`AccordionItem`/`AccordionTrigger`/`AccordionContent` de `@/components/ui/accordion`.
- Produces: `export function Faq(): JSX.Element` (seção com `id="faq"`,
  âncora do header — Task 1). Task 9 usa este componente.

**Sem teste automatizado nesta task** (ver Global Constraints). Cobertura
vem da verificação manual (Task 9).

- [ ] **Step 1: Adicionar o componente Accordion do shadcn**

```bash
npx shadcn@latest add accordion
```

Isso cria `src/components/ui/accordion.tsx` (baseado em
`@radix-ui/react-accordion`) e adiciona a dependência ao `package.json` —
segue o mesmo padrão dos demais componentes em `src/components/ui/`, não
escrito à mão.

- [ ] **Step 2: Implementar a seção FAQ**

Crie `src/components/landing/faq.tsx`:

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const PERGUNTAS = [
  {
    pergunta: "Meus dados de projeto ficam seguros?",
    resposta:
      "Sim. Cada empresa só acessa os próprios projetos, e os documentos gerados ficam vinculados exclusivamente à sua conta.",
  },
  {
    pergunta: "Que formato de PDF o Comunique-se aceita?",
    resposta:
      "Qualquer PDF emitido pela prefeitura como Comunique-se, desde que tenha texto (não só uma imagem escaneada sem camada de texto).",
  },
  {
    pergunta: "Dá pra usar pelo celular?",
    resposta: "Dá. O DocObra funciona direto no navegador do celular, sem precisar instalar nada.",
  },
  {
    pergunta: "Preciso ter o PDF do Comunique-se em mãos pra usar o sistema?",
    resposta:
      "Só pro módulo de tradução de exigências. O Memorial Descritivo você gera do zero, direto no formulário.",
  },
  {
    pergunta: "Quanto tempo leva pra gerar um documento?",
    resposta: "Poucos minutos — o formulário é curto e o processamento é automático.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="bg-background px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="font-mono text-xs font-medium tracking-widest text-cyan-700 uppercase">
            FAQ
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Perguntas frequentes</h2>
        </div>

        <Accordion type="single" collapsible className="mt-12">
          {PERGUNTAS.map((item, indice) => (
            <AccordionItem key={item.pergunta} value={`item-${indice}`}>
              <AccordionTrigger className="text-left">{item.pergunta}</AccordionTrigger>
              <AccordionContent>{item.resposta}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ui/accordion.tsx src/components/landing/faq.tsx
git commit -m "feat: add landing page FAQ section"
```

---

### Task 8: `CtaFooter`

**Files:**
- Create: `src/components/landing/cta-footer.tsx`

**Interfaces:**
- Consumes: `Button` de `@/components/ui/button`, `Link` de `next/link`.
- Produces: `export function CtaFooter(): JSX.Element`. Task 9 usa este
  componente.

**Sem teste automatizado nesta task** (ver Global Constraints). Cobertura
vem da verificação manual (Task 9).

- [ ] **Step 1: Implementar o componente**

Crie `src/components/landing/cta-footer.tsx`:

```tsx
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function CtaFooter() {
  const ano = new Date().getFullYear();

  return (
    <>
      <section className="bg-[#0a2c4d] px-6 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            Pronto pra parar de perder tempo com documentação?
          </h2>
          <p className="mt-4 text-slate-300">
            Crie sua conta e gere seu primeiro Memorial Descritivo ainda hoje.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 bg-cyan-600 text-white shadow-lg shadow-cyan-900/30 hover:bg-cyan-500"
          >
            <Link href="/register">Comece agora</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#081f38] px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-slate-400 sm:flex-row">
          <span>© {ano} DocObra.</span>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-white">
              Entrar
            </Link>
            <Link href="/register" className="hover:text-white">
              Cadastre-se
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/cta-footer.tsx
git commit -m "feat: add landing page final CTA and footer"
```

---

### Task 9: Montar `page.tsx` e verificação manual

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getSessionUser` de `@/lib/auth/session`, `LandingHeader` (Task 1), `Hero` (Task 3), `ComoFunciona` (Task 5), `Planos` (Task 6), `Faq` (Task 7), `CtaFooter` (Task 8).
- Produces: nada consumido por outras tasks — última task do plano.

- [ ] **Step 1: Substituir o boilerplate por `page.tsx` real**

Substitua todo o conteúdo de `src/app/page.tsx` por:

```tsx
import { getSessionUser } from "@/lib/auth/session";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { ComoFunciona } from "@/components/landing/como-funciona";
import { Planos } from "@/components/landing/planos";
import { Faq } from "@/components/landing/faq";
import { CtaFooter } from "@/components/landing/cta-footer";

export default async function Home() {
  const sessao = await getSessionUser();

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader logado={!!sessao} />
      <Hero />
      <ComoFunciona />
      <Planos />
      <Faq />
      <CtaFooter />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero erros.

- [ ] **Step 3: Verificação manual — deslogado**

Com o dev server rodando (`npm run dev`), abra `/` num navegador (ou via
Playwright) sem sessão ativa (aba anônima, ou depois de um logout). Confirme:
- Header mostra "Entrar" + "Cadastre-se".
- Hero renderiza com a cena 3D de fundo, e ela anima conforme a página é
  rolada (a planta baixa vai se desenhando e girando).
- Os três links do header (`Como funciona`, `Planos`, `FAQ`) rolam pra suas
  seções.
- As duas imagens da seção "Como funciona" carregam (os PNGs da Task 4).
- Os dois cards de plano aparecem sem nenhum valor em R$.
- O accordion do FAQ abre/fecha ao clicar em cada pergunta.
- Todo botão/link "Comece agora" / "Começar agora" / "Cadastre-se" leva pra
  `/register`; "Entrar" leva pra `/login`.

- [ ] **Step 4: Verificação manual — logado**

Logado (ex.: com a conta demo criada na Task 4), abra `/` de novo. Confirme
que o header agora mostra só "Ir pro dashboard" (sem "Entrar"/"Cadastre-se"),
e que o resto da página (hero, seções, CTA final) renderiza normalmente —
sem nenhum redirect automático pra `/dashboard`.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: assemble landing page at the app root"
```
