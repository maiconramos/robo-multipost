# CLI / Skill de Agente (`@robo-multipost/agent`) — Claude Code Instructions

## Position in Hierarchy

- **Parent:** [`/CLAUDE.md`](../../CLAUDE.md)
- **Relevant siblings:**
  - [`apps/backend/CLAUDE.md`](../backend/CLAUDE.md) — a API pública (`/public/v1/*`) que este CLI consome
  - [`apps/sdk/`](../sdk/) — SDK `@postiz/node` (mesma API, uso programático)
  - [`libraries/nestjs-libraries/src/chat/CLAUDE.md`](../../libraries/nestjs-libraries/src/chat/CLAUDE.md) — MCP (caminho alternativo de agente, com flows)

## What lives here

CLI de linha de comando, **sem dependências de runtime** (usa `fetch` nativo do
Node ≥ 20), que envolve a API pública para **agentes de IA** (Hermes, OpenClaw,
Claude, etc.) controlarem uma instância **self-hosted**. Diferente do CLI oficial
do Postiz (cloud-oriented, sem automações), este é self-hosted-aware e inclui os
**flows** (automações de comentário).

| Arquivo | Conteúdo |
|---|---|
| `bin/multipost.js` | O CLI (executável, zero-dep). Cada comando → um endpoint `/public/v1/*`. Saída JSON no stdout; erro JSON no stderr + exit 1. |
| `SKILL.md` | Referência que o **agente lê** para aprender os comandos (inclui o schema dos flows e a regra `next_publication` vs `specific`). |
| `README.md` | Setup humano + uso com agentes. |
| `package.json` | `bin: multipost`, sem deps. Nome `@robo-multipost/agent` (placeholder até definir escopo npm). |

## Specific Patterns and Rules

### Config por env (nunca hardcode URL/chave)

O CLI lê `MULTIPOST_API_KEY`/`MULTIPOST_API_URL` (com fallback `POSTIZ_API_KEY`/
`POSTIZ_API_URL`). **Não** embuta URL nem chave no código — é multi-instância.

### Saída sempre JSON

Sucesso → JSON no stdout. Erro → `{"ok":false,"error":...}` no stderr + `exit 1`.
Agentes dependem disso para parsear. Não imprima texto solto no stdout.

### ⭐ Paridade CLI ⇄ API pública ⇄ SKILL.md (OBRIGATÓRIA)

Esta é a regra mais importante desta área. **Sempre que a API pública
(`/public/v1/*`) ganhar ou alterar um endpoint, parâmetro, enum ou comportamento
relevante para um agente**, atualize na MESMA mudança:

1. **`bin/multipost.js`** — adicione/ajuste o comando ou flag correspondente.
2. **`SKILL.md`** — documente para o agente (exemplos + schema). Fonte de verdade
   do pacote npm/local.
3. **`libraries/nestjs-libraries/src/agent/agent.skill.template.ts`** — o guia
   comprehensivo (MCP + CLI + REST) **servido em `GET /public/agent-skill`** com a
   URL do backend injetada. É o que o agente baixa quando o usuário passa o link da
   skill (botão "Skill para Agentes de IA" em Configurações > Integrações). Mantenha
   alinhado com o SKILL.md e a API.
4. **`README.md`** — se for relevante para o setup humano.

> Análogo à regra "Wizard ↔ Flow Builder parity" do projeto: uma feature que existe
> na API mas não no SKILL.md é invisível para o agente. Ao implementar qualquer
> opção nova na API pública, **implemente também no skill** se fizer sentido para um
> agente usá-la.

### Quando preferir MCP em vez do CLI

Se o agente fala **MCP**, o caminho do MCP (servido pelo backend, em
[`src/chat/`](../../libraries/nestjs-libraries/src/chat/CLAUDE.md)) já expõe as tools
(inclusive flows) e dispensa hospedar/instalar o skill — basta URL + chave. O CLI é
para agentes que rodam **shell + leem um SKILL.md** (Hermes/OpenClaw no modo skill).

## Common Workflows

### Adicionar um comando novo (após a API ganhar um endpoint)

1. Adicione o handler em `commands` no `bin/multipost.js` (mapeie para o endpoint).
2. Adicione à seção de comandos do `HELP` e do `SKILL.md` (com exemplo).
3. Teste: `node bin/multipost.js <comando> ...` (use `httpbin.org` como `MULTIPOST_API_URL`
   para validar o caminho HTTP sem tocar produção).

### Publicar no npm (opcional)

`bin/multipost.js` é JS puro, sem build. Para distribuir: ajuste `name` para um
escopo seu, `npm login`, `npm publish --access public`. **Um** pacote serve todas as
instâncias (cada usuário define seu `MULTIPOST_API_URL`/chave). Não é necessário para
self-hosted usar localmente (`node bin/multipost.js` ou `npm link`).

## Known Pitfalls

1. **Agente tentando descobrir IG media id por polling para usar `specific`** →
   **Causa:** caminho errado. **Fix:** use `postMode: next_publication` (auto-bind do
   próximo post); `specific`+polling só para posts pré-existentes. (Documentado no SKILL.md §4.)
2. **`posts:list` retornando 400** → **Causa:** faltou `--startDate`/`--endDate`
   (obrigatórios). **Fix:** sempre passe o intervalo ISO 8601.
3. **CLI "não funciona" no self-hosted** → **Causa:** `MULTIPOST_API_URL` não setada,
   então cairia no default cloud do ecossistema Postiz. **Fix:** exporte a URL do backend.

## Commands

```bash
node apps/cli/bin/multipost.js help
cd apps/cli && npm link && multipost is-connected
```

## References

- [`SKILL.md`](./SKILL.md) — referência do agente (fonte de verdade)
- [`apps/backend/CLAUDE.md`](../backend/CLAUDE.md) — contratos da API pública consumida
- [`libraries/nestjs-libraries/src/chat/CLAUDE.md`](../../libraries/nestjs-libraries/src/chat/CLAUDE.md) — MCP (alternativa de agente)
