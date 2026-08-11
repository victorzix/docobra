# Shell Mínimo do Dashboard — Design Spec

## Problema

Hoje `/dashboard` (`src/app/dashboard/page.tsx`) é um placeholder de uma
linha, sem sidebar, sem nav, sem logout funcional na UI (o hook
`useLogout` existe em `src/hooks/use-logout.ts` mas não é usado em nenhum
lugar). Os dois módulos do produto (Gerador de Memorial Descritivo,
Tradutor de Exigências da Prefeitura) vão compartilhar este mesmo
dashboard — sem esse shell primeiro, o primeiro módulo que for construído
teria que inventar a navegação/layout sozinho, e o segundo módulo teria
que se encaixar numa estrutura pensada só pro primeiro.

## Escopo

Dentro:
- Layout compartilhado (`src/app/dashboard/layout.tsx`) pra todas as rotas
  `/dashboard/:path*` — sidebar com nav, header/user-menu.
- Sidebar oficial do shadcn (`Sidebar` + `SidebarProvider`/`useSidebar`),
  com seu próprio estado interno (não Zustand — decisão desta spec,
  exceção pontual à regra geral do `CLAUDE.md` porque o componente já
  resolve mobile/persistência sozinho).
- Nav com 2 itens: Memorial Descritivo (`/dashboard/memorial`) e
  Comunique-se (`/dashboard/comunique-se`), cada um levando a uma página
  placeholder "Em breve".
- `/dashboard` (raiz) como home: boas-vindas + 2 cards linkando pros
  mesmos 2 módulos.
- Exibição de nome da empresa + nome do usuário logado no shell.
- Botão de logout funcional usando o `useLogout` já existente, redirecionando
  pra `/login` no sucesso.

Fora de escopo (empurrado pra depois):
- Landing/marketing page (`src/app/page.tsx`) — projeto separado, maior,
  com copy de vendas e Anime.js pra 3D, não se mistura com este shell.
- Conteúdo real dos dois módulos — só as páginas placeholder e a nav.
- Qualquer paginação/filtro/busca dentro do dashboard.
- Papéis/permissões diferenciadas na UI (o TODO de `papel` no
  `CLAUDE.md` continua aberto — o shell não faz nenhuma checagem de
  permissão além da autenticação que o middleware já garante).

## Estado atual relevante

- `getSessionUser()` (`src/lib/auth/session.ts`) retorna
  `{ userId, empresaId, papel } | null` a partir do JWT — sem nomes.
- `useLogout()` (`src/hooks/use-logout.ts`) faz `POST /api/auth/logout` e
  não redireciona sozinho — quem chama decide o que fazer no sucesso.
- Middleware já protege `/dashboard/:path*` inteiro — nenhuma rota nova
  criada por esta spec precisa de proteção adicional.
- Nenhum componente de sidebar do shadcn está instalado ainda (só
  button/input/textarea/label/card/dialog/checkbox/form/select).

## Comportamento observável

### Dados exibidos no shell

`src/app/dashboard/layout.tsx` (Server Component, `async`):
1. Chama `getSessionUser()`. Se `null`, o middleware já teria redirecionado
   antes de chegar aqui — mas por defesa em profundidade, se ocorrer,
   renderiza sem nomes (não deve ser alcançável na prática).
2. Com `userId`, busca `{ usuarioNome, empresaNome }` via uma query Drizzle
   que faz join `usuario` → `empresa`:

```ts
const resultado = await db
  .select({ usuarioNome: usuario.nome, empresaNome: empresa.nome })
  .from(usuario)
  .innerJoin(empresa, eq(usuario.empresaId, empresa.id))
  .where(eq(usuario.id, sessao.userId))
  .limit(1);
```

3. Passa os 2 nomes como props pro shell client-side (`user-menu.tsx`).

Nenhum cache (React Query) aqui — é Server Component, roda a cada
navegação de página, igual ao resto do app hoje.

### Navegação

