# Comunique-se: Checklist Editável, Criação Manual e Modelo Exportável — Design Spec

## Problema

O módulo Comunique-se (spec anterior:
`docs/superpowers/specs/2026-08-19-comunique-se-design.md`) só tem hoje um
jeito de existir: subir o PDF que a prefeitura emitiu. Isso expôs um
problema de UX real — nada na tela explica que esse PDF é um documento
oficial que a prefeitura *emite* (durante a análise do Alvará de
Construção), não algo que o usuário cria. Quem ainda não tem esse PDF em
mãos fica sem alternativa nenhuma.

Esta spec fecha a resolução definitiva combinada com o usuário: o
checklist passa a ser **sempre editável** depois de criado, existe um
**segundo jeito de criar** (digitando as exigências direto, sem PDF nem
IA), e o sistema ganha um **formato próprio exportável** (um PDF com os
dados do checklist embutidos dentro) que também pode ser **reimportado**
depois — detectado automaticamente no mesmo campo de upload de sempre.

## Escopo

Dentro:
- Checklist totalmente editável: adicionar item, editar o texto de um
  item, remover item — não importa a origem (PDF, digitado ou
  reimportado).
- Criar digitando: toggle "Enviar PDF" / "Digitar exigências" no drawer
  (mesmo padrão do toggle Digitar/Gravar áudio do Memorial Descritivo),
  com lista dinâmica de itens (+ adicionar item). Fica `pronto` na hora,
  sem PDF, sem storage, sem IA.
- Exportar modelo DocObra: botão na página de detalhe que gera, na hora,
  um PDF formatado (mesma infra Puppeteer do Memorial) com um `.json`
  anexado dentro do próprio arquivo (via `pdf-lib`) contendo os itens do
  checklist estruturados.
- Importar modelo DocObra: reaproveita o campo de upload de PDF de sempre.
  Antes de extrair texto e chamar IA, o sistema verifica se o PDF tem esse
  anexo específico — se tiver, importa os itens direto (sem IA, sem
  custo, instantâneo); se não tiver, segue o fluxo de extração+IA de
  sempre, sem erro nenhum pro usuário.
- Migração: `pdfOriginalUrl` deixa de ser `NOT NULL` (um Comunique-se
  criado digitando não tem PDF nenhum).
- Estado vazio no checklist (zero itens) deixa de ser tela em branco —
  ganha uma mensagem, já que remover itens até esvaziar a lista agora é
  um caminho real (antes só acontecia num caso raro de resposta vazia da
  IA).

Fora (mantém do spec anterior): múltiplos PDFs/versionamento por
Comunique-se, categorização/agrupamento de itens, fila assíncrona, OCR
para PDF escaneado. Também fora desta vez: qualquer UI de "biblioteca de
modelos" dentro do próprio DocObra (salvar/listar modelos exportados) —
o modelo vira só um arquivo baixado; reaproveitar é responsabilidade do
usuário guardar e subir de novo quando quiser.

## Migração de schema

`src/db/schema/comunique-se.ts`: `pdfOriginalUrl` passa de
`varchar(...).notNull()` para `varchar(...)` (nullable). Registros
existentes não são afetados (já têm valor). Precisa rodar
`drizzle-kit generate` + aplicar a migração antes do resto do trabalho.

Todo lugar que hoje assume `pdfOriginalUrl: string` não-nulo precisa
virar `string | null`: a interface `ComuniqueSe` (query layer), o schema
Zod de resposta (`comuniqueSeResponseSchema`), e a página de detalhe (o
link "Baixar PDF original" só aparece quando o valor existe).

## Formato do anexo embutido

Verificado nesta sessão que `pdf-lib` consegue anexar um arquivo dentro de
um PDF (`doc.attach(buffer, nome, opções)`) e reler esse anexo depois —
mas a leitura não tem API de alto nível na versão instalada
(`getAttachments` não existe em `pdf-lib@1.17.1`); precisa navegar
manualmente a estrutura `catalog → Names → EmbeddedFiles → Names[] →
FileSpec → EF → F → stream`, e o nome do arquivo vem como `PDFHexString`
(não `PDFString`) — usar `.decodeText()` em vez de checar o tipo. Round-trip
completo (anexar → salvar → recarregar → reler) confirmado batendo
byte-a-byte com o conteúdo original, e confirmado que um PDF sem esse
anexo (qualquer PDF real de prefeitura) retorna `null` sem lançar erro.

Conteúdo do anexo (nome de arquivo fixo: `docobra-checklist.json`):

```ts
interface ModeloExportado {
  formato: "docobra-comunique-se-v1";
  itens: { descricao: string; concluida: boolean }[];
}
```

