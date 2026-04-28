# Feature: Central de Providers de IA

**Status:** Planejamento  
**Prioridade:** Alta  
**Data:** 2026-04-03

---

## Contexto

Hoje a IA do Robo MultiPost esta fragmentada em varios providers hardcoded:

| Tipo | Provider Atual | Modelo | Env Var |
|------|---------------|--------|---------|
| Texto/Agente | OpenAI | GPT-4.1 / GPT-5.2 | `OPENAI_API_KEY` |
| Imagem | OpenAI (DALL-E 3) | dall-e-3 | `OPENAI_API_KEY` |
| Imagem (slides) | FAL | ideogram/v2 | `FAL_KEY` |
| Video | KIE.AI | veo3_fast | `KIEAI_API_KEY` |
| TTS (slides) | ElevenLabs | eleven_multilingual_v2 | `ELEVENSLABS_API_KEY` |
| Montagem video | Transloadit | — | `TRANSLOADIT_AUTH` + `TRANSLOADIT_SECRET` |
| Avatar video | HeyGen | — | Chave por usuario no DB |

### Problema

1. Nao ha como trocar provider/modelo sem alterar codigo ou env vars
2. O KIE.AI sozinho oferece dezenas de modelos de imagem, video e audio — mas so usamos `veo3_fast`
3. Nao ha UI para configurar API keys de IA — tudo via env var
4. Para adicionar um novo modelo precisa de deploy

### Oportunidade

O KIE.AI e um **hub unificado** que suporta:
- **Imagem:** GPT-4o Image, Flux Kontext Pro/Max, Seedream 3-5, Imagen 4, Nano Banana, Ideogram V3, Qwen, etc.
- **Video:** Veo 3/3.1, Runway Gen4, Kling v2-3, Wan 2.2-2.7, Sora 2, Hailuo, Seedance, etc.
- **Audio:** Suno V3.5-V5.5, ElevenLabs TTS/STT via Market
- **Utilitarios:** Upscale, remove BG, vocal removal, etc.

Usando KIE.AI como hub, o usuario configura **uma unica API key** e ganha acesso a dezenas de modelos.

---

## Casos de Uso

### Caso 1: Usuario Simples

> "Quero gerar imagens e videos. Coloquei a key do KIE.AI e quero escolher o melhor modelo."

- Vai em Settings > IA
- Cola a API key do KIE.AI
- Seleciona provider "KIE.AI" para imagem e video
- Escolhe o modelo desejado de cada lista

### Caso 2: Usuario Avancado com OpenAI

> "Uso OpenAI para texto e DALL-E para imagens, mas quero KIE.AI para videos com Veo 3.1."

- Configura OpenAI via env var (ja funciona)
- Adiciona KIE.AI key via Settings
- Seleciona KIE.AI apenas para Video
- Mantem OpenAI para texto e imagem

### Caso 3: Trocar Modelo sem Deploy

> "Saiu o Veo 4, quero trocar o modelo de video sem rebuild."

- Vai em Settings > IA > Video
- Troca de `veo3_fast` para `veo4` no dropdown
- Salva — proximo video ja usa o novo modelo

---

## Arquitetura Proposta

### Modelo de Dados

Nova tabela `AiProviderConfig` para armazenar a configuracao por organizacao:

```prisma
model AiProviderConfig {
  id             String       @id @default(cuid())
  organizationId String
  category       String       // "text", "image", "video"
  provider       String       // "openai", "kieai", "fal"
  model          String       // "gpt-4.1", "veo3_fast", "ideogram/v2"
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, category])
  @@index([organizationId])
}
```

A API key do KIE.AI sera armazenada na tabela `ProviderCredential` ja existente (mesmo padrao de facebook, tiktok, etc.), com `provider = "kieai"`.

### Cadeia de Resolucao de Provider

Para cada geracao de IA, o sistema resolve qual provider/modelo usar:

