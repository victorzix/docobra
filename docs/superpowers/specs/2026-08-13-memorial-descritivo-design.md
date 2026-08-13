# Gerador de Memorial Descritivo — Design Spec

## Problema

Primeiro dos dois módulos de produto do DocObra (`CLAUDE.md`): "formulário
curto (+ opcionalmente entrada por áudio/voz) → documento técnico completo
formatado em ABNT". O schema Drizzle (`memorialDescritivo`) e a camada de
LLM (`memorialRouter`) já existem; o CRUD de Projeto (pré-requisito, já que
`memorialDescritivo.projetoId` é `notNull`) também já está pronto. Falta a
feature em si: formulário, as duas chamadas de LLM, geração de PDF via
Puppeteer e o storage do arquivo.

## Escopo

Dentro:
- Reescrever `/dashboard/memorial` (hoje placeholder) como lista de
  memoriais da empresa (projeto, status, link de download quando pronto).
- `/dashboard/memorial/novo`: escolher projeto (dos já criados) + formulário
  de 3 blocos.
- As duas chamadas de LLM (extração do áudio, geração de prosa ABNT).
- Geração de PDF via Puppeteer, storage em disco local, rota de download.
- Geração síncrona (usuário espera com loading) — sem fila de job.

Fora: CREA/responsável técnico, edição após gerado, retry automático de
geração falhada, qualquer layout de PDF além do padrão ABNT NBR 14724.

## Formulário

**Bloco 1 — Identificação da obra** (só exibição, sem input novo): nome e
endereço do projeto escolhido, nome da empresa e do usuário logado.

**Bloco 2 — Descrição geral**: `tipoConstrucao` (obrigatório, texto curto —
ex. "residencial", "comercial"), `numeroPavimentos` (opcional, inteiro),
`areaConstruida` (opcional, decimal, m²), `areaTerreno` (opcional, decimal,
m²).

**Bloco 3 — Especificações técnicas** (4 sistemas, todos opcionais:
`fundacaoEstrutura`, `alvenariaCobertura`, `instalacoes`, `acabamentos`) —
um único toggle pro bloco inteiro:
- **Modo texto**: 4 textareas, um por sistema.
- **Modo áudio**: uma gravação só (cobre os 4 sistemas juntos); o LLM
  extrai os 4 campos da transcrição.

## Comportamento observável

### Criar (`POST /api/memoriais`)

Body (JSON):
```ts
{
  projetoId: string;
  tipoConstrucao: string;
  numeroPavimentos?: number;
  areaConstruida?: number;
  areaTerreno?: number;
  modoEspecificacoes: "texto" | "audio";
  // se modoEspecificacoes === "texto":
  especificacoes?: {
    fundacaoEstrutura?: string;
    alvenariaCobertura?: string;
    instalacoes?: string;
    acabamentos?: string;
  };
  // se modoEspecificacoes === "audio":
  audioBase64?: string;
  audioMimeType?: string;
}
```

Pipeline, na mesma request (síncrono):

1. Valida o body (Zod) e confirma que `projetoId` pertence à empresa da
   sessão (mesma checagem de posse já usada em outras entidades).
2. Insere a linha com `status: "rascunho"` e `respostasFormularioJson`
   contendo os campos dos blocos 2-3 (ainda sem as 4 especificações se for
   modo áudio).
3. **Se `modoEspecificacoes === "audio"`**: `memorialRouter.transcribeAudio(audio, mimeType)`
   → `memorialRouter.extractStructured({ userPrompt: transcricao, schema: SCHEMA_ESPECIFICACOES })`
   preenche os 4 campos do bloco 3. Salva o áudio em disco
   (`storage/memoriais/<id>-audio.<ext>`), guarda o caminho em `audioUrl`.
4. `memorialRouter.extractStructured({ userPrompt: <todos os campos>, schema: SCHEMA_PROSA })`
   — expande em prosa ABNT, retornando `{ descricaoGeral: string, especificacoesTecnicas: string }`.
5. Renderiza o template HTML/CSS (ABNT NBR 14724) com os dois blocos de
   prosa + os campos estruturados, gera o PDF via Puppeteer, salva em
   `storage/memoriais/<id>.pdf`.