Sem `id` nem referência de projeto no payload — importar sempre cria um
Comunique-se novo (ids de item regenerados na importação), no projeto que
o usuário escolher no drawer, igual a qualquer upload.

## Comportamento observável

### Criar — três caminhos

`POST /api/comunique-se` ganha um discriminador `modoCriacao: "pdf" | "manual"`
(mesmo padrão do `modoEspecificacoes` do Memorial):

**`modoCriacao: "pdf"`** (`{ projetoId, pdfBase64 }`, igual hoje):
1. Valida PDF (magic number + tamanho ≤ 10MB), confirma posse do projeto —
   igual hoje.
2. Gera `id`, salva o PDF em disco, insere a linha com
   `status: "processando"` — igual hoje.
3. **Novo passo**: tenta detectar o anexo `docobra-checklist.json` no PDF
   recebido. Se achar e o conteúdo bater com `ModeloExportado` (schema
   Zod), gera ids novos pra cada item e marca `status: "pronto"` direto —
   sem extrair texto, sem chamar `comuniqueSeRouter`.
4. Se não achar o anexo (ou o conteúdo não bater com o schema esperado),
   segue o fluxo de sempre: extrai texto local, chama IA, marca
   `pronto`/`erro`.

**`modoCriacao: "manual"`** (`{ projetoId, itens: [{ descricao }] }`,
mínimo 1 item):
1. Confirma posse do projeto.
2. Gera `id`, insere a linha com `pdfOriginalUrl: null`,
   `status: "pronto"` e `checklistJson` já preenchido (ids gerados,
   `concluida: false` em todos) — numa única inserção, sem storage, sem
   IA.

### Editar o checklist

- `PATCH /api/comunique-se/[id]/itens` — generaliza de "só `concluida`"
  pra `{ itemId, concluida?, descricao? }` (atualiza o que vier
  preenchido; pelo menos um dos dois é obrigatório).
- `POST /api/comunique-se/[id]/itens` (novo) — `{ descricao }` → adiciona
  item no fim da lista (`id` gerado, `concluida: false`).
- `DELETE /api/comunique-se/[id]/itens/[itemId]` (novo) — remove o item.
  Sem bloqueio contra esvaziar a lista.

Todos os três exigem `status === "pronto"` (mesma checagem que já existe
no toggle hoje) e reautorizam por posse via `buscarComuniqueSeDaEmpresa`.

### Exportar

`GET /api/comunique-se/[id]/modelo` — `400` se `status !== "pronto"`.
Renderiza um HTML simples com o checklist (referência, projeto, lista de
itens com estado concluído/pendente), gera o PDF via Puppeteer, anexa o
`.json` (formato acima) via `pdf-lib`, retorna como `application/pdf`.
**Gerado na hora a cada request — nunca fica salvo em disco**, então
sempre reflete o estado atual do checklist (edições recentes incluídas),
sem risco de ficar desatualizado.

## UI

**Drawer "Novo Comunique-se"** — ganha um toggle no topo do formulário,
"Enviar PDF" / "Digitar exigências" (mesmo componente visual do toggle
Digitar/Gravar áudio já usado no Memorial):
- Modo "Enviar PDF": formulário de hoje, sem mudança visível pro usuário
  (a detecção de modelo embutido acontece em silêncio no backend).
- Modo "Digitar exigências": lista dinâmica — um campo de texto por
  item, botão "+ adicionar item", sem chamada de IA. Some com o campo de
  arquivo.

**`ChecklistItens`** (client component, hoje só checkbox) — ganha:
- Clique no texto do item vira campo editável (input inline); `blur` ou
  Enter confirma e dispara o `PATCH` com o novo `descricao`; Escape
  cancela sem salvar.
- Botão de remover (ícone) ao lado de cada item.
- "+ adicionar item" no fim da lista — abre um campo de texto vazio,
  confirma com Enter, dispara o `POST`.
- Estado vazio (`itens.length === 0`): mensagem "Nenhuma exigência ainda"
  + o controle de adicionar continua visível.

**Página de detalhe** — ganha um botão "Baixar modelo" (chama
`GET .../modelo`) ao lado de "Baixar PDF original" — que só aparece
quando `pdfOriginalUrl` não é nulo.

## Modos de falha