```
1. AiProviderConfig da org → se existe config para a categoria, usa
2. Env var do provider → se a key do provider esta configurada, usa modelo default
3. Fallback → nenhum provider disponivel, feature desabilitada
```

Detalhamento:

| Categoria | Resolucao | Default se nao configurado |
|-----------|-----------|---------------------------|
| text | AiProviderConfig → env `OPENAI_API_KEY` | OpenAI GPT-4.1 |
| image | AiProviderConfig → env `OPENAI_API_KEY` ou `KIEAI_API_KEY` | OpenAI DALL-E 3 |
| video | AiProviderConfig → env `KIEAI_API_KEY` | KIE.AI veo3_fast |

### API Keys: Prioridade

Para a API key de cada provider, a resolucao e:

```
1. ProviderCredential no DB (per-org, criptografado) → prioridade
2. Env var global → fallback
```

Isso permite que cada organizacao tenha sua propria key sem afetar outras.

---

## Providers e Modelos Suportados (Fase 1 — KIE.AI)

### Imagem

| Modelo | ID API | Endpoint |
|--------|--------|----------|
| GPT-4o Image | `gpt4o-image` | `/api/v1/gpt4o-image/generate` |
| Flux Kontext Pro | `flux-kontext-pro` | `/api/v1/flux/kontext/generate` |
| Flux Kontext Max | `flux-kontext-max` | `/api/v1/flux/kontext/generate` |
| Nano Banana | `nano-banana` | Market API |
| Seedream 4.0 | `seedream-4.0` | Market API |
| Google Imagen 4 | `imagen4-standard` | Market API |
| Ideogram V3 | `ideogram-v3` | Market API |

### Video

| Modelo | ID API | Endpoint |
|--------|--------|----------|
| Veo 3.1 | `veo3` | `/api/v1/veo/generate` |
| Veo 3.1 Fast | `veo3_fast` | `/api/v1/veo/generate` |
| Runway Gen4 Turbo | `gen4_turbo` | Market API |
| Kling v3.0 Pro | `kling-v3.0-pro` | Market API |
| Wan 2.7 | `wan-2.7` | Market API |
| Sora 2 | `sora2` | Market API |
| Hailuo 2.3 Pro | `hailuo-2.3-pro` | Market API |

### Audio (futuro)

| Modelo | ID API | Endpoint |
|--------|--------|----------|
| Suno V5.5 | `suno-v5.5` | `/api/v1/generate` |
| ElevenLabs TTS | `elevenlabs-tts-v2` | Market API |

---

## API KIE.AI — Referencia Tecnica

### Autenticacao

```
Authorization: Bearer <KIEAI_API_KEY>
```

### Padrao Assincrono (todas as geracoes)

```
POST /api/v1/{endpoint}/generate → { taskId: "..." }
GET  /api/v1/{endpoint}/record-info?taskId=... → { successFlag: 0|1|2|3, resultUrls: [...] }
```

- `successFlag`: 0=processando, 1=sucesso, 2=falhou, 3=erro
- Polling recomendado: 10s para video, 5s para imagem
- Suporta `callBackUrl` para webhook (futuro)

### Endpoints Especificos

**Imagem GPT-4o:**
```json
POST /api/v1/gpt4o-image/generate
{
  "prompt": "...",
  "size": "1:1" | "3:2" | "2:3",
  "filesUrl": ["url1", ...],    // ate 5 imagens de referencia
  "nVariants": 1 | 2 | 4,
  "enableFallback": true         // fallback para FLUX_MAX ou GPT_IMAGE_1
}
```

**Imagem Flux Kontext:**
```json
POST /api/v1/flux/kontext/generate
{
  "prompt": "...",
  "inputImage": "url",
  "aspectRatio": "1:1" | "16:9" | "9:16" | "4:3" | "3:4",
  "model": "flux-kontext-pro" | "flux-kontext-max",
  "outputFormat": "jpeg" | "png"
}
```

