# Carrossel 100% Automatizado e Galeria Auto-Limpavel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que uma maquina 24h gere slides locais, suba as imagens na ordem e agende um carrossel nos canais escolhidos (legenda por canal) sem nenhum passo no navegador, e que a galeria de midia se limpe sozinha liberando espaco real no R2/disco sem nunca quebrar um post pendente.

**Architecture:** Quatro fases incrementais. (F1) Corrige os endpoints publicos de upload por API key para vincular a midia ao perfil correto e retornar `{ id, path }`. (F2) Adiciona um comando `schedule:carousel` em `apps/commands` (nestjs-command, in-process, acesso direto ao DB) que orquestra upload ordenado + agendamento por canal via `PostsService.createPost`. (F3) Implementa deletion fisico real no storage (R2 `DeleteObject` + local URL->fs) e um `MediaCleanupService` idempotente (count-guard) que protege posts pendentes, reusado por tres gatilhos: `StartupMigrationService`, um comando `cleanup:media`, e tools MCP (`listMedia`/`cleanupMedia`). (F4) Confirma e cobre com teste a propagacao do `profileId` da API key por perfil no caminho MCP e no upload publico.

**Tech Stack:** NestJS, TypeScript, Prisma/PostgreSQL, nestjs-command, Mastra MCP (`@mastra/core`), AWS SDK S3 (R2), Jest (`@gitroom/nestjs-libraries/test`).

**REGRA DE ESCRITA deste plano e de todo codigo/comentario/doc gerado:** nunca usar travessoes (em-dash). Usar ponto, virgula, dois-pontos ou parenteses.

---

## File Structure

### Fase 1 (Feature 1 + 4) - Upload server-to-server vinculado ao perfil

- Modify: `apps/backend/src/public-api/routes/v1/public.integrations.controller.ts` - `uploadSimple` e `uploadsFromUrl` passam `publicApiProfileId` e retornam `{ id, path }`; `uploadsFromUrl` reusa `MediaService.uploadFromUrl`.
- Modify: `apps/backend/src/public-api/routes/v1/public.integrations.controller.spec.ts` - cobre profileId propagado nos dois uploads.

### Fase 2 (Feature 2) - Comando de carrossel

- Create: `libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.ts` - logica testavel: resolve perfil por API key, sobe slides na ordem, agenda por canal.
- Create: `libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.spec.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/database.module.ts` - registra `CarouselSchedulerService`.
- Create: `apps/commands/src/tasks/schedule.carousel.ts` - `@Command('schedule:carousel')` fino, le manifesto JSON, delega ao service.
- Modify: `apps/commands/src/command.module.ts` - registra `ScheduleCarousel`.

### Fase 3 (Feature 3) - Galeria auto-limpavel + deletion fisico real

- Modify: `libraries/nestjs-libraries/src/upload/cloudflare.storage.ts` - implementa `removeFile` (DeleteObject, extrai key do path).
- Modify: `libraries/nestjs-libraries/src/upload/local.storage.ts` - `removeFile` mapeia URL publica de volta para caminho de filesystem.
- Modify: `libraries/nestjs-libraries/src/upload/storage.helpers.ts` - adiciona helper `publicUrlToLocalPath` + spec no `storage.helpers.spec.ts`.
- Modify: `libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts` - `getDeletableMedia(cutoff, orgId?)`, `getMediaStats(org, profileId?)`.
- Modify: `libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts` - `getPendingPostsMedia(orgId?)` (posts QUEUE/DRAFT, nao deletados).
- Modify: `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts` - expoe `getReferencedMediaPaths`.
- Create: `libraries/nestjs-libraries/src/database/prisma/media/media.cleanup.service.ts` - orquestra cleanup idempotente.
- Create: `libraries/nestjs-libraries/src/database/prisma/media/media.cleanup.service.spec.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts` - expoe `getMediaStats`.
- Modify: `libraries/nestjs-libraries/src/database/prisma/database.module.ts` - registra `MediaCleanupService`.
- Modify: `libraries/nestjs-libraries/src/database/prisma/startup-migration.service.ts` - chama o cleanup no `onModuleInit`.
- Create/Modify: `libraries/nestjs-libraries/src/database/prisma/startup-migration.service.spec.ts`.
- Create: `apps/commands/src/tasks/cleanup.media.ts` - `@Command('cleanup:media')`.
- Modify: `apps/commands/src/command.module.ts` - registra `CleanupMedia`.
- Create: `libraries/nestjs-libraries/src/chat/tools/media.list.tool.ts` - tool MCP `listMedia`.
- Create: `libraries/nestjs-libraries/src/chat/tools/media.cleanup.tool.ts` - tool MCP `cleanupMedia`.
- Modify: `libraries/nestjs-libraries/src/chat/tools/tool.list.ts` - registra as duas tools.

### Transversal

- Modify: `CHANGELOG.md` - secao `[Unreleased]`, pt-BR com acentos.
- Modify (via doc-maintainer): `apps/backend/CLAUDE.md`, `libraries/nestjs-libraries/src/chat/CLAUDE.md`, `libraries/nestjs-libraries/CLAUDE.md`.
- Env nova: `MEDIA_RETENTION_DAYS` (default 30).

---

## FASE 1 - Feature 1 + 4: Upload server-to-server vinculado ao perfil

**Contexto factual:** `PublicAuthMiddleware` ja resolve a API key por perfil e seta `req.publicApiProfileId = profile.id` (ver `apps/backend/src/services/auth/public.auth.middleware.ts:55`). O decorator `@GetPublicApiProfileId()` ja existe e e usado em `listIntegration`. `MediaService.uploadFromUrl(org, url, fileName?, profileId?)` e `MediaService.saveFile(org, fileName, filePath, originalName?, profileId?)` ja aceitam `profileId`. O bug: os endpoints atuais chamam `saveFile(org.id, ...)` sem o profileId, salvando a midia com `profileId = null` (nivel org).

### Task 1.1: `uploadSimple` (multipart) vincula ao perfil e retorna `{ id, path }`