- `src/components/dashboard/sidebar.tsx` (client component): 2 itens de
  nav fixos, ícones `lucide-react` (`FileText` pro Memorial, `ClipboardList`
  pro Comunique-se — nomes de exemplo, ajustáveis no plano), usa
  `usePathname()` do `next/navigation` pra marcar o item ativo.
- `/dashboard` (home): boas-vindas ("Olá, {usuarioNome}") + 2 `Card`
  (shadcn) linkando pros mesmos 2 módulos.
- `/dashboard/memorial` e `/dashboard/comunique-se`: cada um só renderiza
  um `Card` centralizado com texto "Em breve".

### Logout

`user-menu.tsx` (client component): botão "Sair" chama
`useLogout().mutate()`; no `onSuccess`, `router.push("/login")` (sem
`from=` — logout é uma ação deliberada do usuário, não uma sessão
expirada). Enquanto a mutation está `isPending`, o botão fica desabilitado
com texto "Saindo...".

## Modos de falha

| Cenário | Comportamento |
|---|---|
| Query de nomes falha (erro de banco) | Layout deixa o erro propagar — Next.js renderiza a `error.tsx` mais próxima (nenhuma customizada ainda, cai no fallback padrão). Não é tratado nesta spec: dashboard sem banco disponível não tem experiência degradada definida ainda. |
| `getSessionUser()` retorna `null` dentro do layout (não deveria, middleware já protege) | Shell renderiza com nomes vazios/genéricos, sem crashar — defesa em profundidade, não caminho principal. |
| Logout falha (rede/erro do servidor) | `useLogout`'s `isError` fica `true`; `user-menu.tsx` mostra a mensagem de erro do hook ("Não foi possível encerrar a sessão.") inline, sem redirecionar. |

## Como se prova que funciona

- Teste de integração da query de nomes (`src/db/queries/__tests__/usuario.test.ts`
  ou local equivalente definido no plano): dado um `usuario`+`empresa`
  reais no banco de teste, retorna os nomes certos; usuário inexistente
  retorna vazio (sem lançar).
- Teste unitário do componente de nav: dado um `pathname` mockado, o item
  correspondente recebe a classe/estado "ativo"; os outros não.
- Verificação manual (Task final do plano, mesmo padrão da feature de
  auth): logar, ver nome da empresa/usuário no shell, navegar pros 2
  placeholders, clicar logout, confirmar redirecionamento pra `/login` e
  que `/dashboard` volta a exigir login.
- Sem teste de UI para o `Sidebar` do shadcn em si (comportamento
  mobile/collapse é código de terceiro já testado por eles).

## Decisões

- **Sidebar oficial do shadcn com seu próprio estado, não Zustand** —
  decisão explícita do usuário nesta spec. Reimplementar
  colapso/drawer/persistência que o componente já resolve não vale o
  esforço num MVP com prazo curto. Exceção pontual, não uma reversão da
  regra geral do `CLAUDE.md` (que continua valendo pra qualquer outro
  estado de UI client-side do app).
- **Nomes vêm de uma query no banco no layout, não do JWT** — o payload
  do token só tem `userId`/`empresaId`/`papel`; inflar o token com nomes
  faria eles ficarem desatualizados até o próximo login se a empresa ou
  usuário for renomeado. Uma query simples por navegação é barata e
  sempre correta.
- **`/dashboard` raiz é uma home com 2 cards, não um redirect pro primeiro
  módulo** — qual módulo é construído primeiro é decisão de outra
  conversa; a home não assume nada sobre isso.
- **Logout redireciona sem `from=`** — diferente do redirect do
  middleware por sessão expirada (que usa `from=` pra voltar pra onde o
  usuário estava), logout é intencional, então volta sempre pro `/login`
  limpo.

## Empurrado pra depois

- Conteúdo real dos dois módulos (Memorial Descritivo, Comunique-se).
- Landing/marketing page.
- Diferenciação de UI por `papel` (admin vs usuário comum).
- Estado de erro customizado (`error.tsx`) pro dashboard.
- Qualquer indicador de "empresa" quando o modelo de dados suportar mais
  de uma empresa por usuário (não é o caso hoje).
