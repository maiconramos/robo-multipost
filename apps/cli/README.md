# @robo-multipost/agent

CLI/skill do **Robô MultiPost** para agentes de IA. Wrapper fino e sem dependências
sobre a API pública (`/public/v1/*`) de uma instância **self-hosted**. Diferente do
CLI oficial do Postiz, inclui as **automações de comentário (flows)**.

## Configuração

```bash
export MULTIPOST_API_KEY="sua-chave-de-api"     # org ou perfil (Settings > Integrações)
export MULTIPOST_API_URL="https://seu-backend"  # ex.: https://localmultipostapi.seu-dominio.com.br
```

(Também aceita `POSTIZ_API_KEY` / `POSTIZ_API_URL`, para compatibilidade com o skill upstream.)

## Como rodar

**Sem instalar (a partir deste repositório):**
```bash
node apps/cli/bin/multipost.js help
node apps/cli/bin/multipost.js is-connected
```

**Como comando global `multipost` (link local):**
```bash
cd apps/cli && npm link        # cria o binário `multipost` no PATH
multipost integrations:list
```

**Publicado no npm (opcional, futuro):** após publicar este pacote sob o seu escopo,
qualquer máquina faz `npm install -g @robo-multipost/agent` e usa `multipost ...`.

## Exemplos

```bash
multipost profiles:list
multipost integrations:list
multipost posts:create --content "<p>Olá!</p>" --integrationId <ID> --type now
multipost flows:create --json '{"name":"Receita","integrationId":"<ID>","keywords":["EU QUERO"],"dmButtonText":"Quero o link","dmButtonUrl":"https://exemplo.com"}'
```

Veja `multipost help` para todos os comandos e `SKILL.md` para a referência completa.

## Uso com agentes de IA (Hermes, OpenClaw, Claude, etc.)

Funciona com **qualquer agente que execute comandos de shell**. O agente lê o
`SKILL.md` para aprender os comandos e os executa, parseando o JSON de saída.

Padrão geral:
1. Garanta que `MULTIPOST_API_KEY` e `MULTIPOST_API_URL` estão no ambiente do agente.
2. Garanta que o binário `multipost` está acessível (via `npm link`, caminho absoluto,
   ou instalado).
3. Forneça o `SKILL.md` ao agente (na pasta de skills dele, ou como contexto).
4. Peça a tarefa em linguagem natural (ex.: "agende um post no Instagram para amanhã às 14h").

> A saída é sempre JSON, pensada para o agente extrair `id`, `path`, etc.

## Notas

- O `content` dos posts é HTML (`p`, `br`, `strong`, `u`, `a`, `ul`, `li`, `h1`-`h3`).
- A `dmButtonUrl` dos flows precisa ser `https` pública.
- Para o schema completo do corpo de posts/flows, use o Swagger em `<API_URL>/docs`.
- O nome do pacote (`@robo-multipost/agent`) é um placeholder — ajuste para o seu
  escopo npm antes de publicar.
