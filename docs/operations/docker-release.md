# Robo MultiPost - Guia de Docker, Release e Deploy

## Indice

1. [Arquitetura da imagem](#arquitetura-da-imagem)
2. [Convencao de versoes](#convencao-de-versoes)
3. [Release automatizado (recomendado)](#release-automatizado-recomendado)
4. [Build local da imagem](#build-local-da-imagem)
5. [Publicar manualmente no GHCR](#publicar-manualmente-no-ghcr)
6. [Deploy na VPS](#deploy-na-vps)
7. [Docker Compose de producao](#docker-compose-de-producao)
8. [Resumo do fluxo](#resumo-do-fluxo)

---

## Arquitetura da imagem

O projeto usa um unico Dockerfile (`Dockerfile.dev`) que faz tudo:

1. Base: `node:22.20-bookworm-slim`
2. Instala dependencias do sistema (g++, make, python3, nginx)
3. Instala `pnpm@10.6.1` e `pm2` globalmente
4. Copia o codigo fonte
5. Roda `pnpm install`
6. Roda `pnpm run build` (frontend + backend + orchestrator)
7. Inicia com Nginx (proxy reverso na porta 5000) + PM2 (gerencia processos Node)

```
Porta 5000 (Nginx)
  |
  |-- /        -> Frontend (porta 4200 interna)
  |-- /api/    -> Backend  (porta 3000 interna)
  |-- /uploads/ -> Arquivos locais
```

---

## Convencao de versoes

O projeto segue SemVer com uma convencao clara para tags e imagens:

| Onde | Formato | Exemplo |
|------|---------|---------|
| Git tag (estavel) | Com prefixo `v` | `v0.2.0` |
| Git tag (RC) | Com prefixo `v` + sufixo | `v0.3.0-rc.1` |
| package.json | Sem prefixo | `0.2.0` ou `0.3.0-rc.1` |
| version.txt | Sem prefixo | `0.2.0` ou `0.3.0-rc.1` |
| Imagem Docker (estavel) | Sem prefixo + `:latest` | `ghcr.io/maiconramos/robo-multipost:0.2.0` |
| Imagem Docker (RC) | Sem prefixo + `:prerelease` | `ghcr.io/maiconramos/robo-multipost:0.3.0-rc.1` |

O workflow de CI/CD strip o `v` automaticamente: tag `v0.2.0` gera imagem `:0.2.0`.
Pre-releases (versoes com `-` como `rc.1`, `beta.1`) **nao atualizam `:latest`**, mas sempre atualizam `:prerelease`.

### Tags flutuantes

| Tag | Aponta para |
|-----|-------------|
| `:latest` | Ultima release estavel |
| `:prerelease` | Ultima pre-release (RC) publicada |

Para usar sempre a versao mais recente de cada canal no Docker Compose:

```yaml
# Canal estavel
image: ghcr.io/maiconramos/robo-multipost:latest

# Canal pre-release (RC)
image: ghcr.io/maiconramos/robo-multipost:prerelease
```

### Regras de incremento

| Tipo de mudanca | Incrementa | Exemplo |
|-----------------|------------|---------|
| Update do upstream Postiz | MINOR | 0.2.0 -> 0.3.0 |
| Nova feature customizada | MINOR | 0.2.0 -> 0.3.0 |
| Correcao de bug | PATCH | 0.2.0 -> 0.2.1 |
| Breaking change | MAJOR | 0.2.0 -> 1.0.0 |

---

## Fluxo rapido: feature nova ate producao

```
1. Desenvolve a feature em main
2. /new-release rc            → builda imagem RC (sem afetar :latest)
3. Testa na VPS com a RC
4. Encontrou bug? Corrige e roda /new-release rc de novo (rc.2, rc.3...)
5. Tudo OK? /new-release promote  → re-taga RC como :latest (sem rebuild)
```

Quer pular o RC e ir direto para producao? Use `/new-release minor` ou `/new-release patch`.

---

## Release automatizado (recomendado)

A forma recomendada de criar releases e usando o skill do Claude Code:

```
/new-release minor        # Release estavel (merge em release + :latest)
/new-release patch        # Release estavel (correcao)
/new-release 0.3.0        # Versao explicita estavel
/new-release rc           # Pre-release RC (tag em main, sem :latest)
/new-release promote      # Promover ultimo RC para estavel
```

### Release estavel (major/minor/patch)

O skill `/new-release` guia todo o processo:

1. Valida que `main` esta limpo e sincronizado
2. Calcula a proxima versao (ou usa a que voce passou)
3. Atualiza `CHANGELOG.md`, `package.json` e `version.txt`
4. Commit de release em `main`
5. Push de `main`
6. Merge `main` em `release`
7. Cria tag anotada `vX.Y.Z`
8. Push de `release` + tag (dispara CI/CD automaticamente)
9. Opcionalmente cria GitHub Release

### Pre-release RC

Para testar uma versao antes de promover para `:latest`:

1. `/new-release rc` — cria `vX.Y.Z-rc.1` direto em `main` (sem branch `release`)
2. CI/CD builda imagem `ghcr.io/maiconramos/robo-multipost:X.Y.Z-rc.1`
3. **`:latest` NAO e atualizado** — usuarios com `:latest` nao sao afetados
4. Teste a RC na VPS com: `docker pull ghcr.io/maiconramos/robo-multipost:X.Y.Z-rc.1`
5. Se precisar iterar, rode `/new-release rc` novamente (incrementa para `rc.2`, `rc.3`, etc.)

### Promover RC para estavel

Quando o RC estiver validado:

1. `/new-release promote` — encontra o ultimo RC automaticamente
2. Faz merge `main` → `release`, cria tag estavel `vX.Y.Z`
3. Dispara `promote-release.yml` que **re-taga** a imagem RC existente como `:X.Y.Z` + `:latest`
4. Nao rebuilda — reutiliza a mesma imagem Docker ja testada

### O que o CI/CD faz apos o push da tag

O workflow `.github/workflows/build-containers.yml` e disparado por tags `v*`:

1. Builda imagem multi-arch (amd64 + arm64) em paralelo
2. Publica em `ghcr.io/maiconramos/robo-multipost:X.Y.Z`
3. Cria manifest multi-arch
4. **Se release estavel:** atualiza tag `:latest`
5. **Se pre-release (RC/beta):** NAO atualiza `:latest`

> O workflow usa `${{ github.actor }}` e `${{ github.token }}`, entao funciona
> automaticamente sem configuracao extra de secrets.

### Dispatch manual (alternativa)

Se precisar buildar sem criar tag:

1. Va em Actions no repositorio GitHub
2. Selecione "Build Containers"
3. Clique em "Run workflow"

---

## Build local da imagem

Use para testar localmente antes de um release, ou quando o CI esta indisponivel.

> **IMPORTANTE: Arquitetura (ARM64 vs AMD64)**
>
> Se voce esta buildando no **Mac com Apple Silicon (M1/M2/M3/M4)**, a imagem sera
> gerada para **ARM64** por padrao. A maioria das VPS roda **linux/amd64 (x86_64)**.
> Uma imagem ARM64 **nao roda** em um servidor amd64.
>
> **Sempre use `--platform linux/amd64`** se a VPS for x86_64.

### Build simples

```bash
# Para rodar em VPS x86_64 (padrao)
docker build -f Dockerfile.dev --platform linux/amd64 -t robo-multipost:latest .

# Para rodar localmente no Mac (ARM64)
docker build -f Dockerfile.dev -t robo-multipost:latest .
```

### Build com versao

```bash
docker build -f Dockerfile.dev \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_VERSION=0.2.0 \
  -t robo-multipost:0.2.0 \
  -t robo-multipost:latest \
  .
```

> O build demora bastante (instala dependencias + faz build completo).
> Recomenda-se pelo menos 4GB de RAM disponivel (o build usa `--max-old-space-size=4096`).
> Build cross-platform (amd64 no Mac ARM) pode ser ainda mais lento por usar emulacao QEMU.

### Testar a imagem localmente

```bash
docker run --rm -p 5000:5000 \
  -e DATABASE_URL="postgresql://postiz-user:postiz-password@host.docker.internal:5432/postiz-db-local" \
  -e REDIS_URL="redis://host.docker.internal:6379" \
  -e JWT_SECRET="sua-secret-aqui" \
  -e FRONTEND_URL="http://localhost:5000" \
  -e NEXT_PUBLIC_BACKEND_URL="http://localhost:5000/api" \
  -e BACKEND_INTERNAL_URL="http://localhost:3000" \
  -e IS_GENERAL="true" \
  -e STORAGE_PROVIDER="local" \
  robo-multipost:latest
```

Acesse http://localhost:5000 para validar.

---

## Publicar manualmente no GHCR

Use quando precisar publicar sem passar pelo CI/CD (ex: teste, hotfix urgente).

### Passo 1: Login no GHCR

```bash
echo "SEU_TOKEN" | docker login ghcr.io -u maiconramos --password-stdin
```

> Para criar o token: GitHub > Settings > Developer settings > Personal access tokens >
> Scopes necessarios: `write:packages`, `read:packages`

### Passo 2: Build e tag

```bash
export GHCR_IMAGE="ghcr.io/maiconramos/robo-multipost"
export VERSION="0.2.0"

docker build -f Dockerfile.dev \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_VERSION=${VERSION} \
  -t ${GHCR_IMAGE}:${VERSION} \
  -t ${GHCR_IMAGE}:latest \
  .
```

### Passo 3: Push

```bash
docker push ${GHCR_IMAGE}:${VERSION}
docker push ${GHCR_IMAGE}:latest
```

> **IMPORTANTE:** Nunca reutilize a mesma tag para imagens diferentes.
> Sempre incremente a versao para evitar problemas de cache.

### Verificar

Acesse https://github.com/maiconramos?tab=packages para ver a imagem publicada.

---

## Deploy na VPS

### Primeira vez

```bash
docker compose up -d
```

### Atualizar para nova versao (latest)

```bash
docker compose pull postiz
docker compose up -d postiz
```

### Atualizar para versao especifica

```bash
# Edite o docker-compose.yml e troque :latest por :0.2.0
docker compose pull postiz
docker compose up -d postiz
```

### Ver logs

```bash
docker compose logs -f postiz
```

### Script de deploy rapido (opcional)

Crie um `deploy.sh` na VPS:

```bash
#!/bin/bash
set -e

VERSION=${1:-latest}
IMAGE="ghcr.io/maiconramos/robo-multipost:${VERSION}"

echo "Atualizando para: ${IMAGE}"
docker pull ${IMAGE}
docker compose up -d postiz
echo "Deploy concluido! Versao: ${VERSION}"
docker compose logs -f --tail=50 postiz
```

Uso:

```bash
# Deploy latest
./deploy.sh

# Deploy versao especifica
./deploy.sh 0.2.0
```

---

## Docker Compose de producao

Crie um `docker-compose.yml` na sua VPS:

```yaml
services:
  postiz:
    image: ghcr.io/maiconramos/robo-multipost:latest  # ou :0.2.0
    container_name: postiz
    restart: always
    environment:
      MAIN_URL: "https://seu-dominio.com"
      FRONTEND_URL: "https://seu-dominio.com"
      NEXT_PUBLIC_BACKEND_URL: "https://seu-dominio.com/api"
      JWT_SECRET: "gere-uma-string-aleatoria-longa"
      DATABASE_URL: "postgresql://postiz-user:postiz-password@postiz-postgres:5432/postiz-db-local"
      REDIS_URL: "redis://postiz-redis:6379"
      BACKEND_INTERNAL_URL: "http://localhost:3000"
      TEMPORAL_ADDRESS: "temporal:7233"
      IS_GENERAL: "true"
      DISABLE_REGISTRATION: "false"
      STORAGE_PROVIDER: "local"
      UPLOAD_DIRECTORY: "/uploads"
      NEXT_PUBLIC_UPLOAD_DIRECTORY: "/uploads"
      # Adicione aqui as chaves de API das redes sociais
    volumes:
      - postiz-config:/config/
      - postiz-uploads:/uploads/
    ports:
      - "5000:5000"
    networks:
      - postiz-network
      - temporal-network
    depends_on:
      postiz-postgres:
        condition: service_healthy
      postiz-redis:
        condition: service_healthy

  postiz-postgres:
    image: postgres:17-alpine
    container_name: postiz-postgres
    restart: always
    environment:
      POSTGRES_PASSWORD: postiz-password
      POSTGRES_USER: postiz-user
      POSTGRES_DB: postiz-db-local
    volumes:
      - postgres-volume:/var/lib/postgresql/data
    networks:
      - postiz-network
    healthcheck:
      test: pg_isready -U postiz-user -d postiz-db-local
      interval: 10s
      timeout: 3s
      retries: 3

  postiz-redis:
    image: redis:7.2
    container_name: postiz-redis
    restart: always
    healthcheck:
      test: redis-cli ping
      interval: 10s
      timeout: 3s
      retries: 3
    volumes:
      - postiz-redis-data:/data
    networks:
      - postiz-network

  # Stack Temporal (necessario para agendamento de posts)
  temporal-elasticsearch:
    image: elasticsearch:7.17.27
    container_name: temporal-elasticsearch
    environment:
      - cluster.routing.allocation.disk.threshold_enabled=true
      - cluster.routing.allocation.disk.watermark.low=512mb
      - cluster.routing.allocation.disk.watermark.high=256mb
      - cluster.routing.allocation.disk.watermark.flood_stage=128mb
      - discovery.type=single-node
      - ES_JAVA_OPTS=-Xms256m -Xmx256m
      - xpack.security.enabled=false
    networks:
      - temporal-network
    expose:
      - 9200

  temporal-postgresql:
    image: postgres:16
    container_name: temporal-postgresql
    environment:
      POSTGRES_PASSWORD: temporal
      POSTGRES_USER: temporal
    networks:
      - temporal-network
    expose:
      - 5432

  temporal:
    image: temporalio/auto-setup:1.28.1
    container_name: temporal
    depends_on:
      - temporal-postgresql
      - temporal-elasticsearch
    environment:
      - DB=postgres12
      - DB_PORT=5432
      - POSTGRES_USER=temporal
      - POSTGRES_PWD=temporal
      - POSTGRES_SEEDS=temporal-postgresql
      - DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development-sql.yaml
      - ENABLE_ES=true
      - ES_SEEDS=temporal-elasticsearch
      - ES_VERSION=v7
    networks:
      - temporal-network

volumes:
  postgres-volume:
  postiz-redis-data:
  postiz-config:
  postiz-uploads:

networks:
  postiz-network:
  temporal-network:
    driver: bridge
```

---

## Resumo do fluxo

### Release estavel (recomendado — `/new-release minor`)

```
[Claude Code]                [GitHub]                     [VPS]
   |                            |                           |
   |-- /new-release minor ----->|                           |
   |   (bump, changelog,        |                           |
   |    merge release, tag)     |                           |
   |                            |-- GitHub Actions build -->|
   |                            |-- Push GHCR:0.3.0 ------>|
   |                            |-- Push GHCR:latest ------>|
   |                            |                           |-- docker pull
   |                            |                           |-- docker compose up -d
   |                            |                           |-- App rodando!
```

### Pre-release RC (`/new-release rc`)

```
[Claude Code]                [GitHub]                     [VPS teste]
   |                            |                           |
   |-- /new-release rc -------->|                           |
   |   (bump rc, tag em main)   |                           |
   |                            |-- GitHub Actions build -->|
   |                            |-- Push GHCR:0.3.0-rc.1 ->|
   |                            |-- :latest NAO atualizado  |
   |                            |                           |-- docker pull :0.3.0-rc.1
   |                            |                           |-- Testar RC
```

### Promover RC (`/new-release promote`)

```
[Claude Code]                [GitHub]                     [VPS]
   |                            |                           |
   |-- /new-release promote --->|                           |
   |   (merge release, tag,     |                           |
   |    changelog)              |                           |
   |                            |-- promote-release.yml --->|
   |                            |-- Re-tag :0.3.0-rc.1     |
   |                            |--   como :0.3.0 + :latest |
   |                            |-- SEM rebuild!            |
   |                            |                           |-- docker pull :latest
   |                            |                           |-- docker compose up -d
   |                            |                           |-- App rodando!
```

### Via build manual (alternativa)

```
[Local]                      [GHCR]                       [VPS]
   |                            |                           |
   |-- docker build ----------->|                           |
   |-- docker push 0.3.0 ----->|                           |
   |-- docker push latest ---->|                           |
   |                            |                           |-- docker pull
   |                            |                           |-- docker compose up -d
   |                            |                           |-- App rodando!
```
