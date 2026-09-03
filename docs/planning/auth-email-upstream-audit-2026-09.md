# Auditoria e porte cirúrgico de autenticação por e-mail — setembro de 2026

> Branch: `codex/upstream-auth-email`  
> Base esperada: `main` após a PR de auditoria YouTube/TikTok  
> Origem upstream: `dbb48601` e dependência `dcb1b018`  
> Estado: implementado com testes automatizados; auditoria de dados pendente

## Problema

`UsersRepository.getUserByEmail` fazia comparação exata. Uma conta local antiga
salva como `Nome@Exemplo.com` deixava de ser encontrada quando a pessoa digitava
`nome@exemplo.com` em qualquer fluxo que reutiliza esse método:

- login local;
- esqueci minha senha;
- reenvio de ativação;
- ativação da conta;
- verificação de e-mail já cadastrado.

A busca administrativa de impersonação também diferenciava caixa em nome e
e-mail.

O upstream corrige as consultas em `dbb48601`, mas pressupõe que novos
cadastros locais já são convertidos para minúsculas por `dcb1b018`. Essa
normalização ainda não existia no fork e foi incluída no mesmo porte para não
continuar criando dados legados.

## Solução adotada

- `getUserByEmail` mantém `Provider.LOCAL` e usa
  `equals + mode: 'insensitive'` no campo de e-mail;
- novos `CreateOrgUserDto` do provider local são convertidos para minúsculas
  antes da busca de duplicidade, validação do convite e persistência;
- a busca de impersonação usa `mode: 'insensitive'` somente nos campos humanos
  `name` e `email`; IDs continuam com sua comparação atual.

Não há mudança de schema, migração de registros ou alteração de senha.

## Segurança e compatibilidade

- **Convites:** `inviteAllowsRegistration` e `resolveInviteJoin` continuam
  exigindo a igualdade entre o e-mail convidado e o confirmado do registrante,
  ambos com `trim().toLowerCase()`. A correção não transforma o token de convite
  em credencial portadora para outro e-mail.
- **OAuth:** Google/GitHub e demais providers continuam resolvidos por
  `providerId` e pela identidade devolvida pelo provider. Nenhuma normalização
  passa a confiar em e-mail informado pelo cliente nesses fluxos.
- **Escopo:** a consulta case-insensitive continua restrita a
  `Provider.LOCAL`; uma conta OAuth com o mesmo texto de e-mail não é usada no
  login por senha.
- **Novos registros:** a normalização ocorre antes da detecção de duplicidade,
  fechando o caminho comum para criar duas contas locais que diferem apenas por
  caixa.

## Risco legado antes do deploy

O índice existente é `@@unique([email, providerName])`, que no PostgreSQL é
case-sensitive para `String`. Portanto, versões antigas podem ter permitido
duas contas locais como `Pessoa@Exemplo.com` e `pessoa@exemplo.com`.

Antes da promoção, executar uma auditoria somente leitura e resolver qualquer
grupo retornado de forma manual, preservando a conta correta:

```sql
SELECT lower(email) AS normalized_email,
       "providerName",
       count(*) AS total,
       array_agg(id ORDER BY "createdAt") AS user_ids
FROM "User"
GROUP BY lower(email), "providerName"
HAVING count(*) > 1;
```

Não deve haver exclusão ou fusão automática: as contas podem pertencer a
organizações e perfis diferentes.

## Cobertura e gate

Os testes direcionados comprovam:

- consulta local com `mode: 'insensitive'` e include da foto preservado;
- filtros case-insensitive de nome/e-mail na impersonação;
- novo cadastro local normalizado antes da busca e da criação;
- email-lock de convite aceitando diferença de caixa, mas bloqueando e-mail
  diferente e replay do convite.

Além da suíte/build, o smoke test deve validar login, esqueci minha senha e
reenvio de ativação usando capitalização diferente da conta armazenada.
