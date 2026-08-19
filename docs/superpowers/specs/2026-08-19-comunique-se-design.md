# Tradutor de Exigências da Prefeitura (Comunique-se) — Design Spec

## Problema

Segundo dos dois módulos de produto do DocObra (`CLAUDE.md`): "upload de PDF
de 'Comunique-se' → checklist de tarefas em linguagem simples". O schema
Drizzle (`comuniqueSe`) já existe (esqueleto), assim como a camada de LLM
(`comuniqueSeRouter`, com `LLM_ORDER_COMUNIQUE_SE` já no `.env.example`) e o
CRUD de Projeto (pré-requisito, já que `comuniqueSe.projetoId` é `notNull`).
Falta a feature em si: upload do PDF, extração do texto, chamada de LLM
estruturada, e a UI de lista + checklist interativo.

## Escopo

Dentro:
- Reescrever `/dashboard/comunique-se` (hoje placeholder) como lista dos
  Comunique-se da empresa (projeto, status, link "Ver checklist" quando
  pronto).
- Drawer "Novo Comunique-se": escolher projeto (dos já criados, reaproveita
  `ProjetoCombobox`) + upload de um PDF.
- Extração de texto local (`pdf-parse`, sem custo de IA) + uma chamada de
  LLM estruturada (`comuniqueSeRouter.extractStructured`) que devolve a
  lista de itens do checklist em linguagem simples.
- `/dashboard/comunique-se/[id]`: página dedicada com o checklist
  interativo (checkbox por item, persistido) + link de download do PDF
  original.
- Retry manual quando a extração falha, reaproveitando o PDF já salvo (sem
  re-upload) — mesmo padrão do memorial descritivo.
- Geração síncrona (usuário espera com loading) — sem fila de job, mesma
  decisão já tomada pro memorial descritivo.

Fora: múltiplos PDFs por Comunique-se (ou versionamento), edição manual dos
itens do checklist (adicionar/remover/editar texto), categorização ou
agrupamento de itens, fila de job assíncrona, OCR para PDF escaneado sem
camada de texto extraível, notificação/alerta de prazo por item.

## Modelo de dados

Schema já existe (`src/db/schema/comunique-se.ts`); só falta definir o shape
do `checklistJson`:

```ts
// comunique_se (já existe)
{ id, numero, projetoId, pdfOriginalUrl, checklistJson, status, createdAt, updatedAt }

// checklistJson (novo, definido agora) — lista plana, sem agrupamento:
type ChecklistItem = { id: string; descricao: string; concluida: boolean };
type ChecklistJson = { itens: ChecklistItem[] };

// status:
// "processando" — linha criada, PDF salvo, extração ainda não rodou/rodando
// "pronto"      — checklistJson preenchido
// "erro"        — extração falhou; PDF continua salvo em disco pro retry
```

`numero` reaproveita `proximoNumero(empresaId, "comunique_se")` — a entidade
já está no tipo `EntidadeComContador` (`src/db/queries/contador.ts`), sem
precisar de mudança ali.

## Arquivos novos (espelhando a estrutura do memorial descritivo)

- `src/lib/comunique-se/storage.ts` — igual a `memorial/storage.ts`, com
  `COMUNIQUE_SE_STORAGE_DIR` (default `storage/comunique-se`).
- `src/lib/comunique-se/processar.ts` — pipeline de extração (equivalente a
  `memorial/gerar.ts`).
- `src/db/queries/comunique-se.ts` — CRUD, espelhando `db/queries/memorial.ts`.
- `src/lib/validations/comunique-se/create.schema.ts`,
  `response.schema.ts`, `toggle-item.schema.ts` — um arquivo por operação.

## Comportamento observável

### Criar (`POST /api/comunique-se`)

Body (JSON):
```ts
{ projetoId: string; pdfBase64: string }
```

Pipeline, na mesma request (síncrono):

1. Valida o body (Zod) e confirma que `projetoId` pertence à empresa da
   sessão (mesma checagem de posse já usada em outras entidades).
2. Decodifica `pdfBase64`; rejeita se o buffer não começar com o magic
   number `%PDF-` ou se o tamanho decodificado passar de 10MB.
3. Insere a linha com `status: "processando"` (`criarComuniqueSeRascunho`).
4. Salva o PDF em disco (`storage/comunique-se/<id>.pdf`) e atualiza
   `pdfOriginalUrl: "/api/comunique-se/<id>/pdf"` — **antes** de qualquer
   chamada de LLM, pra um retry futuro não precisar de re-upload.
