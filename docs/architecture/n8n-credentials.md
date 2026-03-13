# Dossiê técnico: como o sistema de credenciais do n8n funciona (e como replicar no Postiz com segurança)

## Objetivo

Este documento resume a arquitetura de credenciais do n8n de ponta a ponta (backend, frontend, banco, execução e segurança), com foco em te ajudar a implementar um mecanismo equivalente no Postiz — saindo de `env` e indo para credenciais gerenciadas por UI + banco de forma segura.

---

## 1) Modelo mental do n8n

No n8n, credencial **não é só um JSON salvo no banco**. Ela é um recurso com:

- metadados (`id`, `name`, `type`, flags)
- conteúdo secreto criptografado (`data`)
- controle de acesso por projeto/compartilhamento
- regras de redaction no retorno para frontend
- suporte opcional a segredos externos e resolução dinâmica

Em alto nível:

1. Frontend envia dados da credencial para API.
2. API valida e criptografa antes de persistir.
3. Banco armazena **apenas payload criptografado** em `credentials.data`.
4. API devolve para UI uma versão redigida (campos sensíveis mascarados).
5. Em runtime, o motor de execução decripta sob demanda para autenticar chamadas.

---

## 2) Banco de dados: estrutura das credenciais

### Tabela/entidade principal

A entidade `CredentialsEntity` contém:

- `name`
- `type`
- `data` (`text`) → **conteúdo criptografado**
- flags como `isManaged`, `isGlobal`, `isResolvable`, `resolvableAllowFallback`, `resolverId`

> Ponto crítico: `data` é string criptografada, não JSON em claro.

### Compartilhamento e ownership

A entidade `SharedCredentials` liga credenciais a projetos com papel (`role`), permitindo owner/sharee e RBAC por projeto.

---

## 3) Criptografia: onde está e como funciona

A criptografia está no `Cipher` (core):

- algoritmo: `aes-256-cbc`
- gera salt aleatório por registro
- deriva `key` e `iv` a partir da `encryptionKey` da instância
- serializa para base64

A chave vem de `InstanceSettings`:

- usa `N8N_ENCRYPTION_KEY` quando fornecida
- se não existir, gera e persiste em arquivo de configuração local da instância
- valida mismatch entre chave do arquivo e variável de ambiente

**Implicação operacional:** perder/alterar chave sem migração = impossibilidade de decriptar credenciais antigas.

---

## 4) Ciclo de vida da credencial (CRUD)

### Create

No create/update, o backend monta objeto `Credentials`, chama `setData()`, e persiste o retorno de `getDataToSave()` — que contém `data` criptografado.

### Read para frontend

O backend decripta e depois aplica **redaction**:

- campos com `typeOptions.password` viram sentinel (`CREDENTIAL_BLANKING_VALUE` / `CREDENTIAL_EMPTY_VALUE`)
- `oauthTokenData` nunca vai em claro para UI (vira flag booleana)

Assim a UI consegue editar sem receber segredos antigos.

### Update sem sobrescrever segredo

No update, o backend faz `unredact`: mescla payload redigido vindo da UI com dados reais salvos no banco, preservando segredo quando usuário não alterou o campo.

---

## 5) Segurança de acesso (autorização)

Acesso é protegido por escopos e projeto:

- leitura/edição/deleção exigem scopes de credencial
- busca por credenciais do usuário respeita compartilhamento
- endpoints verificam permissões antes de devolver dados decriptados

Para casos de compartilhamento, o sistema consegue restringir quem vê dados decriptados.

---

## 6) Uso em execução de workflow

O `CredentialsHelper` em runtime:

1. carrega credencial criptografada do banco
2. decripta
3. aplica defaults/overwrites
4. resolve expressões
5. injeta autenticação no request (`authenticate`/`preAuthentication`)

Também existe atualização de `oauthTokenData` após refresh de token, com persistência segura (incluindo caminhos dinâmicos em EE).

---

## 7) Frontend: como participa sem vazar segredo

No editor-ui:

- store de credenciais busca dados via API
- API de `/credentials` normalmente recebe payload redigido
- ao editar, UI manda sentinelas para campos intactos
- backend reconcilia via `unredact`

Resultado: UX de edição boa, sem round-trip de segredos reais para navegador.

---

## 8) Blueprint para implementar no Postiz (versão prática)

### 8.1 Entidades sugeridas

Crie algo equivalente a:

- `Credential`
  - `id`, `name`, `type`, `encryptedData`, `isManaged`, `createdAt`, `updatedAt`
- `CredentialAccess`
  - `credentialId`, `projectId|teamId|userId`, `role`