**Video Veo 3.1:**
```json
POST /api/v1/veo/generate
{
  "prompt": "...",
  "model": "veo3" | "veo3_fast",
  "aspectRatio": "16:9" | "9:16",
  "imageUrls": ["url"],
  "callBackUrl": "https://..."
}
```

**Market API (modelos genericos):**
```json
POST /api/v1/market/generate
{
  "model": "modelo-id",
  "prompt": "...",
  // params variam por modelo
}
```

**Credito / Saldo:**
```json
GET /api/v1/chat/credit → { credit: number }
```

---

## Endpoints REST (Backend)

### Configuracao de Providers

```
GET  /settings/ai-providers
→ {
    configs: [
      { category: "text", provider: "openai", model: "gpt-4.1" },
      { category: "image", provider: "kieai", model: "gpt4o-image" },
      { category: "video", provider: "kieai", model: "veo3_fast" }
    ],
    availableProviders: {
      text: [{ id: "openai", name: "OpenAI", models: [...], configured: true }],
      image: [{ id: "openai", ... }, { id: "kieai", ... }],
      video: [{ id: "kieai", ... }]
    }
  }
```

```
PUT  /settings/ai-providers
← {
    configs: [
      { category: "image", provider: "kieai", model: "flux-kontext-pro" },
      { category: "video", provider: "kieai", model: "veo3" }
    ]
  }
```

### API Key do KIE.AI

Reutiliza o sistema de credentials existente:

```
GET  /integrations/credentials/kieai → { configured: boolean }
POST /integrations/credentials/kieai ← { apiKey: "..." }
DELETE /integrations/credentials/kieai
```

### Saldo KIE.AI

```
GET /settings/ai-providers/kieai/balance
→ { credit: number }
```

---

## UI — Settings > IA

### Layout da Pagina

```
Settings > IA (nova tab)
┌─────────────────────────────────────────────────────┐
│ Central de IA                                        │
│                                                      │
│ ┌─ API Keys ──────────────────────────────────────┐ │
│ │ KIE.AI  [••••••••abc]  ✓ Conectado  Saldo: $12 │ │
│ │ OpenAI  Usando variavel de ambiente             │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Texto / Agente ────────────────────────────────┐ │
│ │ Provider: [OpenAI ▼]                            │ │
│ │ Modelo:   [GPT-4.1 ▼]                          │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Imagem IA ─────────────────────────────────────┐ │
│ │ Provider: [KIE.AI ▼]                            │ │
│ │ Modelo:   [GPT-4o Image ▼]                     │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Video IA ──────────────────────────────────────┐ │
│ │ Provider: [KIE.AI ▼]                            │ │
│ │ Modelo:   [Veo 3.1 Fast ▼]                     │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│              [Salvar Configuracao]                    │
└─────────────────────────────────────────────────────┘
```

### Comportamento

- Ao mudar o **provider**, a lista de modelos atualiza automaticamente
- Providers sem API key configurada aparecem desabilitados com tooltip "Configure a API key primeiro"
- OpenAI aparece como "configurado" se `OPENAI_API_KEY` env var existe (nao editavel pela UI)
- KIE.AI editavel pela UI — armazenado criptografado no DB
- Ao salvar API key do KIE.AI, busca o saldo via `/api/v1/chat/credit` para validar
- Modelo selecionado persiste no DB por org — nao precisa reconfigurar

---

## Arquivos Principais (existentes a modificar)

| Arquivo | Mudanca |
|---------|---------|
| `schema.prisma` | Adicionar model `AiProviderConfig` |
| `openai.service.ts` | Receber config de provider/modelo ao inves de hardcoded |
| `fal.service.ts` | Receber modelo dinamicamente |
| `veo3.ts` | Receber modelo dinamicamente, suportar Market API |
| `images.slides.ts` | Resolver provider de TTS dinamicamente |
| `copilot.controller.ts` | Modelo do agente dinamico |
| `media.controller.ts` | Resolver provider antes de gerar |
| `settings.component.tsx` | Nova tab "IA" |
| `.env.example` | Documentar `KIEAI_API_KEY` |
| `docker-compose.yaml` | Documentar `KIEAI_API_KEY` |

