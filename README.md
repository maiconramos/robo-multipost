<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/765e9d72-3ee7-4a56-9d59-a2c9befe2311">
    <img alt="Robô MultiPost Logo" src="https://github.com/user-attachments/assets/f0d30d70-dddb-4142-8876-e9aa6ed1cb99" width="280"/>
  </picture>
</p>

<h2 align="center">Robô MultiPost</h2>
<p align="center">Agendador de redes sociais self-hosted para a comunidade Automação Sem Limites</p>

<p align="center">
  <a href="https://opensource.org/license/agpl-v3">
    <img src="https://img.shields.io/badge/License-AGPL%203.0-blue.svg" alt="License">
  </a>
  <a href="https://github.com/gitroomhq/postiz-app">
    <img src="https://img.shields.io/badge/Fork%20do-Postiz-orange.svg" alt="Fork do Postiz">
  </a>
</p>

<div align="center">
  <img alt="Instagram" src="https://postiz.com/svgs/socials/Instagram.svg" width="32">
  <img alt="Youtube" src="https://postiz.com/svgs/socials/Youtube.svg" width="32">
  <img alt="Dribbble" src="https://postiz.com/svgs/socials/Dribbble.svg" width="32">
  <img alt="Linkedin" src="https://postiz.com/svgs/socials/Linkedin.svg" width="32">
  <img alt="Reddit" src="https://postiz.com/svgs/socials/Reddit.svg" width="32">
  <img alt="TikTok" src="https://postiz.com/svgs/socials/TikTok.svg" width="32">
  <img alt="Facebook" src="https://postiz.com/svgs/socials/Facebook.svg" width="32">
  <img alt="Pinterest" src="https://postiz.com/svgs/socials/Pinterest.svg" width="32">
  <img alt="Threads" src="https://postiz.com/svgs/socials/Threads.svg" width="32">
  <img alt="X" src="https://postiz.com/svgs/socials/X.svg" width="32">
  <img alt="Slack" src="https://postiz.com/svgs/socials/Slack.svg" width="32">
  <img alt="Discord" src="https://postiz.com/svgs/socials/Discord.svg" width="32">
  <img alt="Mastodon" src="https://postiz.com/svgs/socials/Mastodon.svg" width="32">
  <img alt="Bluesky" src="https://postiz.com/svgs/socials/Bluesky.svg" width="32">
</div>

---

## O que é

O Robô MultiPost é um agendador de redes sociais self-hosted com suporte a **33+ canais**. Baseado no [Postiz](https://github.com/gitroomhq/postiz-app) (open-source, AGPL-3.0), foi adaptado para rodar em VPS com Docker, focado no público brasileiro da comunidade Automação Sem Limites.

Principais recursos:
- Agendamento de posts via calendário para múltiplas redes
- Analytics integrado por canal
- Biblioteca de mídia centralizada
- Colaboração em equipe
- Integração com IA para geração de conteúdo
- API pública e webhooks — compatível com n8n

## Redes suportadas

Instagram, Facebook, X (Twitter), LinkedIn, TikTok, YouTube, Pinterest, Threads, Reddit, Discord, Slack, Mastodon, Bluesky, Dribbble e mais.

## Pré-requisitos

| Requisito | Mínimo | Recomendado |
|---|---|---|
| RAM da VPS | 2 GB | 4 GB |
| Docker + Docker Compose | v2+ | Última versão estável |
| Domínio apontando para a VPS | Opcional | Recomendado (para HTTPS) |

## Instalação rápida (Docker Compose)

O Robô MultiPost precisa de **5 serviços** rodando simultaneamente:

1. **App** — backend (NestJS) + frontend (Next.js) em um único container
2. **PostgreSQL 17** — banco de dados principal
3. **Redis 7** — cache e filas
4. **Temporal** — orquestrador de workflows (crítico para o agendamento funcionar)
5. **Nginx** — reverse proxy (embutido no container da app)

### Passo a passo

```bash
# 1. Baixar o arquivo de configuração
curl -o docker-compose.yml https://raw.githubusercontent.com/maiconramos/robo-multipost/main/docker-compose.yaml

# 2. Baixar o arquivo de variáveis de ambiente
curl -o .env.example https://raw.githubusercontent.com/maiconramos/robo-multipost/main/.env.example

# 3. Criar seu arquivo de variáveis de ambiente
cp .env.example .env

# 4. Editar o .env com suas configurações (ver tabela abaixo)
nano .env

# 5. Subir todos os serviços
docker compose up -d
```

> **Nota:** O Temporal leva alguns segundos a mais para iniciar completamente. Se a app apresentar erros de conexão nos primeiros segundos, aguarde e ela se reconectará automaticamente.

## Variáveis de ambiente obrigatórias

Edite o arquivo `.env` (ou as variáveis no `docker-compose.yml`) com pelo menos as seguintes configurações:

| Variável | Descrição | Exemplo |
|---|---|---|
| `MAIN_URL` | URL pública da aplicação | `https://seu-dominio.com` |
| `FRONTEND_URL` | URL do frontend | `https://seu-dominio.com` |
| `NEXT_PUBLIC_BACKEND_URL` | URL pública da API | `https://seu-dominio.com/api` |
| `DATABASE_URL` | Conexão PostgreSQL | `postgresql://postiz-user:postiz-password@postiz-postgres:5432/postiz-db-local` |
| `REDIS_URL` | Conexão Redis | `redis://postiz-redis:6379` |
| `JWT_SECRET` | Chave JWT (string longa aleatória) | Use `openssl rand -base64 32` |
| `IS_GENERAL` | Modo self-hosted | `true` |
| `STORAGE_PROVIDER` | Provider de storage | `local` |

> **Dica:** Consulte o arquivo `.env.example` para ver a lista completa de variáveis disponíveis, incluindo configurações de redes sociais, IA e integrações.

## Como atualizar

```bash
# Atualizar para a versão mais recente
docker compose pull
docker compose up -d
```

Para atualizar para uma versão específica, edite o `docker-compose.yml` e altere a tag da imagem antes de rodar os comandos acima.

## Integração com n8n

O Robô MultiPost possui API pública disponível em `/api/`. Você pode usar essa API para integrar com o n8n e automatizar seus fluxos de publicação.

- Suporte a webhooks para eventos de publicação
- Compatível com o node do n8n para Postiz (`n8n-nodes-postiz`)
- O limite padrão da API é de 30 requisições por hora (configurável via variável `API_LIMIT`)

## Tech Stack

- **Monorepo:** pnpm workspaces
- **Frontend:** Next.js 14 + React 18 + Tailwind CSS
- **Backend:** NestJS (TypeScript)
- **Banco de dados:** PostgreSQL 17 (via Prisma ORM)
- **Cache/Filas:** Redis 7
- **Orquestração:** Temporal.io
- **IA:** Mastra framework + MCP

## Desenvolvimento local

Para instruções detalhadas de setup local (desenvolvimento e produção), consulte o arquivo [validacao-dev.md](validacao-dev.md) na raiz do repositório.

## Créditos

Este projeto é um fork do [Postiz](https://github.com/gitroomhq/postiz-app), desenvolvido pela equipe do GitRoom HQ, licenciado sob AGPL-3.0.

O código original foi modificado para atender as necessidades da comunidade Automação Sem Limites. Todas as modificações também são licenciadas sob AGPL-3.0.

## Licença

[AGPL-3.0](LICENSE)