6. Atualiza a linha: `status: "gerado"`, `documentoGeradoUrl: "/api/memoriais/<id>/pdf"`.
7. Retorna `201 { memorial: { id, status, documentoGeradoUrl } }`.

Se qualquer passo de 3-6 falhar: a linha permanece `status: "rascunho"`
(sem `documentoGeradoUrl`), resposta `500 { error: "Erro ao gerar o memorial, tente novamente." }`.
Nenhum retry automático — o usuário tenta de novo manualmente (cria outro).

### Listar (`/dashboard/memorial`, Server Component)

Busca todos os memoriais da empresa (join com `projeto`), mostra nome do
projeto, status, e um link "Baixar PDF" quando `status === "gerado"`.

### Baixar (`GET /api/memoriais/[id]/pdf`)

Verifica que o memorial pertence (via `projeto.empresaId`) à empresa da
sessão — reautoriza pelo `id`, nunca confia soment no valor de
`documentoGeradoUrl`. Lê o arquivo de `storage/memoriais/<id>.pdf` e
retorna como `application/pdf`. `404` se o memorial não existe, não
pertence à empresa, ou ainda não tem PDF gerado.

## Modos de falha

| Cenário | Comportamento |
|---|---|
| `tipoConstrucao` ausente | `400`, sem inserir nada |
| `projetoId` de outra empresa (ou inexistente) | `404` — mesma resposta pros dois casos, não revela se o projeto existe |
| Transcrição de áudio falha (Gemini indisponível, nenhum provider suporta) | `500`, memorial fica `rascunho` sem áudio salvo |
| `extractStructured` falha (qualquer das duas chamadas) | `500`, memorial fica `rascunho` |
| Puppeteer falha ao renderizar | `500`, memorial fica `rascunho`, sem `documentoGeradoUrl` |
| Download de memorial de outra empresa | `404` |
| Download de memorial ainda `rascunho` (sem PDF) | `404` |

## Como se prova que funciona

- Query layer: criar (rascunho e já-gerado), listar por empresa, buscar
  por id com checagem de posse.
- Schema Zod dos 3 blocos: campos obrigatórios/opcionais, os dois modos de
  `especificacoes`.
- `POST /api/memoriais`: teste com `memorialRouter` mockado (sem chamada
  real de API) cobrindo modo texto (sucesso), modo áudio (transcreve +
  extrai + gera), posse de projeto de outra empresa (403/404), falha em
  cada etapa do pipeline deixando o registro em `rascunho`.
- Geração de PDF: teste de que o Puppeteer produz um buffer PDF válido a
  partir do template (sem checar layout pixel a pixel).
- `GET /api/memoriais/[id]/pdf`: 404 pra outro-empresa e pra rascunho;
  sucesso retorna os bytes certos com o content-type certo.
- Verificação manual final: fluxo completo com modo texto, fluxo completo
  com modo áudio (usando um áudio de teste real), download do PDF,
  confirmação visual básica do layout ABNT.

## Decisões

- **Toggle único pro bloco 3 inteiro** (não por sistema individual) —
  decisão explícita: uma gravação cobre os 4 sistemas juntos, não uma
  gravação por sistema. Bate com o schema (`audioUrl` é uma coluna só).
- **Geração síncrona, sem fila de job** — decisão já tomada antes de
  escrever esta spec; aceitável pro volume esperado do MVP.
- **PDF em disco local**, servido por rota própria que reautoriza pelo
  `id` — nunca confia direto no valor salvo em `documentoGeradoUrl`.
- **Sem persistir a prosa gerada separadamente** — ela só existe dentro do
  PDF final; não há necessidade de guardar de novo no banco.
- **Falha no pipeline não desfaz o registro** — a linha fica em
  `rascunho`; o usuário decide se tenta de novo (cria outro memorial),
  sem lógica de retry automática nesta versão.
- **PDF padrão ABNT NBR 14724** (A4, fonte serifada 12pt, margens 3cm/2cm,
  espaçamento 1,5) — confirmado com o usuário, sem requisito extra.

## Empurrado pra depois

- CREA/responsável técnico no formulário.
- Editar um memorial já gerado (ou regenerar).
- Retry automático de geração falhada.
- Qualquer customização de layout do PDF além do padrão ABNT.
- Preview do memorial antes de gerar o PDF final.