### Arquivos Novos

| Arquivo | Papel |
|---------|-------|
| `libraries/nestjs-libraries/src/ai/ai-provider.resolver.ts` | Service que resolve provider+modelo por org |
| `libraries/nestjs-libraries/src/ai/ai-provider.repository.ts` | CRUD do `AiProviderConfig` |
| `libraries/nestjs-libraries/src/ai/providers/kieai.provider.ts` | Client unificado KIE.AI (imagem+video) |
| `apps/backend/src/api/routes/ai-settings.controller.ts` | Controller dos endpoints de config |
| `apps/frontend/src/components/settings/ai-providers.settings.component.tsx` | UI da central de IA |
| `apps/frontend/src/hooks/use-ai-providers.hook.ts` | Hook SWR para config de providers |

---

## Edge Cases e Decisoes

### 1. API key invalida

**Cenario:** Usuario cola uma key invalida do KIE.AI.
**Decisao:** Ao salvar, fazer `GET /api/v1/chat/credit` para validar. Se falhar, mostrar erro e nao salvar.

### 2. Provider configurado mas sem credito

**Cenario:** KIE.AI configurado como provider de imagem, mas saldo zerado.
**Decisao:** Mostrar saldo na UI. Na geracao, retornar erro amigavel "Saldo insuficiente no KIE.AI" em vez de erro generico.

### 3. Env var e DB key coexistem

**Cenario:** `KIEAI_API_KEY` configurada como env var E tambem via UI.
**Decisao:** UI (DB) tem prioridade. Env var e fallback. Mostrar badge "Usando credencial personalizada" vs "Usando variavel de ambiente".

### 4. Modelo removido pelo provider

**Cenario:** Modelo `veo3_fast` e descontinuado pelo KIE.AI.
**Decisao:** Se a geracao falhar com erro do provider, logar warning e nao quebrar. UI mostra lista estatica de modelos conhecidos (atualizada por release). Futuro: endpoint dinamico.

### 5. Organizacao sem config

**Cenario:** Nova org criada, nenhuma config de AI provider.
**Decisao:** Fallback para env vars. Se nenhuma env var, features de IA desabilitadas com mensagem clara.

### 6. Texto/Agente e OpenAI-only (fase 1)

**Cenario:** Usuario quer usar KIE.AI para texto.
**Decisao:** Na fase 1, texto/agente e exclusivo OpenAI (Mastra depende do SDK OpenAI). O dropdown de provider para "texto" mostra apenas OpenAI. Futuro: abstrair via AI SDK.

### 7. Multiplas orgs, uma key

**Cenario:** Duas orgs querem usar a mesma key KIE.AI.
**Decisao:** Cada org salva sua propria key. Se for a mesma, ok — o saldo e compartilhado no KIE.AI.

### 8. OPENAI_API_KEY vazia

**Cenario:** Nenhuma env var de IA configurada.
**Decisao:** Tab "IA" mostra estado vazio com instrucoes: "Configure ao menos um provider para usar funcionalidades de IA". Botoes de geracao desabilitados com tooltip.

---

## Ondas de Implementacao

### Onda 1 — Infraestrutura e API Key via UI (backend + frontend)

**Objetivo:** Permitir cadastrar a API key do KIE.AI via Settings e validar conexao.

#### 1.1 Schema Prisma

- Adicionar model `AiProviderConfig` ao schema
- Reutilizar `ProviderCredential` para `provider = "kieai"`
- `prisma db push` sincroniza automaticamente

#### 1.2 Backend — KIE.AI Credential

