# PRD — Robô MultiPost (Fork do Postiz)

## 1) Visão Geral

O **Robô MultiPost** é um scheduler de redes sociais self-hosted, baseado no projeto open-source **Postiz (AGPL-3.0)**, adaptado para a comunidade **Automação Sem Limites**.

O objetivo é oferecer uma experiência pronta para uso em **VPS + Docker/Portainer**, com foco em:
- Facilidade de instalação e onboarding
- Integração opcional com a API do **Late** como provedor alternativo de publicação
- Experiência em português BR como padrão
- Integração nativa com n8n via webhooks e API pública (público-alvo já usa n8n)
- Multi-workspace (agências e clientes) — fase avançada
- IA e Agente com memória/RAG — já há infraestrutura no código, fases de exposição e configuração

## 2) Contexto e Motivação

- Criar um produto escalável e rentável para os participantes da Comunidade Automação sem Limites
- O público-alvo já utiliza VPS (n8n + Portainer), então um stack Docker consistente tende a reduzir fricção real.
- O Postiz já possui base madura (33 redes sociais, agendamento, API pública, CLI, SDK, webhooks, Temporal para jobs) e serve como motor confiável.
- A infraestrutura de IA (Mastra framework, MCP, agentes) já está implementada no código — o trabalho é configurar e expor, não construir do zero.
- Diferenciais do Robô MultiPost: **suporte ao Late** + **exposição da IA existente com providers da comunidade** + **memória por workspace** + **onboarding em pt-BR e stack simplificada**.

## 3) Princípios de Desenvolvimento

### Document-First
Toda nova feature deve ter sua documentação escrita **antes ou em conjunto** com a implementação:
- Atualizar `docs/` ou arquivo relevante antes de abrir PR
- Descrever o comportamento esperado, fluxo de uso e impactos
- Documentar configurações, variáveis de ambiente e endpoints afetados
- PR sem documentação correspondente não deve ser mergeado

### API-First
Toda nova feature com interface de backend deve ser projetada como **contrato de API primeiro**:
- Definir os endpoints, payloads e respostas antes de implementar (OpenAPI/Swagger ou contrato explícito no PR)
- A UI consome a API — nunca o contrário
- Facilita integração com n8n, automações externas e clientes da comunidade
- Mudanças de contrato de API devem ser versionadas e documentadas

## 4) Objetivos (Outcomes)