5. Extrai texto do PDF localmente via `pdf-parse`. Se vier vazio/só espaços,
   trata como falha (PDF provavelmente escaneado, sem camada de texto).
6. `comuniqueSeRouter.extractStructured({ userPrompt: textoExtraido, schema: SCHEMA_CHECKLIST })`
   → `{ itens: [{ descricao: string }] }`.
7. Mapeia cada item pra `{ id: crypto.randomUUID(), descricao, concluida: false }`.
8. Atualiza a linha: `status: "pronto"`, `checklistJson: { itens }`.
9. Retorna `201 { comuniqueSe: { id, numero, status, pdfOriginalUrl } }`.

Se qualquer passo de 5-8 falhar: `catch` marca a linha como `status: "erro"`
(a linha e o PDF já existem desde o passo 3-4) e a rota retorna
`500 { error: "Erro ao processar o Comunique-se, tente novamente." }`.

### Listar (`/dashboard/comunique-se`, Server Component + `GET /api/comunique-se`)

Mesmo padrão do memorial: o Server Component busca a lista inicial (join
com `projeto`, ordenado por `createdAt` desc) e hidrata um hook React Query
(`useComuniqueSes`) que também bate no `GET` pra refetch/invalidations
depois de criar ou dar retry.

### Retry (`POST /api/comunique-se/[id]/retry`)

Reautoriza por posse (via `projeto.empresaId`), exige `status !== "pronto"`,
relê o PDF já salvo em disco (sem precisar de body) e repete os passos 5-8.

### Marcar item (`PATCH /api/comunique-se/[id]/itens`)

Body: `{ itemId: string; concluida: boolean }`. Reautoriza por posse, exige
`status === "pronto"`, faz read-modify-write no `checklistJson` (substitui
o item pelo `id`) — sem tabela filha, mantém tudo no mesmo jsonb.

### Baixar PDF original (`GET /api/comunique-se/[id]/pdf`)

Igual ao do memorial: reautoriza pelo `id` via `projeto.empresaId`, nunca
confia só no valor salvo em `pdfOriginalUrl`. Lê o arquivo de
`storage/comunique-se/<id>.pdf` e retorna como `application/pdf`.

## UI

**`/dashboard/comunique-se/page.tsx`** (Server Component, mesmo molde do
`memorial/page.tsx`): busca `listarComuniqueSe(empresaId)` +
`listarProjetos(empresaId)` (pro combobox do drawer), hidrata
`ComuniqueSeLista` (client, React Query) + `NovoComuniqueSeDrawer`.

**`ComuniqueSeLista`** — grid de cards (`sm:grid-cols-2`, igual
`MemoriaisLista`), cada card mostra `numero` (referência), nome do projeto,
e o estado:
- `processando` → indicador de carregamento.
- `pronto` → link "Ver checklist" pra `/dashboard/comunique-se/[id]`.
- `erro` → botão "Tentar novamente" (`useRetryComuniqueSe`, mesmo molde do
  `useRetryMemorial`).

**`NovoComuniqueSeDrawer`** — mesmo Drawer/Vaul do `NovoMemorialDrawer`:
- `ProjetoCombobox` reaproveitado direto.
- Input de arquivo (`<input type="file" accept="application/pdf">` —
  primeiro upload de arquivo do projeto; não existe padrão prévio pra isso).
  No `onChange`, lê o `File` no client (`arrayBuffer()` → base64) e guarda
  em estado local, mesmo esquema que o `GravadorAudio` já faz com o áudio.
- Validação client-side espelhando o schema Zod (tipo `application/pdf`,
  tamanho ≤ 10MB) antes de habilitar o envio, sem depender só do erro do
  servidor.
- Overlay de loading (`LoadingSpinner`) igual ao `NovoMemorialForm` durante
  o processamento.