- Reutilizar `CredentialService` existente para CRUD da key `kieai`
- Endpoint de validacao: `POST /settings/ai-providers/kieai/validate` → chama `GET /api/v1/chat/credit`
- Endpoint de saldo: `GET /settings/ai-providers/kieai/balance`

#### 1.3 Frontend — Secao API Keys na tab IA

- Novo componente `ai-providers.settings.component.tsx`
- Card KIE.AI: campo de API key, botao "Testar Conexao", badge de status, saldo
- Card OpenAI: read-only, mostra se env var esta configurada
- Hook SWR `useAiProviders` para buscar config

#### 1.4 Testes

- [ ] Service: salvar/buscar/deletar credential kieai
- [ ] Service: validar key via mock do endpoint `/chat/credit`
- [ ] Service: key invalida retorna erro
- [ ] Controller: endpoints de validate e balance
- [ ] Frontend: renderiza cards, estados configurado/nao configurado

#### 1.5 Documentacao

- [ ] Atualizar CLAUDE.md com secao "Central de IA"
- [ ] Atualizar CHANGELOG.md
- [ ] Adicionar traducoes pt/en para novas strings

**Criterios de aceite:**
- [ ] API key salva criptografada no DB
- [ ] Validacao funciona (key valida mostra saldo, invalida mostra erro)
- [ ] Tab "IA" visivel em Settings para admins
- [ ] Testes passando
- [ ] Documentacao atualizada

---

### Onda 2 — Selecao de Provider e Modelo (backend + frontend)

**Objetivo:** Permitir escolher provider e modelo para cada categoria (imagem, video).

#### 2.1 Backend — AiProviderResolver

- Novo service `AiProviderResolver` em `libraries/nestjs-libraries/src/ai/`
- Metodo `resolve(orgId, category)` → retorna `{ provider, model, apiKey }`
- Cadeia: DB config → env var → null (desabilitado)
- Repository para CRUD de `AiProviderConfig`

#### 2.2 Backend — Endpoints de Config

- `GET /settings/ai-providers` → retorna configs atuais + providers disponiveis
- `PUT /settings/ai-providers` → salva selecao de provider/modelo por categoria
- Lista de modelos e estatica (hardcoded no backend), organizada por provider

#### 2.3 Backend — Registry de Modelos

Arquivo `libraries/nestjs-libraries/src/ai/model-registry.ts`:

```typescript
export const AI_MODEL_REGISTRY = {
  image: {
    openai: {
      name: 'OpenAI',
      models: [
        { id: 'dall-e-3', name: 'DALL-E 3', default: true },
      ],
      requiresEnv: 'OPENAI_API_KEY',
    },
    kieai: {
      name: 'KIE.AI',
      models: [
        { id: 'gpt4o-image', name: 'GPT-4o Image', default: true },
        { id: 'flux-kontext-pro', name: 'Flux Kontext Pro' },
        { id: 'flux-kontext-max', name: 'Flux Kontext Max' },
        { id: 'nano-banana', name: 'Nano Banana' },
        { id: 'seedream-4.0', name: 'Seedream 4.0' },
        { id: 'imagen4-standard', name: 'Google Imagen 4' },
        { id: 'ideogram-v3', name: 'Ideogram V3' },
      ],
      requiresCredential: 'kieai',
    },
  },
  video: {
    kieai: {
      name: 'KIE.AI',
      models: [
        { id: 'veo3_fast', name: 'Veo 3.1 Fast', default: true },
        { id: 'veo3', name: 'Veo 3.1' },
        { id: 'gen4_turbo', name: 'Runway Gen4 Turbo' },
        { id: 'kling-v3.0-pro', name: 'Kling v3.0 Pro' },
        { id: 'wan-2.7', name: 'Wan 2.7' },
        { id: 'sora2', name: 'Sora 2' },
        { id: 'hailuo-2.3-pro', name: 'Hailuo 2.3 Pro' },
      ],
      requiresCredential: 'kieai',
    },
  },
  text: {
    openai: {
      name: 'OpenAI',
      models: [
        { id: 'gpt-4.1', name: 'GPT-4.1', default: true },
      ],
      requiresEnv: 'OPENAI_API_KEY',
    },
  },
};
```

