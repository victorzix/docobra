# Planos — Fase 4b (telas de planos e pagamento, lançamento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a tela `/dashboard/planos` (assinar, renovar, upgrade por Pix com polling), a coleta de CPF/CNPJ no cadastro, os ajustes de backend adiados da 4a e o checklist de lançamento.

**Architecture:** Um loader de servidor (`carregarTelaDePlanos`) decide a ação de cada plano (`assinar | renovar | upgrade | suporte | atual`) reaproveitando `derivarStatus`, `simularUpgrade` e as regras de `iniciarCobranca`; a página server entrega dados serializados a um client component que usa React Query (mutation de cobrança, query com polling) e um Dialog shadcn para o Pix. Validação de CPF/CNPJ vive em uma função pura compartilhada por registro, `PUT /api/empresa/documento` e pelo diálogo.

**Tech Stack:** Next.js App Router, Drizzle + Postgres, React Query, RHF + Zod 4, shadcn/ui (Dialog, Card, Button, Form), Framer Motion, Vitest (ambiente `node`, banco `docobra-local-test`).

Spec: `docs/superpowers/specs/2026-10-26-planos-fase-4b-design.md`.

## Global Constraints

- Branch de trabalho: `feat/planos-fase-4b`. Implementadores commitam só nela, com o trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; nunca `git add -A` (adicionar arquivos pelo nome), nunca push nem merge.
- Comentários só quando o PORQUÊ não é óbvio; sem comentário que descreve o que o código faz.
- Sem abstração além do pedido; validar só nas bordas; preferir editar arquivo existente a criar novo.
- Schemas Zod por operação em `lib/validations/<entidade>/<operacao>.schema.ts`, nunca inline no componente.
- Framer Motion é o padrão de animação; **proibido Anime.js** no dashboard.
- shadcn/ui é a base; não criar componente do zero se o shadcn cobre. Estado de servidor em React Query; sem Zustand nesta fase; no máximo um nível de props.
- Dinheiro sempre em centavos inteiros; `formatarReais` só na borda da exibição.
- Não trocar o provider default de LLM; não mexer no `core/payments` além do descrito.
- Testes rodam no banco real `docobra-local-test` (`vitest.setup.ts` aborta se a URL não for a de teste): **nunca duas execuções de vitest ao mesmo tempo**. Comando: `npx vitest run <caminho>`.
- O ambiente de testes é `node`: **não há testes de componente**. Componentes (`.tsx`) são verificados com `npx tsc --noEmit`, `npx eslint <arquivos>` (existem 12 erros de lint antigos em arquivos fora desta fase; os arquivos tocados aqui devem ficar limpos) e, ao final, pelo controlador no navegador.
- Não há biblioteca de toast no projeto e não se adiciona uma: erros aparecem em um aviso inline (div com `border-destructive/30 bg-destructive/10`, como em `register-form.tsx`).
- Documentos de teste válidos: CPF `52998224725` (`529.982.247-25`) e `12345678909`; CNPJ `11222333000181` (`11.222.333/0001-81`). O CNPJ `12345678000199` usado em fixtures antigas **não** passa nos dígitos verificadores.

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/pagamentos/documento.ts` (novo) | `validarDocumento`, `mascararDocumento` (puras) |
| `src/lib/validations/empresa/documento.schema.ts` | `documentoSchema` reutilizável + `atualizarDocumentoSchema` |
| `src/lib/validations/auth/register.schema.ts`, `src/app/api/auth/register/route.ts`, `src/app/(auth)/register/register-form.tsx` | campo `documento` no cadastro |
| `src/app/api/cobrancas/route.ts` | `GATEWAY_RECUSOU` |
| `src/lib/pagamentos/efeitos.ts` | pagamento sobre assinatura suspensa reinicia o ciclo |
| `src/lib/formatar.ts` (novo) | `formatarReais`, `formatarData`, `rotuloDoCiclo` |
| `src/lib/planos/descrever-limites.ts` (novo) | limites do plano como lista de textos |
| `src/lib/planos/descrever-assinatura.ts` (novo) | título/detalhe/tom do resumo da assinatura |
| `src/db/queries/plano.ts` | `listarPlanosPublicos` |
| `src/lib/planos/carregar-tela-de-planos.ts` (novo) | dados serializáveis da tela + ação de cada card |
| `src/hooks/use-criar-cobranca.ts`, `use-cobranca.ts`, `use-salvar-documento.ts` (novos) | mutation, polling, salvar documento |
| `src/components/planos/pix-dialog.tsx`, `documento-dialog.tsx`, `plano-card.tsx`, `planos-tela.tsx` (novos) | UI |
| `src/app/dashboard/planos/page.tsx` (novo), `src/components/dashboard/sidebar.tsx` | rota e navegação |
| `src/components/common/uso-do-modulo.tsx` + 3 páginas do dashboard | "Falar com o suporte" vira "Ver planos" |
| `docs/pagamentos-asaas.md` | checklist de lançamento |

---

### Task 1: Validação e máscara de CPF/CNPJ

**Files:**
- Create: `src/lib/pagamentos/documento.ts`
- Create: `src/lib/pagamentos/__tests__/documento.test.ts`
- Create: `src/lib/validations/empresa/__tests__/documento.schema.test.ts`
- Modify: `src/lib/validations/empresa/documento.schema.ts`
- Modify: `src/app/api/empresa/documento/__tests__/route.test.ts` (fixtures com CNPJ inválido)

**Interfaces:**
- Produces: `validarDocumento(valor: string): boolean`, `mascararDocumento(valor: string): string`, `documentoSchema` (string → só dígitos, valida dígitos verificadores), `atualizarDocumentoSchema` (`{ documento: documentoSchema }`) e o tipo `AtualizarDocumentoInput`.

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/pagamentos/__tests__/documento.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { mascararDocumento, validarDocumento } from "../documento";

describe("validarDocumento", () => {
  it.each(["52998224725", "529.982.247-25", "12345678909", "11222333000181", "11.222.333/0001-81"])(
    "aceita %s",
    (documento) => {
      expect(validarDocumento(documento)).toBe(true);
    },
  );

  it.each([
    "",
    "123",
    "52998224724",
    "11222333000180",
    "12345678000199",
    "11111111111",
    "00000000000000",
    "abcdefghijk",
    "5299822472",
    "112223330001811",
  ])("recusa %j", (documento) => {
    expect(validarDocumento(documento)).toBe(false);
  });
});

describe("mascararDocumento", () => {
  it.each([
    ["", ""],
    ["123", "123"],
    ["1234", "123.4"],
    ["52998224725", "529.982.247-25"],
    ["529982247250", "52.998.224/7250"],
    ["11222333000181", "11.222.333/0001-81"],
    ["11.222.333/0001-81", "11.222.333/0001-81"],
    ["112223330001819999", "11.222.333/0001-81"],
    ["a1b2c3", "123"],
  ])("%j vira %j", (entrada, saida) => {
    expect(mascararDocumento(entrada)).toBe(saida);
  });
});
```

`src/lib/validations/empresa/__tests__/documento.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { atualizarDocumentoSchema } from "../documento.schema";

describe("atualizarDocumentoSchema", () => {
  it("remove a máscara e devolve só os dígitos", () => {
    expect(atualizarDocumentoSchema.parse({ documento: "529.982.247-25" })).toEqual({ documento: "52998224725" });
    expect(atualizarDocumentoSchema.parse({ documento: "11.222.333/0001-81" })).toEqual({
      documento: "11222333000181",
    });
  });

  it.each(["", "123", "52998224724", "11111111111", "12345678000199"])("recusa %j", (documento) => {
    const resultado = atualizarDocumentoSchema.safeParse({ documento });
    expect(resultado.success).toBe(false);
  });

  it("a mensagem de erro é amigável", () => {
    const resultado = atualizarDocumentoSchema.safeParse({ documento: "123" });
    expect(resultado.success ? "" : resultado.error.issues[0].message).toBe("Informe um CPF ou CNPJ válido.");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/pagamentos/__tests__/documento.test.ts src/lib/validations/empresa/__tests__/documento.schema.test.ts`
Expected: FAIL (módulo `../documento` inexistente; schema aceita `12345678000199`).

- [ ] **Step 3: Implementar**

`src/lib/pagamentos/documento.ts`:

```ts
const PESOS_CPF = [
  [10, 9, 8, 7, 6, 5, 4, 3, 2],
  [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
];
const PESOS_CNPJ = [
  [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
];

// Mesma regra do módulo 11 para CPF e CNPJ: resto < 2 vira 0, senão 11 - resto.
function digitoVerificador(digitos: number[], pesos: number[]): number {
  const soma = digitos.reduce((acc, n, i) => acc + n * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarDocumento(valor: string): boolean {
  const limpo = valor.replace(/\D/g, "");
  if (limpo.length !== 11 && limpo.length !== 14) return false;

  const digitos = limpo.split("").map(Number);
  if (digitos.every((d) => d === digitos[0])) return false;

  const [pesos1, pesos2] = limpo.length === 11 ? PESOS_CPF : PESOS_CNPJ;
  const base = digitos.length - 2;
  return (
    digitoVerificador(digitos.slice(0, base), pesos1) === digitos[base] &&
    digitoVerificador(digitos.slice(0, base + 1), pesos2) === digitos[base + 1]
  );
}

function aplicarPadrao(digitos: string, padrao: string): string {
  let proximo = 0;
  let saida = "";
  for (const caractere of padrao) {
    if (proximo >= digitos.length) break;
    saida += caractere === "0" ? digitos[proximo++] : caractere;
  }
  return saida;
}

export function mascararDocumento(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 14);
  return aplicarPadrao(digitos, digitos.length <= 11 ? "000.000.000-00" : "00.000.000/0000-00");
}
```

`src/lib/validations/empresa/documento.schema.ts` (substituir o conteúdo):

```ts
import { z } from "zod";

import { validarDocumento } from "@/lib/pagamentos/documento";

export const documentoSchema = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ""))
  .pipe(z.string().refine(validarDocumento, "Informe um CPF ou CNPJ válido."));

export const atualizarDocumentoSchema = z.object({ documento: documentoSchema });

export type AtualizarDocumentoInput = z.infer<typeof atualizarDocumentoSchema>;
```

- [ ] **Step 4: Ajustar o teste da rota `PUT /api/empresa/documento`**

Em `src/app/api/empresa/documento/__tests__/route.test.ts`, trocar o CNPJ inválido `12345678000199` / `12.345.678/0001-99` pelo válido `11222333000181` / `11.222.333/0001-81` (inclusive nos `expect`s do valor salvo e devolvido) e acrescentar `"52998224724"` e `"11111111111"` à lista de documentos recusados com 400. O caso de CPF `123.456.789-09` continua válido e não muda.

- [ ] **Step 5: Rodar tudo do documento e ver passar**

Run: `npx vitest run src/lib/pagamentos/__tests__/documento.test.ts src/lib/validations/empresa src/app/api/empresa`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pagamentos/documento.ts src/lib/pagamentos/__tests__/documento.test.ts src/lib/validations/empresa src/app/api/empresa/documento/__tests__/route.test.ts
git commit -m "feat(planos): validacao de digitos verificadores e mascara de CPF/CNPJ" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: CPF/CNPJ no cadastro

**Files:**
- Modify: `src/lib/validations/auth/register.schema.ts`
- Modify: `src/lib/validations/auth/__tests__/register.schema.test.ts`
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/api/auth/register/__tests__/route.test.ts`
- Modify: `src/app/(auth)/register/register-form.tsx`

**Interfaces:**
- Consumes: `documentoSchema` (Task 1), `mascararDocumento` (Task 1).
- Produces: `registerSchema` com `documento` (só dígitos, válido); a rota grava `empresa.documento`.

- [ ] **Step 1: Atualizar os testes (falham)**

Em `src/lib/validations/auth/__tests__/register.schema.test.ts`: acrescentar `documento: "11222333000181"` ao payload válido usado pelos casos existentes e adicionar:

```ts
it("exige o documento e remove a máscara", () => {
  expect(registerSchema.safeParse({ ...payloadValido, documento: "" }).success).toBe(false);
  expect(registerSchema.safeParse({ ...payloadValido, documento: "11111111111" }).success).toBe(false);
  const ok = registerSchema.parse({ ...payloadValido, documento: "11.222.333/0001-81" });
  expect(ok.documento).toBe("11222333000181");
});
```

(Adaptar ao nome real da constante de payload do arquivo.) Em `src/app/api/auth/register/__tests__/route.test.ts`: `payloadValido` ganha `documento: "11222333000181"`; importar `empresa` já está feito; adicionar:

```ts
it("grava o documento da empresa só com dígitos", async () => {
  const response = await POST(criarRequest({ ...payloadValido, documento: "11.222.333/0001-81" }));
  expect(response.status).toBe(201);
  const [empresaCriada] = await db.select().from(empresa);
  expect(empresaCriada.documento).toBe("11222333000181");
});