**`/dashboard/comunique-se/[id]/page.tsx`** (Server Component): busca via
`buscarComuniqueSeDaEmpresa(id, empresaId)` — `notFound()` se não existe ou
não é da empresa. Renderiza cabeçalho (referência, projeto, link "Baixar
PDF original") e:
- Se `status !== "pronto"`: estado vazio (`processando` → mensagem simples;
  `erro` → botão de retry).
- Se `pronto`: `ChecklistItens` (client component) — lista de checkboxes
  (shadcn `Checkbox`), cada toggle chama `PATCH /api/comunique-se/[id]/itens`
  com update otimista local, sem precisar de refetch completo.

## Modos de falha

| Cenário | Comportamento |
|---|---|
| `projetoId` ausente/inválido | `400`, sem inserir nada |
| Arquivo não é PDF (magic number `%PDF-` ausente) | `400`, sem inserir nada |
| PDF maior que 10MB | `400`, sem inserir nada |
| `projetoId` de outra empresa (ou inexistente) | `404` — mesma resposta pros dois casos |
| PDF sem texto extraível (provável scan sem OCR) | linha fica `erro`, PDF salvo, `500` na resposta |
| `extractStructured` falha (Gemini e Claude) | linha fica `erro`, PDF salvo, `500` |
| Retry num Comunique-se já `pronto` | `400` — "já foi processado" |
| Marcar item de um Comunique-se que não está `pronto` | `400` |
| `itemId` inexistente no `PATCH` | `404` |
| Download de PDF de outra empresa / inexistente | `404` |

## Como se prova que funciona

- Query layer: criar (`processando`), marcar como `pronto` / `erro`, listar
  por empresa, buscar por id com checagem de posse, atualizar item do
  checklist.
- Schema Zod: `create` (tipos e tamanho do PDF), `toggle-item`.
- `POST /api/comunique-se`: teste com `comuniqueSeRouter` e `pdf-parse`
  mockados — sucesso (PDF com texto → checklist gerado com IDs únicos),
  posse de projeto de outra empresa (`404`), arquivo que não é PDF ou passa
  de 10MB (`400`), texto extraído vazio (linha fica `erro`), falha do
  `extractStructured` (linha fica `erro`).
- `POST /api/comunique-se/[id]/retry`: reprocessa uma linha `erro`
  reaproveitando o PDF salvo, sem exigir body; rejeita retry de linha já
  `pronto`.
- `PATCH /api/comunique-se/[id]/itens`: alterna `concluida`, `404` pra
  `itemId` inexistente, `400` se o Comunique-se ainda não está `pronto`.
- `GET /api/comunique-se/[id]/pdf`: `404` pra outra empresa e pra Comunique-se
  inexistente; sucesso retorna os bytes certos com o content-type certo.
- Verificação manual final: upload de um PDF real de Comunique-se, checklist
  gerado, toggle de itens persistindo entre reloads, retry manual simulando
  falha (ex.: mockando erro temporariamente).

## Decisões

- **Extração de texto local (`pdf-parse`) em vez de mandar o PDF direto
  pro LLM (multimodal)** — mantém a interface do `LLMProvider` sem mudança
  (`extractStructured` continua só texto) e preserva o fallback completo
  Gemini↔Claude que esse módulo já tem (diferente do memorial, que depende
  só do Gemini pra transcrição de áudio). Limitação aceita: PDF escaneado
  sem camada de texto não extrai bem — mesmo tipo de limitação já aceito
  pro áudio do memorial (ver `CLAUDE.md`), sem OCR nesta versão.
- **`checklistJson` como lista plana**, sem categoria/agrupamento — YAGNI
  até aparecer necessidade real de categorizar.
- **Status `erro` explícito** (diferente do memorial, que fica
  implicitamente em `rascunho` se a geração falhar) — como o valor default
  aqui já se chama `"processando"`, deixá-lo assim numa falha permanente
  seria confuso; um estado próprio deixa a UI (e o retry) mais claros.
- **Upload em base64 dentro do JSON body**, não multipart — consistente
  com o padrão já usado pro áudio no memorial (`audioBase64`), evita
  introduzir um segundo mecanismo de envio de arquivo no projeto.
- **Limite de 10MB no upload** — cobre a grande maioria dos Comunique-se
  (poucas páginas de texto/scan leve) sem deixar o body da request em
  base64 gigante.
- **PDF em disco local**, servido por rota própria que reautoriza pelo
  `id` — nunca confia direto no valor salvo em `pdfOriginalUrl` (mesma
  decisão do memorial).
- **Toggle de item no mesmo `checklistJson`** (read-modify-write), sem
  tabela filha — três a dez itens por checklist não justificam uma tabela
  relacional separada nesta versão.

## Empurrado pra depois

- OCR para PDF escaneado sem camada de texto extraível.
- Múltiplos PDFs por Comunique-se ou versionamento de um mesmo checklist.
- Edição manual dos itens do checklist (adicionar, remover, editar texto).
- Categorização/agrupamento de itens (ex.: por setor da prefeitura).
- Fila de job assíncrona (hoje é geração síncrona, mesma decisão do
  memorial).
- Notificação ou alerta de prazo por item.