#### 2.4 Frontend — Dropdowns de Provider/Modelo

- Dropdown de provider: filtra por providers que tem key configurada
- Dropdown de modelo: atualiza baseado no provider selecionado
- Estado salvo ao clicar "Salvar Configuracao"
- Providers sem key aparecem desabilitados com tooltip

#### 2.5 Testes

- [ ] AiProviderResolver: resolve config do DB
- [ ] AiProviderResolver: fallback para env var
- [ ] AiProviderResolver: retorna null sem config nem env
- [ ] Controller: GET retorna configs + providers disponiveis
- [ ] Controller: PUT salva config
- [ ] Controller: nao permite salvar provider sem key
- [ ] Frontend: dropdowns renderizam corretamente
- [ ] Frontend: modelo atualiza ao trocar provider

#### 2.6 Documentacao

- [ ] Atualizar CLAUDE.md
- [ ] Atualizar CHANGELOG.md
- [ ] Adicionar traducoes pt/en

**Criterios de aceite:**
- [ ] Dropdown mostra apenas providers com key configurada
- [ ] Config salva no DB por organizacao
- [ ] Fallback para env var funciona
- [ ] Testes passando
- [ ] Documentacao atualizada

---

### Onda 3 — Client Unificado KIE.AI (backend)

**Objetivo:** Criar client KIE.AI que suporta geracao de imagem e video com qualquer modelo.

#### 3.1 KieAiProvider Service

Novo service `libraries/nestjs-libraries/src/ai/providers/kieai.provider.ts`:

```typescript
@Injectable()
export class KieAiProvider {
  // Gera imagem com qualquer modelo KIE.AI
  async generateImage(apiKey: string, model: string, prompt: string, options: ImageOptions): Promise<string>

  // Gera video com qualquer modelo KIE.AI
  async generateVideo(apiKey: string, model: string, prompt: string, options: VideoOptions): Promise<string>

  // Polling generico para qualquer endpoint
  private async pollResult(apiKey: string, endpoint: string, taskId: string, intervalMs: number): Promise<string[]>

  // Valida key e retorna saldo
  async getBalance(apiKey: string): Promise<number>
}
```

**Roteamento interno por modelo:**

```
gpt4o-image → /api/v1/gpt4o-image/generate + /record-info
flux-kontext-* → /api/v1/flux/kontext/generate + /record-info
veo3* → /api/v1/veo/generate + /record-info
outros → /api/v1/market/generate + /record-info (Market API generico)
```

#### 3.2 Integracao com Services Existentes

- `OpenaiService.generateImage()` → se provider resolvido for `kieai`, delega para `KieAiProvider`
- `Veo3.process()` → usa modelo dinamico em vez de `veo3_fast` hardcoded
- `MediaController` → resolve provider antes de chamar service

#### 3.3 Refactor do Veo3

- `veo3.ts` passa a aceitar modelo como parametro
- Remove hardcode de `veo3_fast`
- Reutiliza `KieAiProvider` internamente

#### 3.4 Testes

- [ ] KieAiProvider: gera imagem com gpt4o-image (mock HTTP)
- [ ] KieAiProvider: gera imagem com flux-kontext-pro (mock HTTP)
- [ ] KieAiProvider: gera video com veo3 (mock HTTP)
- [ ] KieAiProvider: gera video com modelo Market API (mock HTTP)
- [ ] KieAiProvider: polling retorna resultado apos N tentativas
- [ ] KieAiProvider: polling falha apos timeout
- [ ] KieAiProvider: getBalance retorna saldo
- [ ] KieAiProvider: key invalida retorna erro
- [ ] Integracao: MediaController usa provider resolvido
- [ ] Integracao: Veo3 aceita modelo dinamico