it("rejeita documento ausente ou inválido com 400 e não cria nada", async () => {
  const { documento: _omitido, ...semDocumento } = payloadValido;
  expect((await POST(criarRequest(semDocumento))).status).toBe(400);
  expect((await POST(criarRequest({ ...payloadValido, documento: "11111111111" }))).status).toBe(400);
  expect(await db.select().from(empresa)).toHaveLength(0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/validations/auth src/app/api/auth/register`
Expected: FAIL (schema não tem `documento`; empresa criada sem documento).

- [ ] **Step 3: Implementar schema e rota**

`register.schema.ts`: importar `documentoSchema` de `@/lib/validations/empresa/documento.schema` e acrescentar ao objeto, depois de `nomeEmpresa`: `documento: documentoSchema,`.

`route.ts`: em `const { nomeEmpresa, nome, email, senha } = parsed.data;` incluir `documento`, e trocar o insert da empresa por `tx.insert(empresa).values({ nome: nomeEmpresa, documento }).returning()`.

- [ ] **Step 4: Campo no formulário**

Em `register-form.tsx`: importar `Hash` de `lucide-react` e `mascararDocumento` de `@/lib/pagamentos/documento`; `defaultValues` passa a `{ nomeEmpresa: "", documento: "", nome: "", email: "", senha: "" }`; inserir, logo depois do `FormField` de `nomeEmpresa` (e retirar o `autoFocus` só se o implementador preferir mantê-lo no primeiro campo: **manter** o `autoFocus` em `nomeEmpresa`), o campo:

```tsx
<FormField
  control={form.control}
  name="documento"
  render={({ field }) => (
    <FormItem>
      <FormLabel className="font-mono text-[11px] font-medium tracking-wider text-slate-500 uppercase">
        CPF ou CNPJ da empresa
      </FormLabel>
      <FormControl>
        <div className="relative">
          <Hash className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder="00.000.000/0000-00"
            className="pl-9 focus-visible:border-cyan-600 focus-visible:ring-cyan-500/30"
            {...field}
            onChange={(evento) => field.onChange(mascararDocumento(evento.target.value))}
          />
        </div>
      </FormControl>
      <p className="text-xs text-muted-foreground">Usado para emitir a cobrança do plano.</p>
      <FormMessage />
    </FormItem>
  )}
/>
```

- [ ] **Step 5: Rodar testes e checagens**

Run: `npx vitest run src/lib/validations/auth src/app/api/auth/register src/db/__tests__/seed-usuario.test.ts` → PASS.
Run: `npx tsc --noEmit` e `npx eslint "src/app/(auth)/register/register-form.tsx" src/app/api/auth/register src/lib/validations` → sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations/auth src/app/api/auth/register "src/app/(auth)/register/register-form.tsx"
git commit -m "feat(planos): CPF/CNPJ obrigatorio no cadastro da empresa" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `GATEWAY_RECUSOU` na rota de cobranças

**Files:**
- Modify: `src/app/api/cobrancas/route.ts:54-60`
- Modify: `src/app/api/cobrancas/__tests__/route.test.ts:132-145`

- [ ] **Step 1: Ajustar o teste (falha)**

Em `route.test.ts`, substituir o `it.each` de 502 (linhas 132-145) por dois casos:

```ts
it("falha incerta do gateway: 502 com mensagem amigável e sem código", async () => {
  const { token } = await sessao();
  vi.mocked(iniciarCobranca).mockRejectedValue(new FalhaIncertaError("timeout"));
  const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const resposta = await POST(requisicao({ tipo: "renovacao" }, token));

  expect(resposta.status).toBe(502);
  const corpo = await resposta.json();
  expect(corpo.error).toContain("tente de novo");
  expect(corpo.codigo).toBeUndefined();
  erroNoConsole.mockRestore();
});

it("recusa definitiva do gateway: 502 GATEWAY_RECUSOU", async () => {
  const { token } = await sessao();
  vi.mocked(iniciarCobranca).mockRejectedValue(new RecusaDefinitivaError("recusou"));
  const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const resposta = await POST(requisicao({ tipo: "renovacao" }, token));

  expect(resposta.status).toBe(502);
  expect(await resposta.json()).toEqual({
    error: "O provedor de pagamento recusou a cobrança. Confira o CPF/CNPJ da empresa ou fale com o suporte.",
    codigo: "GATEWAY_RECUSOU",
  });
  erroNoConsole.mockRestore();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/cobrancas/__tests__/route.test.ts` → FAIL no caso novo.

- [ ] **Step 3: Implementar**

Em `route.ts`, trocar o bloco `if (erro instanceof FalhaIncertaError || erro instanceof RecusaDefinitivaError) {...}` por:

```ts
    if (erro instanceof RecusaDefinitivaError) {
      console.error("[POST /api/cobrancas]", erro);
      return NextResponse.json(
        {
          error:
            "O provedor de pagamento recusou a cobrança. Confira o CPF/CNPJ da empresa ou fale com o suporte.",
          codigo: "GATEWAY_RECUSOU",
        },
        { status: 502 },
      );
    }
    if (erro instanceof FalhaIncertaError) {
      console.error("[POST /api/cobrancas]", erro);
      return NextResponse.json(
        { error: "Não foi possível gerar o Pix agora, tente de novo em instantes." },
        { status: 502 },
      );
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/api/cobrancas` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cobrancas/route.ts src/app/api/cobrancas/__tests__/route.test.ts
git commit -m "feat(pagamentos): codigo GATEWAY_RECUSOU quando o gateway recusa a cobranca" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pagamento sobre assinatura suspensa reinicia o ciclo

**Files:**
- Modify: `src/lib/pagamentos/efeitos.ts`
- Modify: `src/lib/pagamentos/__tests__/efeitos.test.ts`

**Interfaces:**
- Consumes: `derivarStatus` de `@/lib/permissoes/status-assinatura`.
- Produces: `aplicarPagamento` aplica o efeito de `assinatura` quando a assinatura está `suspensa` no momento do pagamento, qualquer que seja o `tipo` da cobrança.

- [ ] **Step 1: Escrever os testes (falham)** — acrescentar dentro do `describe` de `efeitos.test.ts`, antes do teste de cancelamento:

```ts
it("renovação paga depois da suspensão: reinicia o ciclo a partir do pagamento em vez de emendar no vencimento antigo", async () => {
  const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-40), venceEm: emDias(-10) });
  const paga = await inserirCobranca(cenario, { tipo: "renovacao", planoChave: "essencial" });

  await aplicarPagamento(db, paga, AGORA);

  const depois = await assinaturaDe(cenario.assinaturaId);
  expect(depois.status).toBe("ativa");
  expect(depois.inicio).toEqual(AGORA);
  expect(depois.venceEm).toEqual(emDias(30));
  const trechos = await trechosDe(cenario.assinaturaId);
  expect(trechos).toHaveLength(2);
  expect(trechos.filter((t) => t.fim === null)).toHaveLength(1);
});

it("upgrade pago depois da suspensão: troca o plano e reinicia o ciclo", async () => {
  const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-40), venceEm: emDias(-10) });
  const paga = await inserirCobranca(cenario, { tipo: "upgrade", planoChave: "escritorio" });

  await aplicarPagamento(db, paga, AGORA);

  const depois = await assinaturaDe(cenario.assinaturaId);
  expect(depois.inicio).toEqual(AGORA);
  expect(depois.venceEm).toEqual(emDias(30));
  const trechos = await trechosDe(cenario.assinaturaId);
  expect(trechos.find((t) => t.plano === "escritorio")).toMatchObject({ fim: null, origem: "autoatendimento" });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/pagamentos/__tests__/efeitos.test.ts` → FAIL nos dois casos novos (o primeiro emenda `venceEm`, o segundo mantém `inicio`/`venceEm`).

- [ ] **Step 3: Implementar** — em `efeitos.ts`, importar `derivarStatus` e substituir o bloco `if (paga.tipo === "renovacao") {...} else {...}` por:

```ts
  // Pago depois da carência, emendar no vencimento antigo cobraria o preço cheio por
  // pouco ou nenhum acesso: o pagamento recomeça o ciclo, como numa assinatura nova.
  const comoAssinatura = paga.tipo === "assinatura" || derivarStatus(atual, agora) === "suspensa";

  if (paga.tipo === "renovacao" && !comoAssinatura) {
    await tx
      .update(assinatura)
      .set({
        status: "ativa",
        venceEm: proximoVencimento(atual.venceEm, destino.cicloDias),
        updatedAt: agora,
      })
      .where(eq(assinatura.id, atual.id));
  } else {
    await tx
      .update(assinaturaTrecho)
      .set({ fim: agora })
      .where(and(eq(assinaturaTrecho.assinaturaId, atual.id), isNull(assinaturaTrecho.fim)));
    await tx
      .insert(assinaturaTrecho)
      .values({ assinaturaId: atual.id, planoId: destino.id, inicio: agora, origem: "autoatendimento" });

    if (comoAssinatura) {
      await tx
        .update(assinatura)
        .set({
          inicio: agora,
          status: "ativa",
          venceEm: new Date(agora.getTime() + destino.cicloDias * MS_POR_DIA),
          updatedAt: agora,
        })
        .where(eq(assinatura.id, atual.id));
    }
  }
```

e `import { derivarStatus } from "@/lib/permissoes/status-assinatura";`.

- [ ] **Step 4: Rodar a suíte de pagamentos**

Run: `npx vitest run src/lib/pagamentos` → PASS (inclui `processar-evento` e `iniciar-cobranca`, que não devem regredir).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pagamentos/efeitos.ts src/lib/pagamentos/__tests__/efeitos.test.ts
git commit -m "fix(pagamentos): pagamento apos a suspensao reinicia o ciclo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Funções puras de apresentação (formatar, limites, resumo)

**Files:**
- Create: `src/lib/formatar.ts`, `src/lib/__tests__/formatar.test.ts`
- Create: `src/lib/planos/descrever-limites.ts`, `src/lib/planos/__tests__/descrever-limites.test.ts`
- Create: `src/lib/planos/descrever-assinatura.ts`, `src/lib/planos/__tests__/descrever-assinatura.test.ts`

**Interfaces:**
- Produces:
  - `formatarReais(centavos: number): string` → `"R$ 99,00"` (com espaço comum NBSP do `Intl`).
  - `formatarData(iso: string): string` → `dd/mm/aaaa` no fuso `America/Sao_Paulo`.
  - `rotuloDoCiclo(cicloDias: number): string` → `"mês"` (30), `"ano"` (360), senão `"N dias"`.
  - `interface LinhaDeLimite { chave: string; valor: number | null; janelaDias: number | null }`
  - `descreverLimitesDoPlano(linhas: LinhaDeLimite[]): string[]`
  - `interface AssinaturaDescrita { titulo: string; detalhe: string; tom: "normal" | "alerta" | "erro" }`
  - `descreverAssinatura(dados: { planoNome: string; status: StatusEfetivo; venceEm: string; diasRestantes: number }): AssinaturaDescrita`

- [ ] **Step 1: Testes que falham**

`src/lib/__tests__/formatar.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatarData, formatarReais, rotuloDoCiclo } from "../formatar";

describe("formatar", () => {
  it("formatarReais usa vírgula decimal e o símbolo", () => {
    expect(formatarReais(9900).replace(/ /g, " ")).toBe("R$ 99,00");
    expect(formatarReais(1550).replace(/ /g, " ")).toBe("R$ 15,50");
    expect(formatarReais(500).replace(/ /g, " ")).toBe("R$ 5,00");
  });

  it("formatarData respeita o fuso de São Paulo", () => {
    expect(formatarData("2026-06-15T02:00:00Z")).toBe("14/06/2026");
    expect(formatarData("2026-06-15T12:00:00Z")).toBe("15/06/2026");
  });

  it("rotuloDoCiclo", () => {
    expect(rotuloDoCiclo(30)).toBe("mês");
    expect(rotuloDoCiclo(360)).toBe("ano");
    expect(rotuloDoCiclo(14)).toBe("14 dias");
  });
});
```

`src/lib/planos/__tests__/descrever-limites.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { descreverLimitesDoPlano } from "../descrever-limites";

describe("descreverLimitesDoPlano", () => {
  it("descreve limites mensais, ilimitados e o áudio, na ordem do catálogo de uso", () => {
    const textos = descreverLimitesDoPlano([
      { chave: "memorial.audio", valor: null, janelaDias: null },
      { chave: "projetos.criar", valor: null, janelaDias: null },
      { chave: "comunique-se.processar", valor: 20, janelaDias: 30 },
      { chave: "memorial.gerar", valor: 20, janelaDias: 30 },
      { chave: "acervo.listar", valor: null, janelaDias: null },
    ]);

    expect(textos).toEqual([
      "20 memoriais por mês",
      "20 análises de Comunique-se por mês",
      "Projetos ilimitados",
      "Memorial por áudio",
    ]);
  });

  it("janela diferente de 30 dias vira 'a cada N dias'; permissão ausente não aparece", () => {
    expect(descreverLimitesDoPlano([{ chave: "memorial.gerar", valor: 5, janelaDias: 14 }])).toEqual([
      "5 memoriais a cada 14 dias",
    ]);
    expect(descreverLimitesDoPlano([])).toEqual([]);
  });

  it("memorial ilimitado", () => {
    expect(descreverLimitesDoPlano([{ chave: "memorial.gerar", valor: null, janelaDias: null }])).toEqual([
      "Memoriais ilimitados",
    ]);
  });
});
```

`src/lib/planos/__tests__/descrever-assinatura.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { descreverAssinatura } from "../descrever-assinatura";

const base = { planoNome: "Essencial", venceEm: "2026-06-20T12:00:00Z", diasRestantes: 5 };

describe("descreverAssinatura", () => {
  it("trial: mostra os dias restantes do teste", () => {
    expect(descreverAssinatura({ ...base, planoNome: "Trial", status: "trial", diasRestantes: 9 })).toEqual({
      titulo: "Período de teste",
      detalhe: "9 dias restantes",
      tom: "normal",
    });
    expect(descreverAssinatura({ ...base, status: "trial", diasRestantes: 1 }).detalhe).toBe("1 dia restante");
  });

  it("ativa: nome do plano e data da renovação", () => {
    expect(descreverAssinatura({ ...base, status: "ativa" })).toEqual({
      titulo: "Plano Essencial",
      detalhe: "Renova em 20/06/2026 (5 dias)",
      tom: "normal",
    });
  });

  it("carência: alerta com o fim do prazo (vencimento + 5 dias)", () => {
    expect(descreverAssinatura({ ...base, status: "carencia", diasRestantes: 0 })).toEqual({
      titulo: "Plano Essencial",
      detalhe: "Pagamento em atraso: regularize até 25/06/2026 para não perder o acesso",
      tom: "alerta",
    });
  });

  it("suspensa: erro com o chamado para assinar", () => {
    expect(descreverAssinatura({ ...base, status: "suspensa", diasRestantes: 0 })).toEqual({
      titulo: "Acesso limitado",
      detalhe: "Assine um plano para voltar a gerar documentos.",
      tom: "erro",
    });
  });

  it("cancelada: acesso até o vencimento", () => {
    expect(descreverAssinatura({ ...base, status: "cancelada" })).toEqual({
      titulo: "Plano Essencial (cancelado)",
      detalhe: "Acesso até 20/06/2026",
      tom: "alerta",
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/__tests__/formatar.test.ts src/lib/planos` → FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`src/lib/formatar.ts`:

```ts
const FUSO = "America/Sao_Paulo";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });

export function formatarReais(centavos: number): string {
  return moeda.format(centavos / 100);
}

// Fuso fixo: o mesmo texto no servidor e no navegador evita erro de hidratação.
export function formatarData(iso: string): string {
  return dataCurta.format(new Date(iso));
}

export function rotuloDoCiclo(cicloDias: number): string {
  if (cicloDias === 30) return "mês";
  if (cicloDias === 360) return "ano";
  return `${cicloDias} dias`;
}
```

`src/lib/planos/descrever-limites.ts`:

```ts
import { PERMISSOES_DE_USO, type PermissaoDeUso } from "@/lib/permissoes/permissoes-de-uso";

export interface LinhaDeLimite {
  chave: string;
  valor: number | null;
  janelaDias: number | null;
}

const periodo = (dias: number) => (dias === 30 ? "por mês" : dias === 360 ? "por ano" : `a cada ${dias} dias`);

const contagem =
  (plural: string, ilimitado: string) =>
  ({ valor, janelaDias }: LinhaDeLimite) =>
    valor === null || janelaDias === null ? ilimitado : `${valor} ${plural} ${periodo(janelaDias)}`;

const TEXTO_DA_PERMISSAO: Record<PermissaoDeUso, (linha: LinhaDeLimite) => string> = {
  "memorial.gerar": contagem("memoriais", "Memoriais ilimitados"),
  "comunique-se.processar": contagem("análises de Comunique-se", "Comunique-se ilimitado"),
  "projetos.criar": contagem("projetos", "Projetos ilimitados"),
  "memorial.audio": () => "Memorial por áudio",
};

export function descreverLimitesDoPlano(linhas: LinhaDeLimite[]): string[] {
  return PERMISSOES_DE_USO.flatMap((chave) => {
    const linha = linhas.find((l) => l.chave === chave);
    return linha ? [TEXTO_DA_PERMISSAO[chave](linha)] : [];
  });
}
```

`src/lib/planos/descrever-assinatura.ts`:

```ts
import { formatarData } from "@/lib/formatar";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { CARENCIA_DIAS_PADRAO, type StatusEfetivo } from "@/lib/permissoes/status-assinatura";

export interface AssinaturaDescrita {
  titulo: string;
  detalhe: string;
  tom: "normal" | "alerta" | "erro";
}

const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

export function descreverAssinatura(dados: {
  planoNome: string;
  status: StatusEfetivo;
  venceEm: string;
  diasRestantes: number;
}): AssinaturaDescrita {
  const { planoNome, status, venceEm, diasRestantes } = dados;

  switch (status) {
    case "trial":
      return {
        titulo: "Período de teste",
        detalhe: `${dias(diasRestantes)} ${diasRestantes === 1 ? "restante" : "restantes"}`,
        tom: "normal",
      };
    case "ativa":
      return {
        titulo: `Plano ${planoNome}`,
        detalhe: `Renova em ${formatarData(venceEm)} (${dias(diasRestantes)})`,
        tom: "normal",
      };
    case "carencia": {
      const fim = new Date(new Date(venceEm).getTime() + CARENCIA_DIAS_PADRAO * MS_POR_DIA).toISOString();
      return {
        titulo: `Plano ${planoNome}`,
        detalhe: `Pagamento em atraso: regularize até ${formatarData(fim)} para não perder o acesso`,
        tom: "alerta",
      };
    }
    case "cancelada":
      return {
        titulo: `Plano ${planoNome} (cancelado)`,
        detalhe: `Acesso até ${formatarData(venceEm)}`,
        tom: "alerta",
      };
    case "suspensa":
      return {
        titulo: "Acesso limitado",
        detalhe: "Assine um plano para voltar a gerar documentos.",
        tom: "erro",
      };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/__tests__/formatar.test.ts src/lib/planos` → PASS. `npx tsc --noEmit` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/formatar.ts src/lib/__tests__/formatar.test.ts src/lib/planos
git commit -m "feat(planos): formatacao e descricao de limites e da assinatura" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Query de planos públicos e loader da tela

**Files:**
- Modify: `src/db/queries/plano.ts`
- Create: `src/lib/planos/carregar-tela-de-planos.ts`
- Create: `src/lib/planos/__tests__/carregar-tela-de-planos.test.ts`

**Interfaces:**
- Consumes: `descreverLimitesDoPlano` e `LinhaDeLimite` (Task 5); `buscarAssinaturaVigente`, `buscarPlanoDoCatalogo`, `derivarStatus`, `simularUpgrade`, `ANTECEDENCIA_RENOVACAO_DIAS_PADRAO`, `valorMinimoDoAmbiente` (de `@/lib/pagamentos/iniciar-cobranca`).
- Produces:
  - `interface PlanoPublico extends PlanoDoCatalogo { permissoes: LinhaDeLimite[] }`, `listarPlanosPublicos(): Promise<PlanoPublico[]>` (ativos, não internos, preço > 0, por `nivel` e preço crescentes).
  - Tipos `AcaoDoPlano = "assinar" | "renovar" | "upgrade" | "suporte" | "atual"`, `PlanoDaTela { chave; nome; precoCentavos; cicloDias; limites: string[]; acao: AcaoDoPlano; valorUpgradeCentavos: number | null }`, `AssinaturaDaTela { planoNome: string; status: StatusEfetivo; venceEm: string (ISO); diasRestantes: number }`, `TelaDePlanos { assinatura: AssinaturaDaTela; planos: PlanoDaTela[] }`.
  - `carregarTelaDePlanos(empresaId: string, agora?: Date): Promise<TelaDePlanos | null>` (`null` se a empresa não tem assinatura).

Regras de ação (a mesma lógica que `iniciarCobranca` aplica; o plano atual com mais de 5 dias para vencer mostra "atual" para não empilhar ciclos pagos):
- Sem assinatura paga vigente (`vigente.status !== "ativa"` ou status efetivo `suspensa`): todo plano é `assinar`.
- Ativa ou carência: plano igual ao atual → `renovar` se em carência ou `diasRestantes <= ANTECEDENCIA_RENOVACAO_DIAS_PADRAO`, senão `atual`; outro plano, só com status efetivo `ativa` e `simularUpgrade(...).ok` → `upgrade` com `valorUpgradeCentavos = max(valor simulado, valorMinimoDoAmbiente())`; senão `suporte`.

- [ ] **Step 1: Escrever o teste (falha)** — `src/lib/planos/__tests__/carregar-tela-de-planos.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { empresa } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { AGORA, criarCenario, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { carregarTelaDePlanos } from "../carregar-tela-de-planos";

const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

async function acoes(empresaId: string) {
  const tela = await carregarTelaDePlanos(empresaId, AGORA);
  return Object.fromEntries((tela?.planos ?? []).map((p) => [p.chave, p.acao]));
}

describe("carregarTelaDePlanos", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(async () => {
    vi.unstubAllEnvs();
    await limparCenarios();
  });

  it("empresa sem assinatura: null", async () => {
    const [semAssinatura] = await db.insert(empresa).values({ nome: "Sem assinatura" }).returning();
    expect(await carregarTelaDePlanos(semAssinatura.id, AGORA)).toBeNull();
  });

  it("lista só os planos públicos, em ordem, com preço, ciclo e limites", async () => {
    const cenario = await criarCenario({ venceEm: emDias(9) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    expect(tela?.planos.map((p) => p.chave)).toEqual(["essencial", "escritorio"]);
    expect(tela?.planos[0]).toMatchObject({ nome: "Essencial", precoCentavos: 9900, cicloDias: 30 });
    expect(tela?.planos[0].limites).toContain("20 memoriais por mês");
    expect(tela?.planos[1].limites).toContain("Projetos ilimitados");
  });

  it("trial: todos os planos são 'assinar' e o resumo traz os dias restantes", async () => {
    const cenario = await criarCenario({ venceEm: emDias(9) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "assinar", escritorio: "assinar" });

    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);
    expect(tela?.assinatura).toEqual({
      planoNome: "Trial",
      status: "trial",
      venceEm: emDias(9).toISOString(),
      diasRestantes: 9,
    });
  });

  it("ativa com mais de 5 dias: plano atual é 'atual' e o de nível maior é upgrade com o valor simulado", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(20) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    expect(tela?.planos.find((p) => p.chave === "essencial")).toMatchObject({ acao: "atual", valorUpgradeCentavos: null });
    // (24900 - 9900) * 20 / 30
    expect(tela?.planos.find((p) => p.chave === "escritorio")).toMatchObject({
      acao: "upgrade",
      valorUpgradeCentavos: 10000,
    });
  });

  it("ativa a 5 dias ou menos do vencimento: plano atual vira 'renovar'", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(3) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    expect(tela?.planos.find((p) => p.chave === "essencial")?.acao).toBe("renovar");
    // (24900 - 9900) * 3 / 30
    expect(tela?.planos.find((p) => p.chave === "escritorio")).toMatchObject({
      acao: "upgrade",
      valorUpgradeCentavos: 1500,
    });
  });

  it("upgrade abaixo do mínimo do ambiente cobra o mínimo", async () => {
    vi.stubEnv("PAGAMENTO_VALOR_MINIMO_CENTAVOS", "3000");
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(3) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    // simulado: (24900 - 9900) * 3 / 30 = 1500
    expect(tela?.planos.find((p) => p.chave === "escritorio")?.valorUpgradeCentavos).toBe(3000);
  });

  it("carência: renovar o plano atual; outros planos só pelo suporte", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(-2) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "renovar", escritorio: "suporte" });
  });

  it("suspensa: todos os planos são 'assinar'", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(-10) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "assinar", escritorio: "assinar" });
    expect((await carregarTelaDePlanos(cenario.empresaId, AGORA))?.assinatura.status).toBe("suspensa");
  });

  it("cancelada ainda dentro do ciclo: todos os planos são 'assinar'", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "cancelada", venceEm: emDias(10) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "assinar", escritorio: "assinar" });
  });

  it("no plano mais alto, o de nível menor só pelo suporte", async () => {
    const cenario = await criarCenario({ planoChave: "escritorio", status: "ativa", venceEm: emDias(20) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "suporte", escritorio: "atual" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/planos/__tests__/carregar-tela-de-planos.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: `listarPlanosPublicos`** — em `src/db/queries/plano.ts`, trocar o import do drizzle por `import { and, asc, eq, gt, inArray } from "drizzle-orm";`, o de schema por `import { permissao, plano, planoPermissao } from "@/db/schema";`, importar `type LinhaDeLimite` de `@/lib/planos/descrever-limites` e acrescentar:

```ts
export interface PlanoPublico extends PlanoDoCatalogo {
  permissoes: LinhaDeLimite[];
}

export async function listarPlanosPublicos(): Promise<PlanoPublico[]> {
  const planos = await db
    .select(CAMPOS)
    .from(plano)
    .where(and(eq(plano.ativo, true), eq(plano.interno, false), gt(plano.precoCentavos, 0)))
    .orderBy(asc(plano.nivel), asc(plano.precoCentavos));
  if (planos.length === 0) return [];

  const linhas = await db
    .select({
      planoId: planoPermissao.planoId,
      chave: permissao.chave,
      valor: planoPermissao.valor,
      janelaDias: planoPermissao.janelaDias,
    })
    .from(planoPermissao)
    .innerJoin(permissao, eq(permissao.id, planoPermissao.permissaoId))
    .where(inArray(planoPermissao.planoId, planos.map((p) => p.id)));

  return planos.map((p) => ({
    ...p,
    permissoes: linhas
      .filter((l) => l.planoId === p.id)
      .map(({ chave, valor, janelaDias }) => ({ chave, valor, janelaDias })),
  }));
}
```

- [ ] **Step 4: Loader** — `src/lib/planos/carregar-tela-de-planos.ts`:

```ts
import { ANTECEDENCIA_RENOVACAO_DIAS_PADRAO } from "@/core/billing/renovacao";
import { simularUpgrade } from "@/core/billing/upgrade";
import { buscarAssinaturaVigente, type AssinaturaVigente } from "@/db/queries/assinatura";
import { buscarPlanoDoCatalogo, listarPlanosPublicos, type PlanoDoCatalogo, type PlanoPublico } from "@/db/queries/plano";
import { valorMinimoDoAmbiente } from "@/lib/pagamentos/iniciar-cobranca";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { derivarStatus, type StatusEfetivo } from "@/lib/permissoes/status-assinatura";
import { descreverLimitesDoPlano } from "./descrever-limites";

export type AcaoDoPlano = "assinar" | "renovar" | "upgrade" | "suporte" | "atual";

export interface PlanoDaTela {
  chave: string;
  nome: string;
  precoCentavos: number;
  cicloDias: number;
  limites: string[];
  acao: AcaoDoPlano;
  valorUpgradeCentavos: number | null;
}

export interface AssinaturaDaTela {
  planoNome: string;
  status: StatusEfetivo;
  venceEm: string;
  diasRestantes: number;
}

export interface TelaDePlanos {
  assinatura: AssinaturaDaTela;
  planos: PlanoDaTela[];
}

interface Contexto {
  vigente: AssinaturaVigente;
  atual: PlanoDoCatalogo;
  status: StatusEfetivo;
  diasRestantes: number;
  agora: Date;
  valorMinimoCentavos: number;
}

// Espelha as regras de `iniciarCobranca`: o que a tela oferece é o que a rota aceita.
function decidirAcao(destino: PlanoPublico, c: Contexto): Pick<PlanoDaTela, "acao" | "valorUpgradeCentavos"> {
  const sem = (acao: AcaoDoPlano) => ({ acao, valorUpgradeCentavos: null });

  const assinaturaPaga = c.vigente.status === "ativa" && (c.status === "ativa" || c.status === "carencia");
  if (!assinaturaPaga) return sem("assinar");

  if (destino.chave === c.atual.chave) {
    // Renovar antes da janela emendaria um ciclo pago sobre outro sem necessidade.
    const naJanela = c.status === "carencia" || c.diasRestantes <= ANTECEDENCIA_RENOVACAO_DIAS_PADRAO;
    return sem(naJanela ? "renovar" : "atual");
  }

  if (c.status === "ativa") {
    const simulacao = simularUpgrade({ atual: c.atual, destino, venceEm: c.vigente.venceEm, agora: c.agora });
    if (simulacao.ok) {
      return { acao: "upgrade", valorUpgradeCentavos: Math.max(simulacao.valorCentavos, c.valorMinimoCentavos) };
    }
  }
  return sem("suporte");
}

export async function carregarTelaDePlanos(empresaId: string, agora: Date = new Date()): Promise<TelaDePlanos | null> {
  const vigente = await buscarAssinaturaVigente(empresaId);
  if (!vigente) return null;

  const [atual, publicos] = await Promise.all([buscarPlanoDoCatalogo(vigente.planoChave), listarPlanosPublicos()]);
  const status = derivarStatus(vigente, agora);
  const diasRestantes = Math.max(0, Math.ceil((vigente.venceEm.getTime() - agora.getTime()) / MS_POR_DIA));
  const contexto: Contexto = {
    vigente,
    atual: atual as PlanoDoCatalogo,
    status,
    diasRestantes,
    agora,
    valorMinimoCentavos: valorMinimoDoAmbiente(),
  };

  return {
    assinatura: { planoNome: contexto.atual.nome, status, venceEm: vigente.venceEm.toISOString(), diasRestantes },
    planos: publicos.map((p) => ({
      chave: p.chave,
      nome: p.nome,
      precoCentavos: p.precoCentavos,
      cicloDias: p.cicloDias,
      limites: descreverLimitesDoPlano(p.permissoes),
      ...decidirAcao(p, contexto),
    })),
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/planos` → PASS. `npx tsc --noEmit` → sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/db/queries/plano.ts src/lib/planos/carregar-tela-de-planos.ts src/lib/planos/__tests__/carregar-tela-de-planos.test.ts
git commit -m "feat(planos): loader da tela de planos com a acao de cada plano" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Hooks e diálogos (Pix e documento)

**Files:**
- Create: `src/hooks/use-criar-cobranca.ts`, `src/hooks/use-cobranca.ts`, `src/hooks/use-salvar-documento.ts`
- Create: `src/components/planos/pix-dialog.tsx`, `src/components/planos/documento-dialog.tsx`

**Interfaces:**
- Consumes: `CriarCobrancaInput` (`@/lib/validations/cobranca/create.schema`), `CobrancaResponse` (`.../response.schema`), `atualizarDocumentoSchema` + `AtualizarDocumentoInput`, `mascararDocumento`, `formatarReais`, `formatarData`.
- Produces:
  - `class CobrancaError extends Error { codigo?: string }` e `useCriarCobranca()` (mutation `CriarCobrancaInput → CobrancaResponse`), ambos em `use-criar-cobranca.ts`.
  - `useCobranca(id: string | null, inicial?: CobrancaResponse)`: query `["cobranca", id]`, `refetchInterval` de 4000 ms enquanto `status === "pendente"`, `false` depois.
  - `useSalvarDocumento()` (mutation `AtualizarDocumentoInput → { documento: string }`).
  - `<PixDialog cobranca titulo onFechar onGerarNovo />` e `<DocumentoDialog aberto onSalvo onFechar />`.

Sem testes automatizados (ambiente `node`): a verificação é `tsc`, `eslint` e a conferência do controlador no navegador (Task 10 do roteiro de verificação).

- [ ] **Step 1: Hooks**

`src/hooks/use-criar-cobranca.ts`:

```ts
import { useMutation } from "@tanstack/react-query";

import type { CriarCobrancaInput } from "@/lib/validations/cobranca/create.schema";
import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

export class CobrancaError extends Error {
  constructor(
    mensagem: string,
    public readonly codigo?: string,
  ) {
    super(mensagem);
    this.name = "CobrancaError";
  }
}

async function criarCobranca(input: CriarCobrancaInput): Promise<CobrancaResponse> {
  const response = await fetch("/api/cobrancas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new CobrancaError(data.error, data.codigo);
  }

  return data.cobranca;
}

export function useCriarCobranca() {
  return useMutation({ mutationFn: criarCobranca });
}
```

`src/hooks/use-cobranca.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

const INTERVALO_DO_POLLING_MS = 4000;

async function buscarCobranca(id: string): Promise<CobrancaResponse> {
  const response = await fetch(`/api/cobrancas/${id}`);

  if (!response.ok) {
    throw new Error("Erro ao consultar o pagamento.");
  }

  return (await response.json()).cobranca;
}

export function useCobranca(id: string | null, inicial?: CobrancaResponse) {
  return useQuery({
    queryKey: ["cobranca", id],
    queryFn: () => buscarCobranca(id as string),
    enabled: id !== null,
    initialData: inicial,
    refetchInterval: (query) => (query.state.data?.status === "pendente" ? INTERVALO_DO_POLLING_MS : false),
  });
}
```

`src/hooks/use-salvar-documento.ts`:

```ts
import { useMutation } from "@tanstack/react-query";

import type { AtualizarDocumentoInput } from "@/lib/validations/empresa/documento.schema";

async function salvarDocumento(input: AtualizarDocumentoInput): Promise<{ documento: string }> {
  const response = await fetch("/api/empresa/documento", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error);
  }

  return data;
}

export function useSalvarDocumento() {
  return useMutation({ mutationFn: salvarDocumento });
}
```

- [ ] **Step 2: `pix-dialog.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCobranca } from "@/hooks/use-cobranca";
import { formatarData, formatarReais } from "@/lib/formatar";
import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

interface PixDialogProps {
  cobranca: CobrancaResponse | null;
  titulo: string;
  onFechar: () => void;
  onGerarNovo: () => void;
}

export function PixDialog({ cobranca, titulo, onFechar, onGerarNovo }: PixDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useCobranca(cobranca?.id ?? null, cobranca ?? undefined);
  const atual = data ?? cobranca;
  const paga = atual?.status === "paga";
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!paga) return;
    queryClient.invalidateQueries({ queryKey: ["permissoes"] });
    router.refresh();
  }, [paga, queryClient, router]);

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o código continua selecionável no campo.
    }
  }

  return (
    <Dialog open={cobranca !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {atual ? `${formatarReais(atual.valorCentavos)} · pague até ${formatarData(atual.venceEm)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {atual?.status === "pendente" && atual.pix && (
          <div className="grid gap-4">
            {/* data: URI do QR devolvido pelo gateway; next/image não otimiza isso. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${atual.pix.qrCodeBase64}`}
              alt="QR Code do Pix"
              className="mx-auto size-56 rounded-md border"
            />
            <div className="flex gap-2">
              <Input readOnly value={atual.pix.copiaECola} aria-label="Pix copia e cola" />
              <Button type="button" variant="outline" onClick={() => copiar(atual.pix!.copiaECola)}>
                <Copy />
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Aguardando a confirmação do pagamento…
            </p>
          </div>
        )}

        {atual?.status === "pendente" && !atual.pix && (
          <div className="grid gap-3 text-sm">
            <p>Não conseguimos exibir o Pix desta cobrança.</p>
            <Button onClick={onGerarNovo}>Gerar novo Pix</Button>
          </div>
        )}

        {paga && (
          <div className="grid justify-items-center gap-3 py-2 text-center">
            <CheckCircle2 className="size-12 text-emerald-600" />
            <p className="font-medium">Pagamento confirmado!</p>
            <p className="text-sm text-muted-foreground">Seu plano já está atualizado.</p>
            <Button onClick={onFechar}>Fechar</Button>
          </div>
        )}

        {atual && atual.status !== "pendente" && !paga && (
          <div className="grid gap-3 text-sm">
            <p>Esta cobrança não está mais disponível para pagamento.</p>
            <Button onClick={onGerarNovo}>Gerar novo Pix</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: `documento-dialog.tsx`**

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSalvarDocumento } from "@/hooks/use-salvar-documento";
import { mascararDocumento } from "@/lib/pagamentos/documento";
import { atualizarDocumentoSchema, type AtualizarDocumentoInput } from "@/lib/validations/empresa/documento.schema";

interface DocumentoDialogProps {
  aberto: boolean;
  onSalvo: () => void;
  onFechar: () => void;
}

export function DocumentoDialog({ aberto, onSalvo, onFechar }: DocumentoDialogProps) {
  const salvar = useSalvarDocumento();
  const form = useForm<AtualizarDocumentoInput>({
    resolver: zodResolver(atualizarDocumentoSchema),
    defaultValues: { documento: "" },
  });

  function onSubmit(valores: AtualizarDocumentoInput) {
    salvar.mutate(valores, { onSuccess: onSalvo });
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>CPF ou CNPJ da empresa</DialogTitle>
          <DialogDescription>O provedor de pagamento exige o documento para emitir o Pix.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="documento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Documento</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                      {...field}
                      onChange={(evento) => field.onChange(mascararDocumento(evento.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {salvar.isError && <p className="text-sm text-destructive">{salvar.error.message}</p>}
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando..." : "Salvar e gerar o Pix"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Checagens**

Run: `npx tsc --noEmit` e `npx eslint src/hooks/use-criar-cobranca.ts src/hooks/use-cobranca.ts src/hooks/use-salvar-documento.ts src/components/planos` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-criar-cobranca.ts src/hooks/use-cobranca.ts src/hooks/use-salvar-documento.ts src/components/planos
git commit -m "feat(planos): dialogos do Pix e do documento com polling da cobranca" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tela `/dashboard/planos` e item na sidebar

**Files:**
- Create: `src/components/planos/plano-card.tsx`, `src/components/planos/planos-tela.tsx`
- Create: `src/app/dashboard/planos/page.tsx`
- Modify: `src/components/dashboard/sidebar.tsx`

**Interfaces:**
- Consumes: `TelaDePlanos`, `PlanoDaTela`, `carregarTelaDePlanos` (Task 6); `descreverAssinatura` (Task 5); `useCriarCobranca`, `CobrancaError` (Task 7); `PixDialog`, `DocumentoDialog` (Task 7); `carregarContextoDePlanos` (existente, para `contatoSuporte`); `montarMailtoSuporte` (existente em `@/lib/permissoes/descrever-uso`); `CriarCobrancaInput`.
- Produces: rota `/dashboard/planos`.

- [ ] **Step 1: `plano-card.tsx`**

```tsx
"use client";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarReais, rotuloDoCiclo } from "@/lib/formatar";
import type { PlanoDaTela } from "@/lib/planos/carregar-tela-de-planos";

interface PlanoCardProps {
  plano: PlanoDaTela;
  ocupado: boolean;
  linkSuporte: string | null;
  onEscolher: (plano: PlanoDaTela) => void;
}

export function PlanoCard({ plano, ocupado, linkSuporte, onEscolher }: PlanoCardProps) {
  return (
    <Card className={plano.acao === "atual" ? "border-primary" : undefined}>
      <CardHeader>
        <CardTitle className="text-xl">{plano.nome}</CardTitle>
        <CardDescription>
          <span className="text-2xl font-semibold text-foreground">{formatarReais(plano.precoCentavos)}</span> /{" "}
          {rotuloDoCiclo(plano.cicloDias)}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ul className="grid gap-2 text-sm">
          {plano.limites.map((limite) => (
            <li key={limite} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              {limite}
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="mt-auto">
        {plano.acao === "atual" && <span className="text-sm font-medium text-primary">Plano atual</span>}

        {(plano.acao === "assinar" || plano.acao === "renovar" || plano.acao === "upgrade") && (
          <Button className="w-full" disabled={ocupado} onClick={() => onEscolher(plano)}>
            {plano.acao === "assinar" && "Assinar"}
            {plano.acao === "renovar" && "Renovar"}
            {plano.acao === "upgrade" && `Fazer upgrade — ${formatarReais(plano.valorUpgradeCentavos ?? 0)} agora`}
          </Button>
        )}

        {plano.acao === "suporte" &&
          (linkSuporte ? (
            <Button asChild variant="outline" className="w-full">
              <a href={linkSuporte}>Fale com o suporte</a>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Fale com o suporte para trocar para este plano.</span>
          ))}
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 2: `planos-tela.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CircleAlert } from "lucide-react";

import { DocumentoDialog } from "@/components/planos/documento-dialog";
import { PixDialog } from "@/components/planos/pix-dialog";
import { PlanoCard } from "@/components/planos/plano-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CobrancaError, useCriarCobranca } from "@/hooks/use-criar-cobranca";
import type { PlanoDaTela, TelaDePlanos } from "@/lib/planos/carregar-tela-de-planos";
import { descreverAssinatura } from "@/lib/planos/descrever-assinatura";
import type { ContatoSuporte } from "@/lib/permissoes/contexto-de-planos";
import { montarMailtoSuporte } from "@/lib/permissoes/descrever-uso";
import type { CriarCobrancaInput } from "@/lib/validations/cobranca/create.schema";
import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

interface PlanosTelaProps {
  dados: TelaDePlanos;
  contatoSuporte: ContatoSuporte;
}

interface Pedido {
  titulo: string;
  input: CriarCobrancaInput;
}

const COR_DO_TOM = {
  normal: "text-foreground",
  alerta: "text-amber-600",
  erro: "text-destructive",
} as const;

function pedidoDoPlano(plano: PlanoDaTela): Pedido {
  if (plano.acao === "renovar") return { titulo: `Renovação — ${plano.nome}`, input: { tipo: "renovacao" } };
  if (plano.acao === "upgrade") {
    return { titulo: `Upgrade para ${plano.nome}`, input: { tipo: "upgrade", planoChave: plano.chave } };
  }
  return { titulo: `Assinatura — ${plano.nome}`, input: { tipo: "assinatura", planoChave: plano.chave } };
}

export function PlanosTela({ dados, contatoSuporte }: PlanosTelaProps) {
  const router = useRouter();
  const criar = useCriarCobranca();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [cobranca, setCobranca] = useState<CobrancaResponse | null>(null);
  const [pedindoDocumento, setPedindoDocumento] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const resumo = descreverAssinatura(dados.assinatura);

  function iniciar(novo: Pedido) {
    setPedido(novo);
    setAviso(null);
    criar.mutate(novo.input, {
      onSuccess: (criada) => {
        setPedindoDocumento(false);
        setCobranca(criada);
      },
      onError: (erro) => {
        const codigo = erro instanceof CobrancaError ? erro.codigo : undefined;
        if (codigo === "DOCUMENTO_AUSENTE") {
          setPedindoDocumento(true);
          return;
        }
        setAviso(erro.message);
        // O estado da assinatura mudou desde que a página foi carregada: recarrega os cards.
        if (codigo === "COBRANCA_NAO_PERMITIDA") router.refresh();
      },
    });
  }

  function gerarNovo() {
    setCobranca(null);
    if (pedido) iniciar(pedido);
  }

  function linkSuporteDoPlano(plano: PlanoDaTela): string | null {
    if (!contatoSuporte.email) return null;
    return montarMailtoSuporte({
      email: contatoSuporte.email,
      empresaNome: contatoSuporte.empresaNome,
      planoChave: contatoSuporte.planoChave,
      motivo: `Quero trocar para o plano ${plano.nome}`,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Planos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pague por Pix e o plano é atualizado na hora.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className={COR_DO_TOM[resumo.tom]}>{resumo.titulo}</CardTitle>
          <CardDescription>{resumo.detalhe}</CardDescription>
        </CardHeader>
      </Card>

      {aviso && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      <motion.div
        initial="oculto"
        animate="visivel"
        variants={{ oculto: {}, visivel: { transition: { staggerChildren: 0.08 } } }}
        className="grid gap-6 sm:grid-cols-2"
      >
        {dados.planos.map((plano) => (
          <motion.div
            key={plano.chave}
            variants={{ oculto: { opacity: 0, y: 12 }, visivel: { opacity: 1, y: 0 } }}
            className="flex *:w-full"
          >
            <PlanoCard
              plano={plano}
              ocupado={criar.isPending}
              linkSuporte={linkSuporteDoPlano(plano)}
              onEscolher={(escolhido) => iniciar(pedidoDoPlano(escolhido))}
            />
          </motion.div>
        ))}
      </motion.div>

      {contatoSuporte.email && (
        <p className="text-sm text-muted-foreground">
          Precisa reduzir o plano ou trocar entre mensal e anual?{" "}
          <a
            className="font-medium text-primary hover:underline"
            href={montarMailtoSuporte({
              email: contatoSuporte.email,
              empresaNome: contatoSuporte.empresaNome,
              planoChave: contatoSuporte.planoChave,
              motivo: "Quero reduzir o plano ou trocar a periodicidade",
            })}
          >
            Fale com o suporte
          </a>
          .
        </p>
      )}

      <PixDialog
        cobranca={cobranca}
        titulo={pedido?.titulo ?? "Pagamento"}
        onFechar={() => setCobranca(null)}
        onGerarNovo={gerarNovo}
      />
      <DocumentoDialog
        aberto={pedindoDocumento}
        onFechar={() => setPedindoDocumento(false)}
        onSalvo={() => {
          setPedindoDocumento(false);
          if (pedido) iniciar(pedido);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: `page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PlanosTela } from "@/components/planos/planos-tela";
import { getSessionUser } from "@/lib/auth/session";
import { carregarContextoDePlanos } from "@/lib/permissoes/contexto-de-planos";
import { carregarTelaDePlanos } from "@/lib/planos/carregar-tela-de-planos";

export const metadata: Metadata = {
  title: "Planos",
};

export default async function PlanosPage() {
  const sessao = await getSessionUser();
  if (!sessao) redirect("/login");

  const [dados, contexto] = await Promise.all([
    carregarTelaDePlanos(sessao.empresaId),
    carregarContextoDePlanos(sessao),
  ]);

  if (!dados) {
    return <p className="text-sm text-muted-foreground">Esta empresa ainda não tem uma assinatura. Fale com o suporte.</p>;
  }

  return <PlanosTela dados={dados} contatoSuporte={contexto.contatoSuporte} />;
}
```

- [ ] **Step 4: Sidebar** — em `src/components/dashboard/sidebar.tsx`, importar `CreditCard` de `lucide-react` e acrescentar ao fim de `ITENS_NAV`: `{ href: "/dashboard/planos", label: "Planos", icon: CreditCard },`.

- [ ] **Step 5: Checagens**

Run: `npx tsc --noEmit`, `npx eslint src/components/planos src/app/dashboard/planos src/components/dashboard/sidebar.tsx`, `npx vitest run src/components` (o teste de `ehItemAtivo`, se existir, não deve quebrar) e `npm run build` → todos sem erro. Se `npm run build` precisar de variáveis de ambiente indisponíveis, registrar o motivo no relatório em vez de omitir.

- [ ] **Step 6: Commit**

```bash
git add src/components/planos/plano-card.tsx src/components/planos/planos-tela.tsx src/app/dashboard/planos/page.tsx src/components/dashboard/sidebar.tsx
git commit -m "feat(planos): tela de planos com assinar, renovar e upgrade por Pix" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: "Falar com o suporte" vira "Ver planos"

**Files:**
- Modify: `src/components/common/uso-do-modulo.tsx`
- Modify: `src/app/dashboard/memorial/page.tsx`, `src/app/dashboard/comunique-se/page.tsx`, `src/app/dashboard/projetos/page.tsx`

**Interfaces:**
- Produces: `UsoDoModulo` sem a prop `contatoSuporte`; quando bloqueado mostra sempre o link "Ver planos" para `/dashboard/planos` (não depende mais de `SUPORTE_EMAIL`).

- [ ] **Step 1: Editar `uso-do-modulo.tsx`** — remover os imports de `montarMailtoSuporte`, `ContatoSuporte` e `ROTULOS_DE_USO`, a prop `contatoSuporte` (interface e desestruturação) e o cálculo de `motivo`; importar `Link from "next/link"`; substituir o bloco `{bloqueado && contatoSuporte.email && (...)}` por:

```tsx
      {bloqueado && (
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/planos">Ver planos</Link>
        </Button>
      )}
```

(`descreverUso` e `EstadoUso` continuam importados de `@/lib/permissoes/descrever-uso`.)

- [ ] **Step 2: Nas três páginas** (`memorial`, `comunique-se`, `projetos`), remover a linha `contatoSuporte={contexto.contatoSuporte}` do `<UsoDoModulo ... />`. `carregarContextoDePlanos` continua sendo usado (para `permissoes`).

- [ ] **Step 3: Checagens**

Run: `npx tsc --noEmit`, `npx eslint src/components/common/uso-do-modulo.tsx src/app/dashboard`, `npx vitest run src/lib/permissoes` → sem erros (o teste de `montarMailtoSuporte` continua valendo: a função segue em uso em `planos-tela.tsx`).

- [ ] **Step 4: Commit**

```bash
git add src/components/common/uso-do-modulo.tsx src/app/dashboard/memorial/page.tsx src/app/dashboard/comunique-se/page.tsx src/app/dashboard/projetos/page.tsx
git commit -m "feat(planos): limite estourado leva para a tela de planos" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Checklist de lançamento na documentação

**Files:**
- Modify: `docs/pagamentos-asaas.md` (nova seção ao final)

- [ ] **Step 1: Acrescentar ao fim de `docs/pagamentos-asaas.md`:**

```markdown
## 6. Lançamento (checklist)

Faça nesta ordem; a tela `/dashboard/planos` já existe, mas só cobra de verdade com as chaves de produção.

1. **Conta e webhook**: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e o webhook apontando para
   `/api/webhooks/pagamentos/asaas` (sandbox para validar; troque por produção ao lançar,
   com `ASAAS_BASE_URL` de produção). Rode `node scripts/asaas-sandbox-check.mjs --cpfcnpj=<válido>`
   antes e ajuste `PAGAMENTO_VALOR_MINIMO_CENTAVOS` se o mínimo do Asaas for maior que R$ 5,00.
2. **Banco**: aplique o schema em produção com `drizzle-kit push` **antes** de publicar o código
   (3 tabelas novas, `empresa.documento` anulável e índices; é aditivo).
3. **Renovações**: defina `CRON_SECRET` e crie a tarefa agendada diária no Coolify para
   `POST /api/cron/renovacoes` (seção 4).
4. **Empresas existentes**: `node scripts/seed-planos.mjs --preencher-existentes` se houver empresa
   sem assinatura; defina `SUPORTE_EMAIL`. Empresas criadas antes do campo de CPF/CNPJ informam o
   documento na primeira cobrança (o diálogo pede sozinho).
5. **Fim do trial**: estenda os trials em andamento (`admin-plano estender`) e só então ligue
   `ASSINATURA_SUSPENSAO_ATIVA=true`.
6. **Preços e limites**: os valores do seed (R$ 99 e R$ 249; 20 e 90 documentos por mês) são
   provisórios. Revise antes de cobrar de verdade.
7. **Teste ponta a ponta no sandbox**: crie uma conta nova, assine o Essencial, pague o Pix de
   teste, confira o plano ativo e o consumo; depois faça um upgrade e uma renovação (ajustando
   `vence_em` no banco para 3 dias à frente).
```

- [ ] **Step 2: Commit**

```bash
git add docs/pagamentos-asaas.md
git commit -m "docs(pagamentos): checklist de lancamento" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Verificação final (controlador, fora das tasks)

Antes do review final: `npx tsc --noEmit`, `npm test` completo (uma execução só), `npm run build`, e no navegador (Playwright com `page.route` simulando `/api/cobrancas` e `/api/cobrancas/[id]`, já que o sandbox pode estar sem chave): `/register` com máscara e rejeição de documento inválido; `/dashboard/planos` em trial, ativa, carência e suspensa (alterando `assinatura.status`/`vence_em` no banco de teste); diálogo do Pix com QR e cópia; polling mudando de `pendente` para `paga` (resposta simulada); passo do documento com `422 DOCUMENTO_AUSENTE`; link "Ver planos" ao estourar o limite.

## Self-Review

- **Cobertura do spec:** §1 validação → Tasks 1 e 2; §2 loader → Task 6 (com as funções puras da Task 5); §3 componentes e hooks → Tasks 7 e 8; `uso-do-modulo` → Task 9; sidebar → Task 8; §4 ajustes de backend → Tasks 3 e 4; §5 erros na tela → Task 8 (`iniciar`); §6 testes → Tasks 1–6 (componentes só por tsc/lint/navegador, pois o ambiente é `node`); §7 lançamento → Task 10. Desvios deliberados do spec: erros em aviso inline (não há lib de toast) e "Renovar" só dentro de 5 dias do vencimento ou em carência (sem isso o cliente emendaria ciclos pagos).
- **Placeholders:** nenhum.
- **Consistência de tipos:** `LinhaDeLimite` (Task 5) usado em `PlanoPublico` (Task 6); `PlanoDaTela.acao` (Task 6) consumido por `PlanoCard`/`pedidoDoPlano` (Task 8); `CobrancaError.codigo` (Task 7) usado em `planos-tela` (Task 8); `documentoSchema`/`atualizarDocumentoSchema` (Task 1) usados em Tasks 2 e 7.