**Files:**
- Modify: `apps/backend/src/public-api/routes/v1/public.integrations.controller.ts:59-76`
- Test: `apps/backend/src/public-api/routes/v1/public.integrations.controller.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

No spec do controller, adicionar (mockando `MediaService`):

```typescript
describe('uploadSimple', () => {
  it('deve salvar a midia vinculada ao profileId da API key por perfil', async () => {
    const org = { id: 'org-1' } as any;
    const file = { originalname: 'slide.png' } as any;
    const storage = (controller as any).storage;
    jest
      .spyOn(storage, 'uploadFile')
      .mockResolvedValue({ originalname: 'slide.png', path: 'https://r2/slide.png' });
    mediaService.saveFile.mockResolvedValue({ id: 'm-1', path: 'https://r2/slide.png' } as any);

    const result = await controller.uploadSimple(org, file, 'profile-1');

    expect(mediaService.saveFile).toHaveBeenCalledWith(
      'org-1',
      'slide.png',
      'https://r2/slide.png',
      undefined,
      'profile-1'
    );
    expect(result).toEqual({ id: 'm-1', path: 'https://r2/slide.png' });
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm jest apps/backend/src/public-api/routes/v1/public.integrations.controller.spec.ts -t uploadSimple --no-coverage`
Expected: FAIL (assinatura atual do `uploadSimple` nao recebe profileId e nao retorna `{ id, path }`).

- [ ] **Step 3: Implementar minimo**

```typescript
@Post('/upload')
@UseInterceptors(FileInterceptor('file'))
async uploadSimple(
  @GetOrgFromRequest() org: Organization,
  @UploadedFile('file') file: Express.Multer.File,
  @GetPublicApiProfileId() publicApiProfileId?: string
) {
  Sentry.metrics.count('public_api-request', 1);
  if (!file) {
    throw new HttpException({ msg: 'No file provided' }, 400);
  }

  const getFile = await this.storage.uploadFile(file);
  const media = await this._mediaService.saveFile(
    org.id,
    getFile.originalname,
    getFile.path,
    undefined,
    publicApiProfileId
  );
  return { id: media.id, path: media.path };
}
```

- [ ] **Step 4: Rodar e verificar PASS**

Run: `pnpm jest apps/backend/src/public-api/routes/v1/public.integrations.controller.spec.ts -t uploadSimple --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/public-api/routes/v1/public.integrations.controller.ts apps/backend/src/public-api/routes/v1/public.integrations.controller.spec.ts
git commit -m "fix(public-api): upload multipart vincula midia ao perfil da API key e retorna id+path"
```

### Task 1.2: `uploadsFromUrl` reusa `MediaService.uploadFromUrl` com profileId

**Files:**
- Modify: `apps/backend/src/public-api/routes/v1/public.integrations.controller.ts:78-118`
- Test: `apps/backend/src/public-api/routes/v1/public.integrations.controller.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
describe('uploadsFromUrl', () => {
  it('deve hospedar a URL via MediaService.uploadFromUrl vinculando ao profileId', async () => {
    const org = { id: 'org-1' } as any;
    mediaService.uploadFromUrl.mockResolvedValue({ id: 'm-2', path: 'https://r2/x.jpg' } as any);

    const result = await controller.uploadsFromUrl(
      org,
      { url: 'https://ext/x.jpg' } as any,
      'profile-1'
    );

    expect(mediaService.uploadFromUrl).toHaveBeenCalledWith(
      'org-1',
      'https://ext/x.jpg',
      undefined,
      'profile-1'
    );
    expect(result).toEqual({ id: 'm-2', path: 'https://r2/x.jpg' });
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm jest apps/backend/src/public-api/routes/v1/public.integrations.controller.spec.ts -t uploadsFromUrl --no-coverage`
Expected: FAIL.

- [ ] **Step 3: Implementar minimo** (substitui a logica axios inline por reuso do service)

```typescript
@Post('/upload-from-url')
async uploadsFromUrl(
  @GetOrgFromRequest() org: Organization,
  @Body() body: UploadDto,
  @GetPublicApiProfileId() publicApiProfileId?: string
) {
  Sentry.metrics.count('public_api-request', 1);
  const media = await this._mediaService.uploadFromUrl(
    org.id,
    body.url,
    undefined,
    publicApiProfileId
  );
  return { id: media.id, path: media.path };
}
```

Apos remover a logica inline, conferir com grep se `axios`, `Readable`, `lookup`, `extension` ainda sao usados no arquivo; remover os imports que ficarem orfaos (senao o lint quebra).

- [ ] **Step 4: Rodar e verificar PASS**

Run: `pnpm jest apps/backend/src/public-api/routes/v1/public.integrations.controller.spec.ts -t uploadsFromUrl --no-coverage`
Expected: PASS

- [ ] **Step 5: Lint + Commit**

```bash
pnpm lint
git add apps/backend/src/public-api/routes/v1/public.integrations.controller.ts apps/backend/src/public-api/routes/v1/public.integrations.controller.spec.ts
git commit -m "fix(public-api): upload-from-url reusa MediaService.uploadFromUrl com profileId do perfil"
```

### Task 1.3: Feature 4 - teste de regressao do profileId no caminho MCP

**Contexto factual:** `start.mcp.ts:34-35` ja faz `resolveAuth` retornando `{ org, profileId }` para API key por perfil, e `runWithContext({ auth: org, profileId })` em todos os caminhos (`/mcp`, `/mcp/:id`, `/mcp-oauth`). As tools ja leem `getProfileId()`. Esta task trava isso com teste para evitar regressao (o bug do post com profileId null relatado).

**Files:**
- Test: `libraries/nestjs-libraries/src/chat/tools/upload.media.from.url.tool.spec.ts` (criar)

- [ ] **Step 1: Escrever o teste**

```typescript
import { runWithContext } from '@gitroom/nestjs-libraries/chat/async.storage';
import { UploadMediaFromUrlTool } from './upload.media.from.url.tool';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

describe('UploadMediaFromUrlTool', () => {
  it('deve propagar o profileId do contexto para o MediaService.uploadFromUrl', async () => {
    const mediaService = createMock<MediaService>();
    mediaService.uploadFromUrl.mockResolvedValue({ id: 'm-1', path: 'p' } as any);
    const tool = new UploadMediaFromUrlTool(mediaService);

    await runWithContext(
      { requestId: 'k', auth: { id: 'org-1' }, profileId: 'profile-1' },
      async () => {
        await tool.run().execute({ url: 'https://x/y.jpg' } as any);
      }
    );

    expect(mediaService.uploadFromUrl).toHaveBeenCalledWith(
      'org-1',
      'https://x/y.jpg',
      undefined,
      'profile-1'
    );
  });
});
```

Nota: confirmar a forma real de `input` em `upload.media.from.url.tool.ts:37` (hoje le `input.url` direto). Ajustar a chamada do teste se a tool passar a normalizar `input?.context ?? input`.

- [ ] **Step 2: Rodar (deve passar se o codigo ja esta correto)**

Run: `pnpm jest libraries/nestjs-libraries/src/chat/tools/upload.media.from.url.tool.spec.ts --no-coverage`
Expected: PASS (confirma Feature 4). Se FAIL, ha regressao real: corrigir a tool para ler `getProfileId()` e repassar.

- [ ] **Step 3: Commit**

```bash
git add libraries/nestjs-libraries/src/chat/tools/upload.media.from.url.tool.spec.ts
git commit -m "test(mcp): trava propagacao do profileId no uploadMediaFromUrl (Feature 4)"
```

---

## FASE 2 - Feature 2: Comando de carrossel ponta a ponta

**Contexto factual:** `apps/commands` usa `nestjs-command` e roda in-process com `DatabaseModule` (CONFIRMADO `@Global`, ja provê `PostsService`, `MediaService`, `ProfileService`, `IntegrationService`, `PostsRepository`, `MediaRepository` - `database.module.ts:67-129`; o app de comandos ja instancia `PostsService` hoje, entao a cadeia de DI dele, incluindo `TemporalService`, ja resolve nesse contexto). `PostsService.createPost(orgId, body, profileId?)` cria o post (assinatura em `posts.service.ts:746`). O shape exato esta em `integration.schedule.post.ts:225-261` (`posts: [{ integration, group, settings, value: [{ content, id, delay, image: [{ id, path }] }] }]`). CONFIRMADO: a tool MCP de producao `integrationSchedulePostTool` passa o OBJETO COMPLETO da integration (de `getIntegrationById`) como `integration` e NAO chama `mapTypeToPost`; o `CarouselSchedulerService` espelha exatamente esse caminho. `ProfileService.getProfileByApiKey(apiKey)` (CONFIRMADO `profile.service.ts:209`, delega ao repo) resolve o profile com `organization`. Para subir um arquivo LOCAL do disco usa-se `storage.uploadFile(multerLikeFile)` e depois `MediaService.saveFile`.

**Decisao de interface:** o comando recebe `<apiKey>` (API key POR PERFIL) e `<configPath>` (manifesto JSON). Manifesto:

```json
{
  "folder": "./slides",
  "date": "2026-06-02T13:00:00.000Z",
  "type": "schedule",
  "shortLink": false,
  "channels": [
    { "integrationId": "abc123", "caption": "<p>Legenda do Instagram</p>" },
    { "integrationId": "def456", "caption": "<p>Legenda do LinkedIn</p>" }
  ]
}
```

Os slides sao ordenados por nome (`slide_01.png ... slide_08.png`) via sort numerico estavel.

### Task 2.1: `CarouselSchedulerService` - resolver perfil e ordenar slides

**Files:**
- Create: `libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.ts`
- Test: `libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { CarouselSchedulerService } from './carousel.scheduler.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { PostsService } from './posts.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';

const build = () =>
  new CarouselSchedulerService(
    createMock<ProfileService>(),
    createMock<PostsService>(),
    createMock<MediaService>(),
    createMock<IntegrationService>()
  );

describe('CarouselSchedulerService', () => {
  it('deve lancar erro quando a API key nao resolve um perfil', async () => {
    const profileService = createMock<ProfileService>();
    profileService.getProfileByApiKey.mockResolvedValue(null as any);
    const service = new CarouselSchedulerService(
      profileService,
      createMock<PostsService>(),
      createMock<MediaService>(),
      createMock<IntegrationService>()
    );

    await expect(
      service.scheduleFromManifest('bad-key', {
        folder: '/x',
        date: '2026-06-02T13:00:00.000Z',
        type: 'schedule',
        channels: [],
      })
    ).rejects.toThrow('API key invalida');
  });

  it('deve ordenar os slides por nome (numerico)', () => {
    const ordered = (build() as any).sortSlides([
      'slide_10.png',
      'slide_02.png',
      'slide_01.png',
    ]);
    expect(ordered).toEqual(['slide_01.png', 'slide_02.png', 'slide_10.png']);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.spec.ts --no-coverage`
Expected: FAIL (modulo nao existe).

- [ ] **Step 3: Implementar minimo (esqueleto + sort + resolve)**

```typescript
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { PostsService } from './posts.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';

export interface CarouselChannel {
  integrationId: string;
  caption: string;
}

export interface CarouselManifest {
  folder: string;
  date: string;
  type: 'draft' | 'schedule' | 'now';
  shortLink?: boolean;
  channels: CarouselChannel[];
}

@Injectable()
export class CarouselSchedulerService {
  private readonly logger = new Logger(CarouselSchedulerService.name);

  constructor(
    private _profileService: ProfileService,
    private _postsService: PostsService,
    private _mediaService: MediaService,
    private _integrationService: IntegrationService
  ) {}

  private sortSlides(files: string[]): string[] {
    return [...files].sort((a, b) =>
      a.localeCompare(b, 'en', { numeric: true })
    );
  }

  async scheduleFromManifest(apiKey: string, manifest: CarouselManifest) {
    const profile = await this._profileService.getProfileByApiKey(apiKey);
    if (!profile) {
      throw new HttpException('API key invalida (nenhum perfil encontrado)', 401);
    }
    throw new Error('not implemented');
  }
}
```

- [ ] **Step 4: Rodar e verificar PASS**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.spec.ts --no-coverage`
Expected: PASS (os dois testes atuais).

- [ ] **Step 5: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.ts libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.spec.ts
git commit -m "feat(carousel): esqueleto do CarouselSchedulerService com sort e resolucao de perfil"
```

### Task 2.2: Upload ordenado dos slides + agendamento por canal

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.ts`
- Test: `libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.spec.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/database.module.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
it('deve subir slides na ordem e agendar um post por canal com a legenda do canal', async () => {
  const profileService = createMock<ProfileService>();
  profileService.getProfileByApiKey.mockResolvedValue({
    id: 'profile-1',
    organization: { id: 'org-1' },
  } as any);

  const mediaService = createMock<MediaService>();
  const postsService = createMock<PostsService>();
  postsService.createPost.mockResolvedValue([{ postId: 'p', integration: 'i' }] as any);
  const integrationService = createMock<IntegrationService>();
  integrationService.getIntegrationById.mockResolvedValue({
    id: 'abc123',
    providerIdentifier: 'instagram',
    profileId: 'profile-1',
  } as any);

  const service = new CarouselSchedulerService(
    profileService,
    postsService,
    mediaService,
    integrationService
  );
  jest
    .spyOn(service as any, 'readSlidePaths')
    .mockResolvedValue(['/slides/slide_01.png', '/slides/slide_02.png']);
  jest
    .spyOn(service as any, 'uploadLocalFile')
    .mockImplementation(async (_org: string, p: string) => ({
      id: 'm-' + p,
      path: 'https://r2/' + p.split('/').pop(),
    }));

  await service.scheduleFromManifest('key', {
    folder: '/slides',
    date: '2026-06-02T13:00:00.000Z',
    type: 'schedule',
    channels: [{ integrationId: 'abc123', caption: '<p>IG</p>' }],
  });

  const call = postsService.createPost.mock.calls[0];
  expect(call[0]).toBe('org-1');
  expect(call[2]).toBe('profile-1');
  const post = (call[1] as any).posts[0];
  expect(post.value[0].content).toBe('<p>IG</p>');
  expect(post.value[0].image.map((i: any) => i.path)).toEqual([
    'https://r2/slide_01.png',
    'https://r2/slide_02.png',
  ]);
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.spec.ts -t "subir slides na ordem" --no-coverage`
Expected: FAIL.

- [ ] **Step 3: Implementar** os metodos `readSlidePaths`, `uploadLocalFile` e o corpo de `scheduleFromManifest`:

```typescript
import { readdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { lookup } from 'mime-types';
import { Readable } from 'stream';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

// adicionar campo no service:
private storage = UploadFactory.createStorage();

private async readSlidePaths(folder: string): Promise<string[]> {
  const entries = await readdir(folder);
  const images = entries.filter((f) =>
    ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4'].includes(
      extname(f).toLowerCase()
    )
  );
  return this.sortSlides(images).map((f) => join(folder, f));
}

private async uploadLocalFile(org: string, filePath: string, profileId?: string) {
  const buffer = await readFile(filePath);
  const originalname = filePath.split(/[\\/]/).pop() || 'slide';
  const mimetype = (lookup(filePath) || 'image/png') as string;
  const uploaded = await this.storage.uploadFile({
    buffer,
    mimetype,
    size: buffer.length,
    originalname,
    fieldname: '',
    encoding: '',
    destination: '',
    filename: '',
    path: '',
    stream: new Readable(),
  } as any);
  return this._mediaService.saveFile(
    org,
    uploaded.originalname,
    uploaded.path,
    undefined,
    profileId
  );
}

async scheduleFromManifest(apiKey: string, manifest: CarouselManifest) {
  const profile = await this._profileService.getProfileByApiKey(apiKey);
  if (!profile) {
    throw new HttpException('API key invalida (nenhum perfil encontrado)', 401);
  }
  const orgId = profile.organization.id;
  const profileId = profile.id;

  const slidePaths = await this.readSlidePaths(manifest.folder);
  if (slidePaths.length === 0) {
    throw new HttpException('Nenhuma imagem encontrada na pasta', 400);
  }

  const images = [];
  for (const slide of slidePaths) {
    const media = await this.uploadLocalFile(orgId, slide, profileId);
    images.push({ path: media.path });
  }

  const results = [];
  for (const channel of manifest.channels) {
    const integration = await this._integrationService.getIntegrationById(
      orgId,
      channel.integrationId
    );
    if (!integration) {
      throw new HttpException(
        `Integration ${channel.integrationId} nao encontrada`,
        404
      );
    }
    if (integration.profileId && integration.profileId !== profileId) {
      throw new HttpException(
        `Integration ${channel.integrationId} nao pertence ao perfil da API key`,
        403
      );
    }

    const output = await this._postsService.createPost(
      orgId,
      {
        date: manifest.date,
        type: manifest.type,
        shortLink: manifest.shortLink ?? false,
        tags: [],
        posts: [
          {
            integration,
            group: makeId(10),
            settings: { __type: integration.providerIdentifier } as any,
            value: [
              {
                content: channel.caption,
                id: makeId(10),
                delay: 0,
                image: images.map((i) => ({ id: makeId(10), path: i.path })),
              },
            ],
          },
        ],
      } as any,
      profileId
    );
    results.push(...output);
  }

  this.logger.log(
    `Carrossel agendado: ${slidePaths.length} slides, ${manifest.channels.length} canais, perfil ${profileId}`
  );
  return results;
}
```

- [ ] **Step 4: Rodar e verificar PASS**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.spec.ts --no-coverage`
Expected: PASS (toda a suite).

- [ ] **Step 5: Registrar no modulo + Commit**

Em `database.module.ts`, adicionar `CarouselSchedulerService` em `providers` e `exports`.

```bash
git add libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.ts libraries/nestjs-libraries/src/database/prisma/posts/carousel.scheduler.service.spec.ts libraries/nestjs-libraries/src/database/prisma/database.module.ts
git commit -m "feat(carousel): upload ordenado dos slides e agendamento por canal com legenda propria"
```

### Task 2.3: Comando `schedule:carousel` em apps/commands

**Files:**
- Create: `apps/commands/src/tasks/schedule.carousel.ts`
- Modify: `apps/commands/src/command.module.ts`

- [ ] **Step 1: Implementar o comando fino**

```typescript
import { Command, Positional } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import {
  CarouselSchedulerService,
  CarouselManifest,
} from '@gitroom/nestjs-libraries/database/prisma/posts/carousel.scheduler.service';

@Injectable()
export class ScheduleCarousel {
  constructor(private _carouselScheduler: CarouselSchedulerService) {}

  @Command({
    command: 'schedule:carousel <apiKey> <configPath>',
    describe:
      'Agenda um carrossel a partir de uma pasta de slides e um manifesto JSON. ' +
      'Uso: command schedule:carousel <PROFILE_API_KEY> <caminho/carousel.json>',
  })
  async run(
    @Positional({ name: 'apiKey', type: 'string' }) apiKey: string,
    @Positional({ name: 'configPath', type: 'string' }) configPath: string
  ) {
    const manifest = JSON.parse(
      await readFile(configPath, 'utf-8')
    ) as CarouselManifest;
    const result = await this._carouselScheduler.scheduleFromManifest(
      apiKey,
      manifest
    );
    console.log(`Carrossel agendado com sucesso: ${result.length} canal(is).`);
    return result;
  }
}
```

Em `command.module.ts`: importar `ScheduleCarousel` e adicionar em `providers`. O `DatabaseModule` ja esta importado e exporta `CarouselSchedulerService` (Task 2.2 Step 5).

- [ ] **Step 2: Build do app de comandos para validar tipos/DI**

Run: `pnpm --filter ./apps/commands run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add apps/commands/src/tasks/schedule.carousel.ts apps/commands/src/command.module.ts
git commit -m "feat(commands): comando schedule:carousel agenda carrossel de uma pasta sem navegador"
```

---

## FASE 3 - Feature 3: Galeria auto-limpavel com deletion fisico real

**Contexto factual:** `IUploadProvider.removeFile(filePath)` existe mas: no R2 (`cloudflare.storage.ts:113`) esta comentado (no-op); no local (`local.storage.ts:68`) faz `unlink(filePath)` mas o `path` salvo no banco e a URL publica (`FRONTEND_URL/uploads/...`), nao um caminho de filesystem. Media nao tem relacao com Post; o `path` aparece embutido em `Post.content` (JSON com `image: [{ id, path }]`) e em `Post.image`. State enum: `QUEUE | PUBLISHED | ERROR | DRAFT`. "Pendente" = `QUEUE` ou `DRAFT`; `PUBLISHED` ja vive na rede social. `deleteMedia` faz soft-delete (`deletedAt`).

### Task 3.1: R2 `removeFile` deleta o objeto de verdade

**Files:**
- Modify: `libraries/nestjs-libraries/src/upload/cloudflare.storage.ts:112-120`
- Test: novo `libraries/nestjs-libraries/src/upload/cloudflare.storage.spec.ts`

- [ ] **Step 1: Confirmar a assinatura real do construtor e campos** (`_client`, `_bucketName`) lendo o topo de `cloudflare.storage.ts`, e ajustar o teste a realidade antes de escrever.

- [ ] **Step 2: Escrever o teste que falha**

```typescript
import { CloudflareStorage } from './cloudflare.storage';

describe('CloudflareStorage.removeFile', () => {
  it('deve enviar DeleteObjectCommand com a key extraida do path', async () => {
    const storage = Object.create(CloudflareStorage.prototype) as CloudflareStorage;
    const send = jest.fn().mockResolvedValue({});
    (storage as any)._client = { send };
    (storage as any)._bucketName = 'bucket';

    await storage.removeFile('https://cdn.example.com/abc123.png');

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.input).toEqual({ Bucket: 'bucket', Key: 'abc123.png' });
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `pnpm jest libraries/nestjs-libraries/src/upload/cloudflare.storage.spec.ts --no-coverage`
Expected: FAIL (removeFile e no-op).

- [ ] **Step 4: Implementar**

```typescript
async removeFile(filePath: string): Promise<void> {
  const key = filePath.split('/').pop();
  if (!key) {
    return;
  }
  const command = new DeleteObjectCommand({
    Bucket: this._bucketName,
    Key: key,
  });
  await this._client.send(command);
}
```

Garantir o import de `DeleteObjectCommand` de `@aws-sdk/client-s3` (mesma origem do `PutObjectCommand` ja usado no arquivo).

- [ ] **Step 5: Rodar e verificar PASS + Commit**

Run: `pnpm jest libraries/nestjs-libraries/src/upload/cloudflare.storage.spec.ts --no-coverage`
Expected: PASS

```bash
git add libraries/nestjs-libraries/src/upload/cloudflare.storage.ts libraries/nestjs-libraries/src/upload/cloudflare.storage.spec.ts
git commit -m "feat(storage): R2 removeFile deleta o objeto (DeleteObject) para liberar espaco"
```

### Task 3.2: Local `removeFile` mapeia URL publica -> caminho de filesystem

**Files:**
- Modify: `libraries/nestjs-libraries/src/upload/local.storage.ts:68-79`
- Modify: `libraries/nestjs-libraries/src/upload/storage.helpers.ts`
- Test: `libraries/nestjs-libraries/src/upload/storage.helpers.spec.ts`

- [ ] **Step 1: Escrever o teste que falha (helper puro)**

```typescript
import { publicUrlToLocalPath } from './storage.helpers';

describe('publicUrlToLocalPath', () => {
  it('deve converter a URL publica de upload no caminho de filesystem', () => {
    const result = publicUrlToLocalPath(
      'https://app.exemplo.com/uploads/2026/06/abc.png',
      '/data/uploads',
      'https://app.exemplo.com'
    );
    expect(result).toBe('/data/uploads/2026/06/abc.png');
  });

  it('deve retornar null quando a URL nao e do storage local', () => {
    const result = publicUrlToLocalPath(
      'https://r2.cdn.com/abc.png',
      '/data/uploads',
      'https://app.exemplo.com'
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm jest libraries/nestjs-libraries/src/upload/storage.helpers.spec.ts -t publicUrlToLocalPath --no-coverage`
Expected: FAIL.

- [ ] **Step 3: Implementar helper + usar no provider**

Em `storage.helpers.ts`:

```typescript
export function publicUrlToLocalPath(
  publicUrl: string,
  uploadDir: string,
  frontendUrl: string
): string | null {
  const prefix = `${frontendUrl}/uploads`;
  if (!publicUrl.startsWith(prefix)) {
    return null;
  }
  const relative = publicUrl.slice(prefix.length);
  return `${uploadDir}${relative}`;
}
```

Em `local.storage.ts`, o diretorio de upload e o parametro privado do construtor `uploadDirectory` (CONFIRMADO em `local.storage.ts:6` -> `constructor(private uploadDirectory: string)`; NAO existe `_uploadDirectory`). Ajustar `removeFile` para idempotente (nao rejeitar em arquivo inexistente):

```typescript
async removeFile(filePath: string): Promise<void> {
  const localPath =
    publicUrlToLocalPath(
      filePath,
      this.uploadDirectory,
      process.env.FRONTEND_URL || ''
    ) || filePath;
  return new Promise((resolve) => {
    unlink(localPath, () => resolve());
  });
}
```

- [ ] **Step 4: Rodar e verificar PASS + Commit**

Run: `pnpm jest libraries/nestjs-libraries/src/upload/storage.helpers.spec.ts --no-coverage`
Expected: PASS

```bash
git add libraries/nestjs-libraries/src/upload/storage.helpers.ts libraries/nestjs-libraries/src/upload/storage.helpers.spec.ts libraries/nestjs-libraries/src/upload/local.storage.ts
git commit -m "feat(storage): local removeFile resolve URL publica para caminho de filesystem"
```

### Task 3.3: `PostsRepository.getPendingPostsMedia` + `PostsService.getReferencedMediaPaths`

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts`
- Test: `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.spec.ts`

- [ ] **Step 1: Confirmar o nome do campo do repo injetado em `posts.service.ts`** (ex.: `_postRepository`) e o nome do model no `PrismaRepository` (`'post'`). Ajustar o codigo abaixo a realidade.

- [ ] **Step 2: Escrever o teste que falha**

```typescript
describe('getReferencedMediaPaths', () => {
  it('deve coletar os paths de imagem dos posts pendentes (QUEUE/DRAFT)', async () => {
    repository.getPendingPostsMedia.mockResolvedValue([
      { content: JSON.stringify([{ image: [{ path: 'https://r2/a.png' }] }]), image: null },
      { content: '[]', image: JSON.stringify([{ path: 'https://r2/b.png' }]) },
    ] as any);

    const paths = await service.getReferencedMediaPaths('org-1');

    expect(paths.has('https://r2/a.png')).toBe(true);
    expect(paths.has('https://r2/b.png')).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/posts/posts.service.spec.ts -t getReferencedMediaPaths --no-coverage`
Expected: FAIL.

- [ ] **Step 4: Implementar**

No `posts.repository.ts`:

```typescript
getPendingPostsMedia(orgId?: string) {
  return this._post.model.post.findMany({
    where: {
      deletedAt: null,
      state: { in: ['QUEUE', 'DRAFT'] },
      ...(orgId ? { organizationId: orgId } : {}),
    },
    select: { content: true, image: true },
  });
}
```

No `posts.service.ts`:

```typescript
async getReferencedMediaPaths(orgId?: string): Promise<Set<string>> {
  const posts = await this._postRepository.getPendingPostsMedia(orgId);
  const paths = new Set<string>();
  const collect = (raw: string | null) => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of arr) {
        for (const img of item?.image || []) {
          if (img?.path) paths.add(img.path);
        }
        if (item?.path) paths.add(item.path);
      }
    } catch {
      // conteudo nao-JSON, ignora
    }
  };
  for (const post of posts) {
    collect(post.content);
    collect(post.image);
  }
  return paths;
}
```

- [ ] **Step 5: Rodar e verificar PASS + Commit**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/posts/posts.service.spec.ts -t getReferencedMediaPaths --no-coverage`
Expected: PASS

```bash
git add libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts libraries/nestjs-libraries/src/database/prisma/posts/posts.service.spec.ts
git commit -m "feat(posts): getReferencedMediaPaths coleta midia de posts pendentes (guarda do cleanup)"
```

### Task 3.4: `MediaRepository.getDeletableMedia` + `getMediaStats`

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts`
- Test: `libraries/nestjs-libraries/src/database/prisma/media/media.repository.spec.ts` (criar)

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';
import { MediaRepository } from './media.repository';

describe('MediaRepository.getDeletableMedia', () => {
  it('deve buscar midia nao deletada criada antes do cutoff', async () => {
    const prisma = createPrismaRepositoryMock('media');
    prisma.model.media.findMany.mockResolvedValue([] as any);
    const repo = new MediaRepository(prisma as any);
    const cutoff = new Date('2026-05-01');

    await repo.getDeletableMedia(cutoff, 'org-1');

    expect(prisma.model.media.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        createdAt: { lt: cutoff },
        organizationId: 'org-1',
      },
      select: { id: true, organizationId: true, profileId: true, path: true },
    });
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/media/media.repository.spec.ts --no-coverage`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
getDeletableMedia(cutoff: Date, orgId?: string) {
  return this._media.model.media.findMany({
    where: {
      deletedAt: null,
      createdAt: { lt: cutoff },
      ...(orgId ? { organizationId: orgId } : {}),
    },
    select: { id: true, organizationId: true, profileId: true, path: true },
  });
}

async getMediaStats(org: string, profileId?: string) {
  const where = {
    organizationId: org,
    deletedAt: null,
    ...(profileId ? { OR: [{ profileId }, { profileId: null }] } : {}),
  };
  const total = await this._media.model.media.count({ where });
  const sum = await this._media.model.media.aggregate({
    where,
    _sum: { fileSize: true },
  });
  return { total, totalSizeBytes: sum._sum.fileSize || 0 };
}
```

- [ ] **Step 4: Rodar e verificar PASS + Commit**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/media/media.repository.spec.ts --no-coverage`
Expected: PASS

```bash
git add libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts libraries/nestjs-libraries/src/database/prisma/media/media.repository.spec.ts
git commit -m "feat(media): repo getDeletableMedia e getMediaStats"
```

### Task 3.5: `MediaCleanupService` idempotente com guarda de posts pendentes

**Files:**
- Create: `libraries/nestjs-libraries/src/database/prisma/media/media.cleanup.service.ts`
- Test: `libraries/nestjs-libraries/src/database/prisma/media/media.cleanup.service.spec.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/database.module.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { MediaCleanupService } from './media.cleanup.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MediaRepository } from './media.repository';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';

describe('MediaCleanupService', () => {
  it('nao deve apagar midia referenciada por post pendente', async () => {
    const mediaRepo = createMock<MediaRepository>();
    mediaRepo.getDeletableMedia.mockResolvedValue([
      { id: 'm1', organizationId: 'o1', profileId: null, path: 'https://r2/keep.png' },
      { id: 'm2', organizationId: 'o1', profileId: null, path: 'https://r2/old.png' },
    ] as any);
    const postsService = createMock<PostsService>();
    postsService.getReferencedMediaPaths.mockResolvedValue(
      new Set(['https://r2/keep.png'])
    );
    const service = new MediaCleanupService(mediaRepo, postsService);
    const removeFile = jest.fn().mockResolvedValue(undefined);
    (service as any).storage = { removeFile };

    const result = await service.cleanup(30);

    expect(removeFile).toHaveBeenCalledTimes(1);
    expect(removeFile).toHaveBeenCalledWith('https://r2/old.png');
    expect(mediaRepo.deleteMedia).toHaveBeenCalledWith('o1', 'm2', undefined);
    expect(mediaRepo.deleteMedia).not.toHaveBeenCalledWith('o1', 'm1', undefined);
    expect(result.deleted).toBe(1);
  });

  it('deve ser no-op quando nao ha candidatos (count guard)', async () => {
    const mediaRepo = createMock<MediaRepository>();
    mediaRepo.getDeletableMedia.mockResolvedValue([] as any);
    const postsService = createMock<PostsService>();
    const service = new MediaCleanupService(mediaRepo, postsService);

    const result = await service.cleanup(30);

    expect(postsService.getReferencedMediaPaths).not.toHaveBeenCalled();
    expect(result.deleted).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/media/media.cleanup.service.spec.ts --no-coverage`
Expected: FAIL (modulo nao existe).

- [ ] **Step 3: Implementar**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { MediaRepository } from './media.repository';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';

@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _postsService: PostsService
  ) {}

  static resolveRetentionDays(override?: number): number {
    if (typeof override === 'number' && override > 0) return override;
    const fromEnv = parseInt(process.env.MEDIA_RETENTION_DAYS || '', 10);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 30;
  }

  async cleanup(
    retentionDaysOverride?: number,
    orgId?: string
  ): Promise<{ deleted: number; skipped: number }> {
    const retentionDays =
      MediaCleanupService.resolveRetentionDays(retentionDaysOverride);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const candidates = await this._mediaRepository.getDeletableMedia(
      cutoff,
      orgId
    );
    if (candidates.length === 0) {
      return { deleted: 0, skipped: 0 };
    }

    const referenced = await this._postsService.getReferencedMediaPaths(orgId);

    let deleted = 0;
    let skipped = 0;
    for (const media of candidates) {
      if (referenced.has(media.path)) {
        skipped++;
        continue;
      }
      try {
        await this.storage.removeFile(media.path);
      } catch (e) {
        this.logger.error(
          `cleanup: falha ao remover arquivo ${media.path}: ${(e as Error).message}`
        );
      }
      await this._mediaRepository.deleteMedia(
        media.organizationId,
        media.id,
        undefined
      );
      deleted++;
    }

    this.logger.log(
      `MediaCleanup: ${deleted} midias removidas, ${skipped} protegidas (post pendente), retencao ${retentionDays}d`
    );
    return { deleted, skipped };
  }
}
```

Registrar `MediaCleanupService` em `database.module.ts` (providers + exports).

- [ ] **Step 4: Rodar e verificar PASS + Commit**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/media/media.cleanup.service.spec.ts --no-coverage`
Expected: PASS

```bash
git add libraries/nestjs-libraries/src/database/prisma/media/media.cleanup.service.ts libraries/nestjs-libraries/src/database/prisma/media/media.cleanup.service.spec.ts libraries/nestjs-libraries/src/database/prisma/database.module.ts
git commit -m "feat(media): MediaCleanupService idempotente com count-guard e guarda de posts pendentes"
```

### Task 3.6: Registrar cleanup no StartupMigrationService

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/startup-migration.service.ts`
- Test: `libraries/nestjs-libraries/src/database/prisma/startup-migration.service.spec.ts`

- [ ] **Step 1: Escrever/atualizar teste**

```typescript
it('deve chamar o cleanup de midia no onModuleInit', async () => {
  await service.onModuleInit();
  expect(mediaCleanupService.cleanup).toHaveBeenCalled();
});
```

(Construir o `StartupMigrationService` com `PrismaService` mockado e `MediaCleanupService` mockado; mockar as queries para que as migracoes existentes sejam no-op via count 0.)

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/startup-migration.service.spec.ts --no-coverage`
Expected: FAIL.

- [ ] **Step 3: Implementar** (injetar `MediaCleanupService`, chamar no `onModuleInit` com try/catch que engole erro, igual aos outros):

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly mediaCleanupService: MediaCleanupService
) {}

async onModuleInit() {
  await this.migrateProfileScope();
  await this.migrateLateToZernio();
  await this.backfillRepostDestinations();
  await this.cleanupExpiredUnmatchedComments();
  await this.cleanupOldMedia();
}

private async cleanupOldMedia() {
  try {
    await this.mediaCleanupService.cleanup();
  } catch (error) {
    this.logger.error('cleanupOldMedia falhou:', error);
  }
}
```

- [ ] **Step 4: Rodar e verificar PASS + Commit**

Run: `pnpm jest libraries/nestjs-libraries/src/database/prisma/startup-migration.service.spec.ts --no-coverage`
Expected: PASS

```bash
git add libraries/nestjs-libraries/src/database/prisma/startup-migration.service.ts libraries/nestjs-libraries/src/database/prisma/startup-migration.service.spec.ts
git commit -m "feat(media): cleanup de galeria roda no startup (idempotente, count-guard)"
```

### Task 3.7: Comando `cleanup:media`

**Files:**
- Create: `apps/commands/src/tasks/cleanup.media.ts`
- Modify: `apps/commands/src/command.module.ts`

- [ ] **Step 1: Implementar o comando**

```typescript
import { Command, Option } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { MediaCleanupService } from '@gitroom/nestjs-libraries/database/prisma/media/media.cleanup.service';

@Injectable()
export class CleanupMedia {
  constructor(private _mediaCleanupService: MediaCleanupService) {}

  @Command({
    command: 'cleanup:media',
    describe:
      'Remove midia antiga (env MEDIA_RETENTION_DAYS, default 30) que nao esteja ' +
      'ligada a nenhum post pendente. Idempotente. Agende via Agendador de Tarefas do Windows.',
  })
  async run(
    @Option({
      name: 'days',
      describe: 'Sobrescreve a retencao em dias',
      type: 'number',
      required: false,
    })
    days?: number
  ) {
    const result = await this._mediaCleanupService.cleanup(days);
    console.log(
      `Cleanup concluido: ${result.deleted} removidas, ${result.skipped} protegidas.`
    );
    return result;
  }
}
```

Registrar `CleanupMedia` em `command.module.ts` (`providers`).

- [ ] **Step 2: Build para validar DI/tipos**

Run: `pnpm --filter ./apps/commands run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add apps/commands/src/tasks/cleanup.media.ts apps/commands/src/command.module.ts
git commit -m "feat(commands): comando cleanup:media para agendar limpeza na maquina 24h"
```

### Task 3.8: Tools MCP `listMedia` e `cleanupMedia`

**Contexto factual:** padrao das tools em `src/chat/tools/`: classe `@Injectable` com `AgentToolInterface`, `run()` retorna `createTool({...})`, org/profile via `getAuth()`/`getProfileId()` (nunca aceitar orgId no schema), sem `z.any()` em `inputSchema`. Registro em `tool.list.ts`.

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts` - expoe `getMediaStats`.
- Create: `libraries/nestjs-libraries/src/chat/tools/media.list.tool.ts`
- Create: `libraries/nestjs-libraries/src/chat/tools/media.cleanup.tool.ts`
- Modify: `libraries/nestjs-libraries/src/chat/tools/tool.list.ts`

- [ ] **Step 1: Expor `getMediaStats` no `MediaService`**

```typescript
getMediaStats(org: string, profileId?: string) {
  return this._mediaRepository.getMediaStats(org, profileId);
}
```

- [ ] **Step 2: Implementar `listMedia`**

```typescript
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import {
  getAuth,
  getProfileId,
} from '@gitroom/nestjs-libraries/chat/async.storage';

@Injectable()
export class MediaListTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'listMedia';

  run() {
    return createTool({
      id: 'listMedia',
      description:
        'Lista a midia da galeria do perfil ativo: total de itens, tamanho total ' +
        'em bytes e uma pagina de itens. Use para ver o que ocupa espaco antes de limpar.',
      inputSchema: z.object({
        page: z
          .string()
          .optional()
          .describe('Numero da pagina (string), default 1'),
      }),
      outputSchema: z.object({
        total: z.number(),
        totalSizeBytes: z.number(),
        items: z.array(
          z.object({ id: z.string(), name: z.string(), path: z.string() })
        ),
      }),
      execute: async (input: any) => {
        const org = getAuth<{ id: string }>();
        if (!org?.id) {
          throw new Error('MCP: organizacao ausente no contexto');
        }
        const profileId = getProfileId();
        const page = parseInt(input?.page || '1', 10) || 1;
        const stats = await this._mediaService.getMediaStats(org.id, profileId);
        const list = await this._mediaService.getMedia(org.id, page, profileId);
        return {
          total: stats.total,
          totalSizeBytes: stats.totalSizeBytes,
          items: list.results.map((m: any) => ({
            id: m.id,
            name: m.name,
            path: m.path,
          })),
        };
      },
    });
  }
}
```

- [ ] **Step 3: Implementar `cleanupMedia`**

```typescript
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaCleanupService } from '@gitroom/nestjs-libraries/database/prisma/media/media.cleanup.service';
import { getAuth } from '@gitroom/nestjs-libraries/chat/async.storage';

@Injectable()
export class MediaCleanupTool implements AgentToolInterface {
  constructor(private _mediaCleanupService: MediaCleanupService) {}
  name = 'cleanupMedia';

  run() {
    return createTool({
      id: 'cleanupMedia',
      description:
        'Dispara a limpeza da galeria do org ativo: remove midia mais antiga que a ' +
        'retencao (env MEDIA_RETENTION_DAYS ou o parametro days) que NAO esteja ligada ' +
        'a nenhum post pendente. Posts agendados/rascunho ficam protegidos.',
      inputSchema: z.object({
        days: z
          .string()
          .optional()
          .describe('Sobrescreve a retencao em dias (string numerica)'),
      }),
      outputSchema: z.object({
        deleted: z.number(),
        skipped: z.number(),
      }),
      execute: async (input: any) => {
        const org = getAuth<{ id: string }>();
        if (!org?.id) {
          throw new Error('MCP: organizacao ausente no contexto');
        }
        const days = input?.days ? parseInt(input.days, 10) : undefined;
        return this._mediaCleanupService.cleanup(days, org.id);
      },
    });
  }
}
```

- [ ] **Step 4: Registrar em `tool.list.ts`** (CONFIRMADO: `tool.list.ts:20` exporta `export const toolList = [...]`; basta `import` + adicionar `MediaListTool` e `MediaCleanupTool` ao array). O DI das tools vem de graca: `chat.module.ts:9` ja faz `providers: [..., ...toolList]`, e `DatabaseModule` e `@Global`, entao `MediaService`/`MediaCleanupService` injetam sem registrar nada a mais. Nao ha modulo extra para editar.

- [ ] **Step 5: Rodar specs do chat + Commit**

Run: `pnpm jest libraries/nestjs-libraries/src/chat/ --no-coverage`
Expected: PASS (sem quebrar tools existentes).

```bash
git add libraries/nestjs-libraries/src/chat/tools/media.list.tool.ts libraries/nestjs-libraries/src/chat/tools/media.cleanup.tool.ts libraries/nestjs-libraries/src/chat/tools/tool.list.ts libraries/nestjs-libraries/src/database/prisma/media/media.service.ts
git commit -m "feat(mcp): tools listMedia e cleanupMedia (org via getAuth, sem z.any)"
```

---

## FASE 4 - Fechamento: CHANGELOG, docs, validacao

### Task 4.1: CHANGELOG [Unreleased]

- [ ] Atualizar `CHANGELOG.md` na secao `## [Unreleased]`, em pt-BR com acentos, formato Keep a Changelog:

```markdown
### Adicionado
- Upload de midia server-to-server pela API publica vinculado ao perfil da API key (retorna id e path), sem depender do navegador.
- Comando `schedule:carousel` para agendar um carrossel a partir de uma pasta de slides ordenados e um manifesto JSON, com legenda por canal.
- Limpeza automatica da galeria: remove midia antiga (configuravel por `MEDIA_RETENTION_DAYS`, padrao 30 dias) que nao esteja ligada a nenhum post pendente, liberando espaco real no R2/disco. Roda no startup, por comando `cleanup:media` (agendavel), e por tools MCP (`listMedia`, `cleanupMedia`).

### Corrigido
- Upload pela API publica salvava a midia a nivel de organizacao (profileId nulo); agora vincula ao perfil correto da API key.
- Remocao fisica de arquivos no storage R2 (estava desativada) e no storage local (esperava caminho de filesystem mas recebia URL publica).
```

- [ ] Commit:

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): carrossel automatizado e galeria auto-limpavel"
```

### Task 4.2: Suite completa + lint

- [ ] Run: `pnpm test:libs` -> verde
- [ ] Run: `pnpm lint` (da raiz) -> sem erros
- [ ] Run: `pnpm --filter ./apps/commands run build` e `pnpm build:backend` -> OK

### Task 4.3: Documentacao (doc-maintainer)

- [ ] Acionar o `doc-maintainer` para propor updates nos CLAUDE.md afetados: `apps/backend/CLAUDE.md` (retorno `{ id, path }` do upload publico), `libraries/nestjs-libraries/src/chat/CLAUDE.md` (tools `listMedia`/`cleanupMedia`), `libraries/nestjs-libraries/CLAUDE.md` (MediaCleanupService + nova entrada no StartupMigrationService + comandos `apps/commands`). Aplicar somente com aprovacao.

### Task 4.4: code-reviewer + (se acionado) security-auditor

- [ ] Rodar o `code-reviewer` no diff completo. Endereçar MUST FIX. Como a Fase 1 toca API key/auth e a Fase 3 toca raw deletion/storage, esperar possivel escalada para `security-auditor` (guarda cross-tenant no cleanup, isolamento entre perfis no upload).

---

## Variaveis de Ambiente novas

| Env | Default | Uso |
|---|---|---|
| `MEDIA_RETENTION_DAYS` | `30` | Idade minima (dias) para uma midia nao referenciada ser elegivel a limpeza. |

(reusa as ja existentes: `FRONTEND_URL` para mapear URL local->fs; credenciais R2 ja configuradas para o `removeFile`.)

Adicionar `MEDIA_RETENTION_DAYS=30` ao `.env.example` (e mencionar no doc de operacoes) como parte da Task 4.1.

**Decisao documentada (deletion e org-level):** o `MediaCleanupService.cleanup` chama `deleteMedia(organizationId, id, undefined)` sem `profileId` de proposito: a limpeza opera no escopo da organizacao (varre candidatos por org/global e protege qualquer post pendente da org). O isolamento por perfil acontece na ESCRITA (upload vincula ao profile certo) e na guarda de posts pendentes, nao na deled. Quando disparada via tool MCP, o escopo e o org da API key (`getAuth().id`).

## Build da imagem

Sem mudanca no processo: o monorepo continua buildando via o workflow do GitHub Actions existente (`.github/workflows/`), gerando a imagem `ghcr.io/<owner>/robo-multipost:<tag>`. O app de comandos (`apps/commands`) ja faz parte do build do monorepo; os comandos rodam dentro do container com `node dist/apps/commands/main.js <comando>` (confirmar o entrypoint real do container ao validar).

## Passo a passo de uso na maquina 24h

1. O pipeline gera os slides em uma pasta, ex.: `C:\carrosseis\post-001\slide_01.png ... slide_08.png`.
2. Criar o manifesto `C:\carrosseis\post-001\carousel.json` (folder, date em UTC ISO-8601, type, channels com integrationId + caption por canal).
3. Agendar o carrossel (uma linha, sem navegador):
   - Dev: `pnpm --filter ./apps/commands run command schedule:carousel <PROFILE_API_KEY> C:\carrosseis\post-001\carousel.json`
   - Container: `docker exec <container> node dist/apps/commands/main.js schedule:carousel <PROFILE_API_KEY> /data/post-001/carousel.json`
4. Limpeza automatica: criar uma tarefa no Agendador de Tarefas do Windows (ex.: diaria as 04:00) que roda `... cleanup:media`. Alternativamente, pedir ao Claude via MCP: "rode o cleanupMedia". A limpeza tambem roda sozinha a cada restart do backend.

---

## Self-Review (writing-plans)

- Cobertura do spec: F1 (upload por perfil + retorno id/path) -> Tasks 1.1/1.2. F2 (carrossel ordenado por canal) -> Tasks 2.1-2.3. F3 (cleanup seguro, idempotente, libera espaco, MCP tools) -> Tasks 3.1-3.8. F4 (profileId correto MCP) -> Task 1.3 + reuso do start.mcp.ts existente. Env nova + build + passo a passo -> secoes finais.
- Sem placeholders: cada step tem codigo real. As "Notas/Confirmar" pedem validar assinaturas reais (construtor do CloudflareStorage, campo do repo em posts.service, diretorio de upload do local.storage) antes de codar, o que e verificacao, nao placeholder.
- Consistencia de tipos: `cleanup(retentionDaysOverride?, orgId?)` usado igual no comando, startup e tool. `getReferencedMediaPaths(orgId?)` retorna `Set<string>` consumido pelo cleanup. `scheduleFromManifest(apiKey, manifest)` com `CarouselManifest` consistente entre service e comando. `getMediaStats(org, profileId?)` consistente entre repo, service e tool.
- Risco aberto sinalizado: `fileSize` no schema tem default 0 e `saveFile` nao o popula, entao `totalSizeBytes` do `listMedia` pode vir 0 para midias antigas (a limpeza nao depende disso; usa idade + referencia). Decisao: aceitavel no MVP, sinalizado ao usuario.