#### 3.5 Documentacao

- [ ] Atualizar CLAUDE.md
- [ ] Atualizar CHANGELOG.md

**Criterios de aceite:**
- [ ] KIE.AI gera imagens com pelo menos 3 modelos diferentes
- [ ] KIE.AI gera videos com pelo menos 3 modelos diferentes
- [ ] Fallback para OpenAI funciona quando KIE.AI nao configurado
- [ ] Veo3 nao quebra para quem ja usa
- [ ] Testes passando
- [ ] Documentacao atualizada

---

### Onda 4 — UX, Saldo e Polish (frontend + backend)

**Objetivo:** Melhorar experiencia do usuario com feedback visual e saldo.

#### 4.1 Saldo KIE.AI no Settings

- Mostrar saldo atual do KIE.AI na secao de API keys
- Atualizar saldo ao carregar a pagina
- Badge com cores: verde (>$5), amarelo ($1-5), vermelho (<$1)

#### 4.2 Indicador de Modelo na Geracao

- Ao gerar imagem/video, mostrar qual provider e modelo sera usado
- Exemplo: "Gerando com KIE.AI / Veo 3.1 Fast..."
- Se saldo insuficiente, mostrar aviso antes de gerar

#### 4.3 Modelo no Agent (Mastra)

- Agent "postiz" passa a usar modelo de texto configurado no DB
- Se org configurou `gpt-4.1`, agent usa `gpt-4.1` em vez de `gpt-5.2` hardcoded
- Tools de geracao (imagem/video) resolvem provider dinamicamente

#### 4.4 Erro Amigavel por Provider

- Erros do KIE.AI traduzidos para mensagens amigaveis
- `successFlag: 2` → "A geracao falhou. Tente novamente ou escolha outro modelo."
- `successFlag: 3` → "Erro no provider. Verifique sua API key e saldo."
- Erro de rede → "Nao foi possivel conectar ao KIE.AI. Verifique sua conexao."

#### 4.5 Testes

- [ ] Frontend: saldo renderiza com cores corretas
- [ ] Frontend: indicador de modelo aparece na geracao
- [ ] Backend: agent usa modelo configurado
- [ ] Backend: erros KIE.AI traduzidos corretamente

#### 4.6 Documentacao

- [ ] Atualizar CLAUDE.md
- [ ] Atualizar CHANGELOG.md
- [ ] Criar `docs/features/ai-providers.md` com guia de uso
- [ ] Adicionar traducoes pt/en para todas as strings

**Criterios de aceite:**
- [ ] Saldo visivel no Settings
- [ ] Indicador de modelo na geracao
- [ ] Agent respeita config de modelo
- [ ] Erros amigaveis sem stack trace
- [ ] Testes passando
- [ ] Documentacao completa

---

## Resumo das Ondas

| Onda | Escopo | Entregavel | Testes | Docs |
|------|--------|------------|--------|------|
| 1 | API Key via UI | Tab IA + credential KIE.AI | 5 | CLAUDE.md, CHANGELOG |
| 2 | Selecao provider/modelo | Dropdowns + config no DB | 8 | CLAUDE.md, CHANGELOG |
| 3 | Client KIE.AI unificado | Geracao real com modelos dinamicos | 10 | CLAUDE.md, CHANGELOG |
| 4 | UX e polish | Saldo, indicador, erros amigaveis | 4 | CLAUDE.md, CHANGELOG, docs/ |

**Total: 27 testes planejados**

---

## Regra Geral de Documentacao

> Toda onda, ao ser concluida, DEVE atualizar:
> 1. `CLAUDE.md` — secao relevante (Central de IA)
> 2. `CHANGELOG.md` — entrada em `[Unreleased]`
> 3. Traducoes `pt` e `en` para novas strings de UI
> 4. Comentarios em codigo apenas onde a logica nao e auto-evidente
