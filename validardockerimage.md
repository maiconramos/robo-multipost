# Postiz - Guia de Build e Publicacao de Imagem Docker

## Indice

1. [Como funciona o processo atual](#como-funciona-o-processo-atual)
2. [Build local da imagem](#build-local-da-imagem)
3. [Publicar no GitHub Container Registry (GHCR)](#publicar-no-github-container-registry-ghcr)
4. [Publicar no Docker Hub (alternativa)](#publicar-no-docker-hub-alternativa)
5. [Puxar a imagem na VPS](#puxar-a-imagem-na-vps)
6. [CI/CD automatizado via GitHub Actions](#cicd-automatizado-via-github-actions)
7. [Rodar na VPS com Docker Compose](#rodar-na-vps-com-docker-compose)

---

## Como funciona o processo atual

O projeto usa um unico Dockerfile (`Dockerfile.dev`) que faz tudo:

1. Base: `node:22.20-bookworm-slim`
2. Instala dependencias do sistema (g++, make, python3, nginx)
3. Instala `pnpm@10.6.1` e `pm2` globalmente
4. Copia o codigo fonte
5. Roda `pnpm install`
6. Roda `pnpm run build` (frontend + backend + orchestrator)
7. Inicia com Nginx (proxy reverso na porta 5000) + PM2 (gerencia processos Node)

**Arquitetura da imagem em producao:**

```
Porta 5000 (Nginx)
  |
  |-- /        -> Frontend (porta 4200 interna)
  |-- /api/    -> Backend  (porta 3000 interna)
  |-- /uploads/ -> Arquivos locais
```

---

## Build local da imagem

### Build simples

```bash
docker build -f Dockerfile.dev -t postiz-app:latest .
```

### Build com versao

```bash
# Substituir 1.0.0 pela versao desejada
docker build -f Dockerfile.dev \
  --build-arg NEXT_PUBLIC_VERSION=1.0.0 \
  -t postiz-app:1.0.0 \
  -t postiz-app:latest \
  .
```

> O build demora bastante (instala dependencias + faz build completo).
> Recomenda-se pelo menos 4GB de RAM disponivel (o build usa `--max-old-space-size=4096`).

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
  postiz-app:latest
```

Acesse http://localhost:5000 para validar.

---

## Publicar no GitHub Container Registry (GHCR)

O GHCR e gratuito para repositorios publicos e ja e o registry usado pelo projeto oficial.

### Passo 1: Criar um Personal Access Token (PAT)

1. Va em https://github.com/settings/tokens
2. Clique em "Generate new token (classic)"
3. Selecione os scopes:
   - `write:packages`
   - `read:packages`
   - `delete:packages` (opcional)
4. Copie o token gerado

### Passo 2: Login no GHCR

```bash
# Substituir SEU_USUARIO pelo seu usuario do GitHub
echo "TOKEN_DO_USUARIO" | docker login ghcr.io -u USERNAME --password-stdin
```

### Passo 3: Build e tag da imagem

```bash
# Substituir SEU_USUARIO e NOME_REPO
export GHCR_IMAGE="ghcr.io/maiconramos/robo-multipost"

# Build com tag de versao + latest
docker build -f Dockerfile.dev \
  --build-arg NEXT_PUBLIC_VERSION=0.0.1 \
  -t ${GHCR_IMAGE}:0.0.1 \
  -t ${GHCR_IMAGE}:latest \
  .
```

### Passo 4: Push para o GHCR

```bash
# Push da versao especifica
docker push ${GHCR_IMAGE}:0.0.1

# Push do latest
docker push ${GHCR_IMAGE}:latest
```

### Passo 5: Verificar

Acesse `https://github.com/SEU_USUARIO?tab=packages` para ver a imagem publicada.

---

## Publicar no Docker Hub (alternativa)

### Passo 1: Criar conta no Docker Hub

Crie uma conta em https://hub.docker.com se ainda nao tiver.

### Passo 2: Login

```bash
docker login -u SEU_USUARIO
```

### Passo 3: Build, tag e push

```bash
export DOCKERHUB_IMAGE="SEU_USUARIO/postiz-app"

docker build -f Dockerfile.dev \
  --build-arg NEXT_PUBLIC_VERSION=1.0.0 \
  -t ${DOCKERHUB_IMAGE}:1.0.0 \
  -t ${DOCKERHUB_IMAGE}:latest \
  .

docker push ${DOCKERHUB_IMAGE}:1.0.0
docker push ${DOCKERHUB_IMAGE}:latest
```

---

## Puxar a imagem na VPS

### Usando GHCR

```bash
# Ultima versao
docker pull ghcr.io/SEU_USUARIO/NOME_REPO:latest

# Versao especifica
docker pull ghcr.io/SEU_USUARIO/NOME_REPO:1.0.0
```

> Se o repositorio for privado, faca `docker login ghcr.io` na VPS tambem.

### Usando Docker Hub

```bash
# Ultima versao
docker pull SEU_USUARIO/postiz-app:latest

# Versao especifica
docker pull SEU_USUARIO/postiz-app:1.0.0
```

---

## CI/CD automatizado via GitHub Actions

O projeto ja possui um workflow em `.github/workflows/build-containers.yml` que:

1. **Trigger:** push de tags (`*`) ou dispatch manual
2. **Build multi-arch:** amd64 + arm64 em paralelo
3. **Push:** para `ghcr.io/gitroomhq/postiz-app:{tag}`
4. **Manifest:** cria manifest multi-arch e atualiza `:latest`

### Como usar no seu fork

#### Opcao A: Usar o workflow existente (recomendado)

O workflow ja funciona automaticamente. Para publicar uma nova versao:

```bash
# Criar e push uma tag
git tag v1.0.0
git push origin v1.0.0
```

Isso dispara o GitHub Actions que:
- Faz build para amd64 e arm64
- Publica em `ghcr.io/SEU_USUARIO/NOME_REPO:v1.0.0`
- Atualiza `ghcr.io/SEU_USUARIO/NOME_REPO:latest`

> O workflow usa `${{ github.actor }}` e `${{ github.token }}`, entao funciona
> automaticamente no seu fork sem configuracao extra.

#### Opcao B: Dispatch manual

1. Va em Actions no seu repositorio GitHub
2. Selecione "Build Containers"
3. Clique em "Run workflow"

### Fluxo completo de release

```
1. Desenvolva e teste localmente
2. Commit e push para main
3. Crie uma tag: git tag v1.2.3 && git push origin v1.2.3
4. GitHub Actions builda e publica automaticamente
5. Na VPS: docker pull ghcr.io/SEU_USUARIO/NOME_REPO:v1.2.3
6. Na VPS: docker compose up -d (ou restart do container)
```

---

## Rodar na VPS com Docker Compose

Crie um `docker-compose.yml` na sua VPS:

```yaml
services:
  postiz:
    image: ghcr.io/SEU_USUARIO/NOME_REPO:latest  # ou :v1.0.0
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
      IS_GENERAL: "true"
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

### Comandos na VPS

```bash
# Primeira vez
docker compose up -d

# Atualizar para nova versao
docker compose pull postiz
docker compose up -d postiz

# Ver logs
docker compose logs -f postiz

# Atualizar para versao especifica
# Edite o docker-compose.yml e troque :latest por :v1.2.3
docker compose pull postiz
docker compose up -d postiz
```

### Script de deploy rapido (opcional)

Crie um `deploy.sh` na VPS:

```bash
#!/bin/bash
set -e

VERSION=${1:-latest}
IMAGE="ghcr.io/SEU_USUARIO/NOME_REPO:${VERSION}"

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
./deploy.sh v1.2.3
```

---

## Resumo do fluxo

```
[Local]                    [GitHub]                     [VPS]
   |                          |                           |
   |-- git tag v1.0.0 ------->|                           |
   |-- git push origin v1.0.0>|                           |
   |                          |-- GitHub Actions build -->|
   |                          |-- Push to GHCR ---------->|
   |                          |                           |-- docker pull
   |                          |                           |-- docker compose up -d
   |                          |                           |-- App rodando!
```
