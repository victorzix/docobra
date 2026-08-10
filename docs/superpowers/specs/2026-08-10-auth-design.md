# Autenticação local (login, registro, sessão) — Design

## Problema

Hoje não existe forma de um usuário criar conta, entrar no sistema, ou ter
páginas do produto protegidas — qualquer rota é acessível sem identificação, e
não há como associar dados (projetos, memoriais, comunique-se) a uma
empresa/usuário específico.

## Escopo

**Entra**

- Autocadastro: usuário cria Empresa + Usuario admin em uma única tela.
- Login por email + senha.
- Logout.
- Sessão via JWT em cookie httpOnly, deslizante (renovada a cada request
  válido em rota protegida).
- Proteção de rotas via middleware, por inclusão (`/dashboard/:path*`).
- `getSessionUser()` para Server Components/Route Handlers saberem quem está
  logado.

**Não entra**

- Recuperação de senha ("esqueci minha senha") — evita montar infra de envio
  de email antes de validar o produto. Fica pra depois.
- Múltiplos papéis/permissões — campo `papel` já existe no schema, mas a
  lógica de autorização é TODO explícito (ver `CLAUDE.md`); todo usuário
  logado tem acesso igual às rotas protegidas por ora.
- Convite de membro pra empresa existente — só existe o fluxo de criar
  empresa nova; adicionar um segundo usuário à mesma empresa fica pra depois.
- Access + refresh token — um JWT só é mais simples; troca de segurança
  aceita conscientemente pro estágio do MVP.

## Comportamento observável

### `POST /api/auth/register`

```text
POST /api/auth/register
{ "nomeEmpresa": "Ancar Engenharia", "nome": "Victor", "email": "victor@ancar.com.br", "senha": "..." }
→ 201
{ "usuario": { "id": "...", "nome": "Victor", "email": "victor@ancar.com.br", "papel": "admin" } }
Set-Cookie: docobra_session=<jwt>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
```

| Situação | Resultado |
|---|---|
| Email já cadastrado | `409 { "error": "Este email já está cadastrado." }` |
| Campo obrigatório ausente / senha curta (< 8) / email malformado | `400 { "error": "...", "fields": { "<campo>": "..." } }` |
| Sucesso | `201`, cookie setado, Empresa + Usuario criados numa transação |

### `POST /api/auth/login`

```text
POST /api/auth/login
{ "email": "victor@ancar.com.br", "senha": "..." }
→ 200
{ "usuario": { "id": "...", "nome": "Victor", "email": "...", "papel": "admin" } }
Set-Cookie: docobra_session=<jwt>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
```

| Situação | Resultado |
|---|---|
| Email não existe | `401 { "error": "Email ou senha incorretos." }` |
| Senha errada | `401 { "error": "Email ou senha incorretos." }` (mensagem idêntica ao caso anterior — nunca revela qual dos dois falhou) |
| Sucesso | `200`, cookie setado |

### `POST /api/auth/logout`

```text
POST /api/auth/logout
→ 200 { "ok": true }
Set-Cookie: docobra_session=; HttpOnly; Path=/; Max-Age=0
```

### `middleware.ts` — toda request em `/dashboard/**`

| Situação | Resultado |
|---|---|
| Sem cookie `docobra_session` | `307` → `/login?from=<path>` |
| Cookie presente mas inválido/expirado | `307` → `/login?from=<path>`, cookie inválido é limpo na response |
| Cookie válido | Request segue; cookie é regravado com expiração renovada (+7 dias a partir de agora) |

## Modelo de dados

Usa `empresa` e `usuario`, já existentes em `src/db/schema/`. `usuario.papel`
recebe sempre `"admin"` no registro (quem cria a empresa é o admin dela) —
não há fluxo de convite/segundo usuário neste escopo.

**Alteração necessária**: `usuario` ganha a coluna `nome` (varchar,
obrigatória). O esboço original do modelo de dados no `CLAUDE.md` não previa
essa coluna, mas o contrato de registro/login precisa exibir o nome de quem
está logado — sem ela não tem como responder "usuario.nome" no `201`/`200`
descritos abaixo. Requer uma migration; não afeta `empresa`, `projeto`,
`memorial_descritivo` nem `comunique_se`.

## Modos de falha

| Falha | Comportamento esperado |
|---|---|
| Postgres indisponível durante registro/login | `500 { "error": "Erro interno, tente novamente." }`, sem detalhe de infra na resposta |
| `JWT_SECRET` ausente/mal configurado | Exceção não tratada, aparece no log do processo — erro de configuração de ambiente, não de usuário; não vale checagem de startup pra esse MVP |
| Cookie adulterado (assinatura não confere) | `verificarToken` rejeita → tratado como "cookie inválido" em todos os pontos acima |
| Dois registros simultâneos com o mesmo email (race condition) | A constraint `unique` em `usuario.email` garante que só um insert vinga; o segundo recebe erro de constraint do Postgres, que a rota converte pra `409` igual ao caso de checagem prévia |

## Como se prova que funciona

**Unidade** (Vitest — novo dev dependency do projeto, nenhum test runner
existia antes desta spec):

- `hashSenha`/`verificarSenha`: senha certa valida `true`, senha errada
  valida `false`, hash nunca é igual à senha em texto puro.
- `assinarToken`/`verificarToken`: round-trip preserva o payload; token
  expirado rejeita; token com assinatura errada (secret diferente) rejeita.
- `register.schema.ts`/`login.schema.ts`: cada campo obrigatório ausente
  falha, email malformado falha, senha com menos de 8 caracteres falha,
  input válido passa.
- `resolveSessionAction(token)` — função pura extraída do middleware: token
  ausente → `{ action: "redirect" }`; token inválido → `{ action: "redirect" }`;
  token válido → `{ action: "allow", novoToken: <jwt renovado> }`.

**Integração** (Postgres real, banco `docobra-local-test`, `DATABASE_URL` via
`.env.test`):

- Registro cria Empresa + Usuario no banco; email duplicado retorna `409` e
  não cria segunda linha.
- Registro seguido de login com as mesmas credenciais autentica com sucesso.
- Login com senha errada falha com a mensagem genérica.

**Manual** — fluxo completo no `next dev`: cadastrar, logar, acessar
`/dashboard`, deslogar, tentar acessar `/dashboard` deslogado (deve
redirecionar pro login).

## Decisões desta spec

- Cookie httpOnly + JWT único (`jose`) com renovação deslizante no
  middleware — sem access/refresh token, escolha consciente de simplicidade
  pro estágio do MVP.
- Proteção de rota por inclusão (`/dashboard/:path*`), não por exclusão — a
  página de vendas/marketing e as páginas de auth vivem fora desse prefixo e
  nascem públicas por padrão.
- Route Handlers + React Query no client, não Server Actions — mantém um
  padrão só de mutation em todo o app (o mesmo que vai ser usado pra chamar a
  extração de LLM depois).
- `getSessionUser()` relê e reverifica o cookie em Server Components/Route
  Handlers, em vez de propagar dados via header do middleware — menos
  acoplamento.
- Vitest como test runner do projeto — nenhum havia sido escolhido até agora.
- `usuario.nome` adicionada ao schema — gap descoberto nesta spec, não
  existia no esboço original do modelo de dados.

## Empurrado pra depois

- Recuperação de senha por email.
- Convite de novo usuário pra empresa existente.
- Autorização por papel (bloquear ações específicas por `papel` — hoje só
  existe o campo, sem enforcement).