### Objetivo principal
Entregar uma versão do Postiz adaptada para a comunidade, com:
1. Português BR como padrão (demais idiomas mantidos — 17 idiomas já existem no código)
2. Branding atualizado para Robô MultiPost
3. Integração com [Late](https://docs.getlate.dev/llms-full.txt) como provedor opcional para TikTok e Pinterest
4. Landing page e comunicação em pt-BR
5. Decisões explícitas sobre features existentes (billing, marketplace, short links, storage)

### Roadmap de fases
- **Fase 1:** Base do produto (branding + pt-BR + Late TikTok/Pinterest + decisões de produto + documentação)
- **Fase 2:** Multi-workspace para agências e múltiplos clientes
- **Fase 3:** IA — expor e configurar a infraestrutura já existente (Mastra, MCP, agentes) com providers da comunidade
- **Fase 4:** Agente de IA com memória do workspace (base de conhecimento + RAG)

## 5) Não-Objetivos (por agora)

- Não quebrar a compatibilidade e contexto geral do Postiz
- Não reescrever o core do Postiz do zero
- Não adicionar todas as redes via BYO manual se o Postiz já suporta via OAuth/provider
- Não implementar multi-workspace na Fase 1
- Não construir infraestrutura de IA do zero — ela já existe, o trabalho é expor e configurar

## 6) Público-alvo

### Primário
- Alunos da comunidade que usam VPS e Portainer (nível técnico: intermediário, não dev full-time)
- Agências que querem gerenciar múltiplos clientes/workspaces (fase avançada)

### Secundário
- Usuários avançados que querem integrar via API, n8n, scripts e automações
  - CLI (`postiz`) e SDK (`@postiz/node`) já existem e publicados no npm
  - API pública com rate limit configurável já existe

## 7) Proposta de Valor

- Scheduler multi-rede "pronto" com UI profissional (33 redes suportadas)
- Instalação guiada (stack pronta, env minimal)
- Atualizações opt-in: o aluno faz `docker pull` da nova imagem para atualizar
- Atualizações versionadas (release tags) e migrações documentadas
- Alternativa de publicação via **Late** em redes com aprovação difícil (TikTok, Pinterest), sem travar o produto em BYO complexo
- Integração nativa com n8n via webhooks e API pública — diferencial direto para o público-alvo
- Base de IA já no produto: agentes, geração de texto e imagem configuráveis por provider
- Base para evoluir com memória de workspace e agente contextual

## 8) Arquitetura e Stack (referência)

O produto é um monorepo com 5 serviços obrigatórios em produção:

| Serviço | Papel |
|---|---|
| App (backend + frontend) | API NestJS + UI Next.js |
| PostgreSQL 17 | Banco de dados principal |
| Redis 7 | Cache e filas |
| **Temporal** | Orquestrador de workflows e jobs (agendamento, retries, publicação) |
| Nginx | Reverse proxy |

> **Atenção:** O Temporal é componente crítico — todo o fluxo de agendamento e publicação passa por ele. Qualquer instância de produção precisa dele funcionando.

**Stack principal:**
- Backend: NestJS (TypeScript)
- Frontend: Next.js 14 + React 18 + Tailwind CSS 3
- ORM: Prisma + PostgreSQL
- Jobs: Temporal.io
- IA: Mastra framework + MCP (Model Context Protocol)
- Package manager: PNPM (monorepo)

## 9) Requisitos Funcionais por Fase

### Fase 0 — Ambiente de Desenvolvimento

- Rodar o projeto em localhost seguindo [docs.postiz.com/installation/development](https://docs.postiz.com/installation/development)
- Validar que os 5 serviços sobem corretamente (App, PostgreSQL, Redis, Temporal, Nginx)
- Definir e documentar formato de commit e fluxo de branches (ver seção 12)
- Adaptar workflows de CI/CD existentes (`.github/workflows/`) para build e push no GHCR do fork
- Separar imagens DEV e PRO por tag
- Configurar Dependabot para manter dependências atualizadas

---

### Fase 1 — Base do Produto (Robô MultiPost)

#### 9.1 Português BR como padrão
- O arquivo de tradução `pt` já existe no código — o trabalho é **revisar a qualidade**, não criar do zero
- Definir pt-BR como idioma padrão na UI
- Garantir que strings críticas (menus, labels, onboarding, landing) estejam corretas
- Manter todos os 17 idiomas já existentes como opção
- **Document-first:** criar `docs/i18n.md` com instruções de como adicionar/alterar traduções

#### 9.2 Branding e Identidade Visual
- Substituir marca "Postiz" por "Robô MultiPost" no app:
  - título, meta tags, textos e ícones
  - logotipo (onde aplicável)
  - e-mails/sistema (se houver)
- Incluir atribuição legal em local adequado (ex.: `NOTICE` / `CREDITS`)
- Garantir conformidade com AGPL (licença preservada, créditos mantidos)

#### 9.3 Landing page em pt-BR
- Traduzir landing page
- Adaptar mensagens para o público da comunidade (self-host, VPS, agência)
- Atualizar CTAs e seções (sem prometer infraestrutura "gratuita")

#### 9.4 Integração com Late
**Objetivo:** permitir que o usuário escolha publicar via Postiz (providers nativos) OU via Late em determinados canais.

**Redes suportadas via Late na Fase 1:** TikTok e Pinterest.

**API-first:** definir contrato dos endpoints antes de implementar:
- `POST /api/late/connect` — salvar e validar credenciais Late
- `GET /api/late/status` — verificar conexão
- `PUT /api/channel/:id/provider` — definir provider por canal (native | late)

Requisitos:
- Adicionar **Late** como um provider/canal de publicação
- Credenciais do Late armazenadas da mesma forma que o Postiz armazena credenciais de outros providers (reutilizar camada existente)
- Permitir escolher **por canal** qual provider usar, através de uma **seção dedicada nas Configurações**:
  - Ex.: Instagram via OAuth do Postiz
  - TikTok via Late
  - Pinterest via Late
- UI: configurar e testar conexão Late (validação server-side)
- Segurança: reutilizar a camada de criptografia já existente no Postiz

**Document-first:** criar `docs/late-integration.md` com:
- Como obter credenciais do Late
- Como configurar por canal
- Troubleshooting de conexão

#### 9.5 Decisões de Produto sobre Features Existentes

As features abaixo já existem no código e precisam de uma **decisão explícita** antes ou durante a Fase 1:

**Billing / Stripe**
- O Postiz tem tiers STANDARD, PRO, TEAM, ULTIMATE com Stripe
- Para a edição self-hosted da comunidade: **desabilitar billing por padrão**
- Manter o código para não quebrar o upstream-sync, mas garantir que a UI não exiba planos/preços para instalações self-hosted
- Decisão: variável de ambiente `DISABLE_BILLING=true` para ocultar toda a seção

**Post Marketplace**
- Funcionalidade de compra/venda de posts entre usuários (Orders, Payouts)
- Para a edição community: **ocultar por padrão**
- Decisão: variável de ambiente `DISABLE_MARKETPLACE=true`

**Storage de Mídia**
- Dois providers disponíveis: Local ou Cloudflare R2
- Para VPS da comunidade: **Local como padrão** (sem custo extra)
- R2 como opção avançada documentada para quem quiser escalar
- Garantir que o padrão funcione sem configurações adicionais

**Short Links**
- 4 providers integrados: Dub.co, Short.io, Kutt.it, LinkDrip
- Para self-hosted sem configuração extra: **desabilitar short links por padrão** (preferência ASK já existe)
- Documentar como ativar cada provider se desejado

**Plugs / Extensions**
- Sistema de plugins já existe na UI e no backend
- Decisão: manter visível ou ocultar? Definir nesta fase antes de documentar o produto

**Browser Extension**
- Já existe em `apps/extension/` com integração para plataformas via cookies
- Decisão: manter publicação, ocultar ou incluir como feature documentada?

#### 9.6 README e Documentação
- Atualizar `README.md` para:
  - nome Robô MultiPost
  - instruções de instalação por Docker/Portainer (incluindo os 5 serviços obrigatórios)
  - requisitos mínimos de VPS (seguir orientações do Postiz)
  - variáveis de ambiente mínimas necessárias
  - como atualizar versão (`docker pull` + migrate + restart)
  - troubleshooting básico
- Criar `docs/` ou `ONBOARDING.md` com passo-a-passo (o mais prático possível)
- Documentar integração com n8n (webhooks + API pública) — diferencial direto para o público

---

### Fase 2 — Multi-Workspace (Agências)

> Esta fase só inicia após a Fase 1 estar estável e em produção.

- Permitir criação de múltiplos workspaces por conta
- Isolamento de canais, credenciais e posts por workspace
- Gestão de membros por workspace (permissões: ADMIN, USER — roles já existem no schema)
- Credenciais do Late configuráveis por workspace
- **API-first:** contratos de endpoints de workspace definidos antes da implementação
- **Document-first:** `docs/multi-workspace.md` antes do PR

---

### Fase 3 — IA (Expor infraestrutura existente + novos providers)

> Esta fase só inicia após a Fase 2 estar estável, ou após decisão explícita de pular Fase 2.

**Contexto:** A infraestrutura de IA já está no código:
- Mastra framework integrado como motor de agentes
- MCP (Model Context Protocol) com ferramentas: geração de imagem, vídeo, agendamento por IA
- Página `/agents` na UI já existe
- `copilot.controller.ts` no backend
- Schema do banco já tem tabelas Mastra (`mastra_threads`, `mastra_messages`, `mastra_traces`, etc.)
- `Credits` já existe no schema para controle de uso

**O trabalho desta fase é configurar e expor, não construir do zero:**
- Expor configuração de AI Provider por workspace (base URL, modelo, API key)
- Suporte inicial: OpenAI-compatible (OpenRouter, Kie.ai, etc.)
- Substituir dependência de `OPENAI_API_KEY` fixo por configuração por workspace
- Recursos mínimos a garantir funcionando:
  - Gerar legendas / variações de copy
  - Gerar ideias de posts
  - Gerar imagem (Kie.ai ou provider configurado)
- Guardrails:
  - Evitar repetição
  - Respeitar tom e restrições do workspace
- Logs básicos de uso (tabelas Mastra já existem)
- Créditos internos por workspace: avaliar uso das tabelas já existentes no schema
- **API-first:** contrato do AI Provider definido antes da implementação
- **Document-first:** `docs/ai-providers.md` com como configurar cada provider

---

### Fase 4 — Agente + Memória do Workspace (RAG)

> Esta fase só inicia após a Fase 3 estar estável.

- Criar um "Workspace Knowledge Base":
  - público-alvo, tom, produtos, ofertas, restrições, exemplos
- Permitir anexos e notas
- Implementar busca/recuperação (RAG) para:
  - gerar copy alinhada sem repetir briefing
  - sugerir calendário editorial baseado na base
- Estratégia técnica: Postgres + pgvector (padrão confirmado)
- Aproveitar a infraestrutura Mastra já existente para integração com o agente
- UI:
  - página "Memória do Workspace"
  - controle de privacidade por workspace
- **API-first:** contratos de endpoints de knowledge base definidos antes da implementação
- **Document-first:** `docs/workspace-memory.md` antes do PR

## 10) Requisitos Não-Funcionais

- Self-host fácil — mínimo de variáveis de ambiente obrigatórias
- Atualização opt-in por versão (aluno faz `docker pull` para atualizar — sem breaking changes automáticos)
- Observabilidade mínima:
  - logs de job/publicação (Temporal já provê)
  - status por post
- Segurança:
  - segredos fora do Git
  - criptografia de credenciais sensíveis em repouso (reutilizar camada do Postiz)
- Performance mínima:
  - deve rodar em VPS pequena (seguir requisitos mínimos do Postiz)
- Todo PR de feature deve conter:
  - documentação atualizada
  - contrato de API (se aplicável)
  - testes ou plano de teste manual

## 11) Requisitos de Infra e Distribuição

- Deploy padrão: Docker Compose (5 serviços: App, PostgreSQL, Redis, Temporal, Nginx)
- Imagem publicada: GHCR (GitHub Container Registry)
- Versionamento semântico: `v1.0.0`, `v1.0.1`, etc.
- Tag `latest` opcional
- Migrações:
  - rodar via container/CI ou comando documentado
  - nunca depender do runtime "edge" para migrar
- Sempre automatizar o que for possível via CI/CD
- Adaptar workflows existentes em `.github/workflows/` para o fork (não criar do zero)

## 12) Fluxo de Branches e Releases (GitLab Flow)

A estratégia adotada é baseada no **GitLab Flow**, modelo recomendado para projetos com Docker e CI/CD — o código é promovido por camadas até chegar à produção.

### Estrutura de branches

| Branch | Papel | Regra |
|---|---|---|
| `postiz` | Espelho limpo do repositório oficial | **Nunca commitar customizações aqui** |
| `main` | Desenvolvimento e customizações | Todo código próprio vive aqui |
| `release` | Versão estável para produção | Só recebe merge de `main` quando testado e aprovado |

### Remotes

| Remote | URL |
|---|---|
| `origin` | `https://github.com/maiconramos/robo-multipost` |
| `upstream` | `https://github.com/gitroomhq/postiz-app` |

### Fluxo completo

```
upstream (postiz oficial)
        │
        ▼
  branch: postiz      ← espelho limpo, nunca customizar
        │
        │ merge quando sair update
        ▼
  branch: main        ← desenvolvimento e customizações
        │
        │ merge quando versão estiver estável
        ▼
  branch: release     ← versão aprovada para produção
        │
        ▼
  tag: v1.2.0         ← gerada a cada release
        │
        ▼
  imagem Docker       ← build sempre a partir de release + tag
```

### Fluxo de sincronização com updates do Postiz

```bash
git checkout postiz
git fetch upstream
git merge upstream/main

git checkout main
git merge postiz
# resolver conflitos, testar e commitar
```

### Fluxo de desenvolvimento de customizações

```bash
git checkout main
git checkout -b custom/nome-da-feature
# desenvolver...
git checkout main
git merge custom/nome-da-feature
git branch -d custom/nome-da-feature
```

> Features pequenas podem ser desenvolvidas diretamente na `main`.

### Fluxo de release (main → release + tag + Docker)

```bash
git checkout release
git merge main
git tag -a v1.2.0 -m "Release v1.2.0 — descrição"
git push origin release
git push origin v1.2.0
```

### Fluxo de hotfix (bug crítico em produção)

```bash
git checkout release
git checkout -b hotfix/descricao-do-bug
# corrigir...
git checkout release
git merge hotfix/descricao-do-bug
git tag -a v1.2.1 -m "Hotfix v1.2.1"
git checkout main
git merge hotfix/descricao-do-bug
git branch -d hotfix/descricao-do-bug
git push origin release main
git push origin v1.2.1
```

### Convenção de versionamento semântico (SemVer)

| Tipo de mudança | O que incrementar | Exemplo |
|---|---|---|
| Update do Postiz oficial | `MINOR` | `v1.1.0` → `v1.2.0` |
| Nova feature customizada | `MINOR` | `v1.2.0` → `v1.3.0` |
| Correção de bug | `PATCH` | `v1.2.0` → `v1.2.1` |
| Mudança grande / breaking | `MAJOR` | `v1.2.0` → `v2.0.0` |

## 13) Critérios de Aceite por Fase

### Fase 0
- Projeto roda em localhost com todos os 5 serviços funcionando
- CI/CD adaptado para o fork com build e push no GHCR
- Formato de commit e fluxo de branches documentados

### Fase 1 (MVP)
- App abre com pt-BR por padrão, demais idiomas disponíveis
- Branding é Robô MultiPost (sem referências visuais principais a Postiz)
- Landing page em pt-BR
- README atualizado com instalação/upgrade e os 5 serviços obrigatórios
- Late provider configurável e funcional para TikTok e Pinterest
- Seção dedicada nas Configurações para escolha de provider por canal (nativo vs Late)
- Decisões de produto tomadas e implementadas: billing, marketplace, storage, short links
- `docs/late-integration.md` criado e revisado
- Integração com n8n documentada (webhooks + API pública)

### Fase 2 (Multi-Workspace)
- Criação e isolamento de múltiplos workspaces
- Credenciais e canais isolados por workspace
- `docs/multi-workspace.md` criado e revisado

### Fase 3 (IA)
- AI Provider configurável por workspace com pelo menos 1 provider (OpenRouter)
- Geração de texto e imagem funcionando
- Logs de uso disponíveis
- `docs/ai-providers.md` criado e revisado

### Fase 4 (RAG)
- Página de base de conhecimento por workspace
- Geração de copy usando contexto do workspace
- Evitar pedir briefing repetido
- `docs/workspace-memory.md` criado e revisado

## 14) Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Violação de AGPL | Preservar licença, manter NOTICE/CREDITS, não remover atribuições |
| Atualizações upstream (Postiz) | Fluxo de `upstream-sync` com resolução de conflitos antes de `main` |
| Temporal não configurado na VPS | Documentar claramente os 5 serviços obrigatórios; stack pronta no docker-compose |
| Billing/Marketplace visível no self-hosted | Variáveis de ambiente para desabilitar; decisão tomada na Fase 1 |
| Complexidade de credenciais por workspace | Implementar incrementalmente, Fase 2 separada |
| Integração Late divergir de providers nativos | Tratar como provider adicional, não substituição — contratos de API isolados |
| Feature sem documentação | Regra de PR: document-first obrigatório antes de merge |
| Contrato de API quebrado | Regra de PR: api-first obrigatório — mudanças de contrato versionadas |
| Infraestrutura de IA existente acoplada ao OpenAI | Fase 3 substitui dependência fixa por configuração por workspace |