Se Postiz for single-tenant no início, simplifique para owner por user — mas mantenha estrutura pronta para RBAC.

### 8.2 Criptografia recomendada

- **Não use env para os segredos em si**, use env apenas para **master key/KMS binding**.
- Preferir envelope encryption:
  - DEK por credencial (AES-256-GCM)
  - DEK protegida por KEK (KMS/HSM ou master key rotacionável)
- Se começar simples:
  - AES-256-GCM com nonce aleatório
  - versionamento de chave (`keyVersion`)
  - AAD com `credentialId` + `type`

### 8.3 API segura (contrato)

- `POST /credentials`
- `GET /credentials`
- `GET /credentials/:id` (decriptado **redigido**)
- `PATCH /credentials/:id` (suporte a sentinelas)
- `DELETE /credentials/:id`
- opcional: `POST /credentials/:id/test`

Nunca retornar segredo em claro após criação (nem para owner).

### 8.4 Redaction + unredact (essencial)

Implemente exatamente este padrão:

- na leitura: mascarar campos sensíveis com sentinelas estáveis
- na escrita: substituir sentinelas pelos valores reais atuais

Isso evita:

- sobrescrever segredo com string vazia
- expor segredo ao frontend
- bugs de edição parcial

### 8.5 OAuth token storage

Separar dados estáticos da credencial e token dinâmico ajuda:

- `credential_static_encrypted`
- `credential_token_encrypted`

Renovação de token escreve só no bloco de token.

### 8.6 Auditoria e observabilidade

- logs de `credential.created|updated|deleted|shared|tested`
- nunca logar payload de segredo
- trilha de auditoria por usuário/projeto/IP

### 8.7 Hardening mínimo de produção

- rotação de chave com `keyVersion`
- rate limit em endpoints de credencial
- proteção CSRF/session no painel
- segredo nunca em query string
- segredo removido de traces e error reports

---

## 9) Anti-patterns para evitar no Postiz

- salvar segredo em plaintext no banco
- retornar segredo ao frontend em `GET`
- usar mesma chave fixa sem versionamento
- logar body de requisição com credenciais
- permitir update cego sem `unredact`

---

## 10) Plano de implementação sugerido (4 fases)

### Fase 1 — Fundacional

- schema de credenciais + ACL
- módulo de criptografia com testes
- CRUD básico com redaction

### Fase 2 — UX segura

- formulário de credenciais no frontend
- sentinelas + edição parcial
- teste de conexão por tipo

### Fase 3 — Runtime

- injeção de credenciais em jobs/postagens
- refresh de tokens OAuth
- cache curto em memória para execução

### Fase 4 — Enterprise-grade

- KMS/HSM
- rotação de chave sem downtime
- auditoria avançada e alertas

---

## 11) Checklist de segurança para passar ao seu outro assistant

- [ ] Segredo criptografado em repouso
- [ ] Chave fora do banco
- [ ] Redaction em toda leitura
- [ ] Unredact em toda atualização
- [ ] RBAC por recurso
- [ ] Sem segredo em logs
- [ ] Suporte a rotação de chave
- [ ] Testes unitários de criptografia e merge de sentinela
- [ ] Testes de autorização (owner/sharee/no-access)

---

## 12) Referências principais no código do n8n

- Entidade de credenciais: `packages/@n8n/db/src/entities/credentials-entity.ts`
- Compartilhamento: `packages/@n8n/db/src/entities/shared-credentials.ts`
- Cifra: `packages/core/src/encryption/cipher.ts`
- Config/chave de criptografia: `packages/core/src/instance-settings/instance-settings.ts`
- Objeto de credenciais (set/get data criptografado): `packages/core/src/credentials.ts`
- CRUD/redaction/unredact: `packages/cli/src/credentials/credentials.service.ts`
- Endpoints e escopos: `packages/cli/src/credentials/credentials.controller.ts`
- Runtime helper de credenciais: `packages/cli/src/credentials-helper.ts`
- Sentinel de campo vazio: `packages/workflow/src/constants.ts`
- Sentinel de mascaramento: `packages/cli/src/constants.ts`
- Cliente frontend de credenciais: `packages/frontend/editor-ui/src/features/credentials/credentials.api.ts`
- Store frontend: `packages/frontend/editor-ui/src/features/credentials/credentials.store.ts`

---

## 13) Mensagem curta para você colar no outro assistant

"Quero implementar no Postiz um sistema de credenciais inspirado no n8n: credencial como recurso com RBAC, payload criptografado em banco, leitura sempre redigida por sentinela, update com unredact para preservar segredo, suporte OAuth token seguro e sem retorno de segredo ao frontend. Me entregue design + migrations + service layer + endpoints + testes de segurança."
