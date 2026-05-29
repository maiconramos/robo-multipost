# Dívida técnica — Tipar o retorno de `@GetOrgFromRequest()`

> **Status:** pendente (não-bloqueante). Criado em 2026-05-29 durante a feature de chaves de API por perfil.

## Contexto

O decorator `@GetOrgFromRequest()` (em `libraries/nestjs-libraries/src/user/org.from.request.ts`) retorna `request.org`, que é tipado como `Organization` puro do Prisma. Porém, o `PublicAuthMiddleware` e o guard de autenticação privada enriquecem esse objeto em runtime com campos que **não** existem no tipo `Organization`:

- `organization.users[0].role` — papel do usuário na org (`SUPERADMIN` / `ADMIN` / etc.)
- `organization.subscription` — assinatura (`totalChannels`, `subscriptionTier`, `isLifetime`)

Como o tipo não reflete o runtime, todo acesso a esses campos exige `// @ts-ignore`.

## Sintoma que motivou o registro

Em `apps/backend/src/api/routes/users.controller.ts` (`getSelf`), a linha `profileApiKey` foi adicionada acessando `organization?.users[0]?.role` **sem** o `// @ts-ignore` que as linhas vizinhas (`role`, `publicApi`) já tinham. Resultado: `nest build` / `nest start --watch` falhou com `TS2339: Property 'users' does not exist...`, o backend nunca subiu na porta 3000, o nginx respondeu 502 e o login quebrou com um genérico `TypeError: Failed to fetch`.

Diagnóstico levou tempo porque o erro de compilação se disfarçou de bug de rede no frontend.

## Escopo do refactor proposto

Criar um tipo enriquecido (ex.: `AuthenticatedOrganization`) que estende `Organization` com:

```ts
type AuthenticatedOrganization = Organization & {
  users: { role: 'USER' | 'ADMIN' | 'SUPERADMIN' }[];
  subscription?: {
    totalChannels: number;
    subscriptionTier: string;
    isLifetime: boolean;
  } | null;
};
```

Tipar `@GetOrgFromRequest()` para retornar esse tipo e remover os `// @ts-ignore` espalhados.

## Inventário (no momento do registro)

- **9 ocorrências** de `users[0]` no backend (`grep -rn "users\[0\]" apps/backend/src --include="*.ts" | grep -v .spec.ts`).
- Controllers que consomem `@GetOrgFromRequest()` incluem: `users.controller.ts`, `public.integrations.controller.ts`, `public.profiles.controller.ts`, `ai-credentials.controller.ts`, `credentials.controller.ts`, `media.controller.ts`, `sets.controller.ts`, `autopost.controller.ts`, entre outros.
- O middleware que injeta os campos em runtime: `apps/backend/src/services/auth/public.auth.middleware.ts` (`req.org = { ...org, users: [{ users: { role: 'SUPERADMIN' } }] }`) e o guard privado equivalente.

## Cuidados

- Verificar a forma EXATA do `users[0]` em cada caminho (o middleware público usa `users: [{ users: { role } }]` aninhado; conferir se o guard privado usa a mesma forma antes de unificar o tipo).
- Mudança puramente de tipagem — não deve alterar comportamento de runtime.
- **Validar com `pnpm build:backend` (não só `pnpm test:libs`)** — ts-jest transpila arquivo-a-arquivo e não pega esse tipo de erro de programa inteiro.

## Definição de pronto

- Zero `// @ts-ignore` relacionados a `organization.users`/`organization.subscription` no backend.
- `pnpm build:backend` com exit 0.
- `pnpm test:libs` e `pnpm test:backend` verdes.