| Cenário | Comportamento |
|---|---|
| Anexo embutido corrompido ou com `formato` desconhecido | Fallback silencioso pro fluxo de extração+IA — não é erro pro usuário |
| Criar `modoCriacao: "manual"` sem nenhum item | `400` |
| Editar/adicionar/remover item de Comunique-se inexistente (ou de outra empresa) | `404` |
| `PATCH`/`DELETE` com `itemId` que não existe no checklist | `404` |
| Editar/adicionar/remover item quando `status !== "pronto"` | `400` |
| Exportar modelo de Comunique-se que não está `pronto` | `400` |
| Checklist esvaziado (removeu o último item) | Permitido — UI mostra estado vazio, não erro |
| Download de PDF original de um Comunique-se criado digitando (`pdfOriginalUrl` nulo) | Link "Baixar PDF original" simplesmente não aparece na UI |

## Como se prova que funciona

- Migração: teste confirmando que um Comunique-se pode ser inserido com
  `pdfOriginalUrl: null` sem violar constraint.
- Query layer: `criarComuniqueSeManual` (ou equivalente), `adicionarItemChecklist`,
  `removerItemChecklist`, `atualizarItemChecklist` generalizado — casos de
  sucesso, item inexistente, checklist inexistente.
- Detecção de anexo: função isolada (`detectarModeloEmbutido` ou nome
  equivalente) testada com três casos reais gerados via Puppeteer+pdf-lib:
  PDF com anexo válido (retorna itens), PDF sem anexo nenhum (retorna
  `null`), PDF com anexo cujo conteúdo não bate o schema esperado (retorna
  `null`, não lança erro).
- `POST /api/comunique-se` (modo `pdf`): teste cobrindo os dois sub-casos
  — detecta modelo embutido e pula IA (mock do `comuniqueSeRouter` nunca
  chamado), e PDF sem anexo cai no fluxo de IA de sempre (mock chamado
  normalmente).
- `POST /api/comunique-se` (modo `manual`): sucesso com N itens, rejeição
  com zero itens.
- Rotas de edição de item (`PATCH`/`POST`/`DELETE` em `.../itens`):
  sucesso de cada operação, 404 pros casos de item/Comunique-se
  inexistente, 400 quando `status !== "pronto"`.
- `GET .../modelo`: gera um PDF válido (`%PDF-` no início dos bytes),
  reabrir esse PDF com `pdf-lib` e confirmar que o anexo extraído bate
  com o `checklistJson` atual do banco. 400 quando não está `pronto`.
- Round-trip completo: exportar modelo de um Comunique-se → usar esse
  arquivo como upload de um novo Comunique-se (`modoCriacao: "pdf"`) →
  confirmar que o novo checklist tem os mesmos itens, sem nenhuma chamada
  ao `comuniqueSeRouter`.
- Verificação manual: criar digitando, editar/adicionar/remover itens,
  exportar modelo, reimportar esse modelo num Comunique-se novo, esvaziar
  um checklist até ficar sem itens e confirmar o estado vazio.

## Decisões

- **Formato do anexo sem `id`/projeto** — importar sempre cria um
  registro novo; não existe "restaurar" um Comunique-se específico pelo
  modelo exportado, só reaproveitar o conteúdo do checklist.
- **Detecção automática, sem UI separada** — o usuário nunca precisa
  saber se está fazendo upload de um PDF real ou reimportando um modelo;
  o campo de arquivo é o mesmo, a diferença é só técnica.
- **Modelo gerado on-demand, nunca persistido em disco** — evita o
  problema de um arquivo exportado ficar desatualizado depois de uma
  edição no checklist.
- **`pdf-lib` como dependência nova** — verificado nesta sessão que
  funciona neste ambiente (anexar e reler), incluindo a peculiaridade de
  não ter API de alto nível pra leitura na versão instalada.
- **Sem limite de tamanho pro checklist** (nº de itens) — segue o mesmo
  raciocínio de YAGNI do resto do projeto; um Comunique-se real não passa
  de poucas dezenas de exigências.
- **Reabrindo uma decisão do spec anterior**: "edição manual dos itens do
  checklist" estava explicitamente fora de escopo — fica revertido aqui,
  por pedido explícito do usuário, como resolução definitiva do problema
  de UX identificado.

## Empurrado pra depois

- Qualquer "biblioteca de modelos" dentro do próprio DocObra (salvar
  modelo com nome, listar modelos salvos, reaproveitar sem precisar
  baixar/subir arquivo).
- Editar em lote (marcar vários itens concluídos de uma vez, reordenar
  itens).
- Validação de que o `.json` embutido não excede um limite de tamanho
  absurdo — não é um caso real dado o tamanho esperado do checklist.
- Atomicidade forte no read-modify-write dos endpoints de item (mesma
  característica já aceita no spec anterior — MVP, sem lock/transação
  otimista; mitigado no client com serialização de mutations do React
  Query dentro da mesma aba).
