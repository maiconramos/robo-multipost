# MCP Fixes + New Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the MCP tools so they work on direct calls (not only via the agent), add an `uploadMediaFromUrl` tool, and add tools to create/manage comment→reply/DM automations.

**Architecture:** The MCP tools currently resolve the organization via a fragile `requestContext` that is only populated on the agent path. Switch them to read from AsyncLocalStorage (`getAuth()`/`getProfileId()`), which `start.mcp.ts` populates for every MCP route. Then add two new tools reusing existing services (`MediaService`, `FlowsService`).

**Tech Stack:** NestJS, Mastra (`@mastra/core`, `@mastra/mcp`), Zod, Prisma, Jest, pnpm.

**Spec:** `docs/superpowers/specs/2026-05-31-mcp-fixes-and-tools-design.md`

---

## File map

- Modify: `libraries/nestjs-libraries/src/chat/tools/integration.list.tool.ts`
- Modify: `libraries/nestjs-libraries/src/chat/tools/integration.validation.tool.ts`
- Modify: `libraries/nestjs-libraries/src/chat/tools/integration.schedule.post.ts`
- Modify: `libraries/nestjs-libraries/src/chat/tools/integration.trigger.tool.ts`
- Create: `libraries/nestjs-libraries/src/chat/tools/upload.media.from.url.tool.ts`
- Create: `libraries/nestjs-libraries/src/chat/tools/automations.tool.ts`
- Modify: `libraries/nestjs-libraries/src/chat/tools/tool.list.ts` (register new tools)
- Create: `.github/workflows/build-image.yml`

---

## Task 0: Confirm Mastra execute signature (investigation, no code)

The fix assumes `getAuth()` works inside tool `execute` and that `input` holds the args
on a direct MCP call. Confirm before editing.

- [ ] **Step 1: Check the Mastra version**

Run: `grep '"@mastra/core"' package.json`
Note the version (the helper `tool.context.helper.ts` was written for v1.21+).

- [ ] **Step 2: Add a temporary debug log to one tool**

In `integration.list.tool.ts`, at the top of `execute`, temporarily add:
```ts
console.log('[MCP-DEBUG] getAuth=', JSON.stringify(getAuth())?.slice(0,120), 'inputKeys=', input && Object.keys(input));
```
(import `getAuth` from `@gitroom/nestjs-libraries/chat/async.storage`).

- [ ] **Step 3: Call `integrationList` via the MCP and read the container logs**

Expected: `getAuth=` shows the organization object (has `id`), and `inputKeys` shows the
args. If `getAuth()` is populated → proceed with the plan. If it is `undefined`, STOP:
the AsyncLocalStorage is not propagating into Mastra tool execution; in that case read
`options?.mcp?.extra?.authInfo` instead and adjust all tasks accordingly.

- [ ] **Step 4: Remove the debug log. Commit nothing yet.**

---

## Task 1: Fix `integrationList`

**Files:**
- Modify: `libraries/nestjs-libraries/src/chat/tools/integration.list.tool.ts`

- [ ] **Step 1: Replace context resolution**

Add import:
```ts
import { getAuth, getProfileId } from '@gitroom/nestjs-libraries/chat/async.storage';
```
Replace inside `execute`:
```ts
execute: async () => {
  const org = getAuth<{ id: string }>();
  if (!org?.id) {
    throw new Error('MCP: organizacao ausente no contexto de autenticacao');
  }
  const organizationId = org.id;
  const profileId = getProfileId();

  return {
    output: (
      await this._integrationService.getIntegrationsList(organizationId, profileId)
    ).map((p) => ({
      name: p.name,
      id: p.id,
      disabled: p.disabled,
      picture: p.picture || '/no-picture.jpg',
      platform: p.providerIdentifier,
      display: p.profile,
      type: p.type,
    })),
  };
},
```
Remove now-unused imports (`checkAuth`, `readRequestContext`) if nothing else uses them.

- [ ] **Step 2: Build the lib to catch type errors**

Run: `pnpm nx build nestjs-libraries` (or the project's build command for this lib).
Expected: compiles without errors.

- [ ] **Step 3: Manual validation via MCP**

Call `integrationList` through the connected MCP. Expected: returns the channel list,
no `Cannot read properties of undefined` error.

- [ ] **Step 4: Commit**

```bash
git add libraries/nestjs-libraries/src/chat/tools/integration.list.tool.ts
git commit -m "fix(mcp): integrationList resolves org from AsyncLocalStorage"
```

---

## Task 2: Fix `integrationSchema`, `integrationSchedulePostTool`, `integrationTrigger`

Apply the SAME pattern to the other three tools.

**Files:**
- Modify: `integration.validation.tool.ts`
- Modify: `integration.schedule.post.ts`
- Modify: `integration.trigger.tool.ts`

- [ ] **Step 1: `integration.validation.tool.ts`**

Add `import { getAuth } from '@gitroom/nestjs-libraries/chat/async.storage';`.
In `execute`, replace `checkAuth(input, options);` with:
```ts
const org = getAuth<{ id: string }>();
if (!org?.id) throw new Error('MCP: organizacao ausente no contexto');
```
(This tool only needs `input.platform`; the org guard is enough. Keep using `input.platform`.)
If Task 0 found `input` does not carry args, add `const args = (input?.context ?? input);`
and read `args.platform` / `args.isPremium`.

- [ ] **Step 2: `integration.schedule.post.ts`**

Replace the lines that read org/profile (currently `checkAuth` + `readRequestContext`):
```ts
const org = getAuth<{ id: string }>();
if (!org?.id) throw new Error('MCP: organizacao ausente no contexto');
const organizationId = org.id;
const profileId = getProfileId();
```
(import both `getAuth, getProfileId`). Keep the rest (`input.socialPost`, validation,
`createPost(organizationId, ..., profileId)`) unchanged.

- [ ] **Step 3: `integration.trigger.tool.ts`**

Open the file, find the same `checkAuth`/`readRequestContext` pattern, apply the identical
`getAuth()/getProfileId()` replacement.

- [ ] **Step 4: Build**

Run: `pnpm nx build nestjs-libraries`. Expected: compiles clean.

- [ ] **Step 5: Manual validation via MCP**

- `integrationSchema` with `{ platform: "instagram", isPremium: false }` → returns rules/schema.
- `integrationSchedulePostTool` with `type: "draft"` to one channel → returns `{ postId, integration }`.
  (Use `draft` so nothing publishes.) Delete the draft in the Postiz UI after.

- [ ] **Step 6: Commit**

```bash
git add libraries/nestjs-libraries/src/chat/tools/integration.validation.tool.ts \
        libraries/nestjs-libraries/src/chat/tools/integration.schedule.post.ts \
        libraries/nestjs-libraries/src/chat/tools/integration.trigger.tool.ts
git commit -m "fix(mcp): schema/schedule/trigger resolve org from AsyncLocalStorage"
```

---

## Task 3: New tool `uploadMediaFromUrl`

**Files:**
- Create: `libraries/nestjs-libraries/src/chat/tools/upload.media.from.url.tool.ts`
- Modify: `libraries/nestjs-libraries/src/chat/tools/tool.list.ts`
- Maybe modify: `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts`

- [ ] **Step 1: Read the existing pattern**

Open `media.service.ts` and read `generateAiVideo` (~line 198–222): it calls
`this.storage.uploadSimple(url)` then `this.saveFile(orgId, fileName, file, undefined, profileId)`.
If `storage` is private, add a public method to `MediaService`:
```ts
async uploadFromUrl(orgId: string, url: string, fileName?: string, profileId?: string) {
  const file = await this.storage.uploadSimple(url);
  const name = fileName || file.split('/').pop()!;
  return this.saveFile(orgId, name, file, fileName, profileId);
}
```

- [ ] **Step 2: Create the tool**

```ts
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { getAuth, getProfileId } from '@gitroom/nestjs-libraries/chat/async.storage';

@Injectable()
export class UploadMediaFromUrlTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'uploadMediaFromUrl';

  run() {
    return createTool({
      id: 'uploadMediaFromUrl',
      description:
        'Hospeda uma imagem/video a partir de uma URL publica no storage do Postiz e ' +
        'devolve o link interno, pronto para usar como attachment no integrationSchedulePostTool.',
      inputSchema: z.object({
        url: z.string().describe('URL publica da imagem ou video'),
        fileName: z.string().optional().describe('Nome do arquivo (opcional)'),
      }),
      outputSchema: z.object({
        output: z.object({ id: z.string(), path: z.string() }),
      }),
      execute: async (input: any) => {
        const org = getAuth<{ id: string }>();
        if (!org?.id) throw new Error('MCP: organizacao ausente no contexto');
        const media = await this._mediaService.uploadFromUrl(
          org.id,
          input.url,
          input.fileName,
          getProfileId()
        );
        return { output: { id: media.id, path: media.path } };
      },
    });
  }
}
```
(Adjust `media.id`/`media.path` to the actual shape `saveFile` returns — inspect the
return type in `media.repository.ts`.)

- [ ] **Step 3: Register the tool**

Open `tool.list.ts`, import `UploadMediaFromUrlTool`, and add it to the same array/list
where `IntegrationListTool` etc. are registered (follow the exact pattern there).

- [ ] **Step 4: Build**

Run: `pnpm nx build nestjs-libraries`. Expected: compiles clean.

- [ ] **Step 5: Manual validation**

Call `uploadMediaFromUrl` with a public image URL. Expected: returns `{ id, path }` where
`path` is a Postiz-hosted URL. Then use that `path` as an `attachment` in
`integrationSchedulePostTool` (`type: "draft"`) and confirm the draft shows the image.

- [ ] **Step 6: Commit**

```bash
git add libraries/nestjs-libraries/src/chat/tools/upload.media.from.url.tool.ts \
        libraries/nestjs-libraries/src/chat/tools/tool.list.ts \
        libraries/nestjs-libraries/src/database/prisma/media/media.service.ts
git commit -m "feat(mcp): add uploadMediaFromUrl tool"
```

---

## Task 4: New automations tool

**Files:**
- Create: `libraries/nestjs-libraries/src/chat/tools/automations.tool.ts`
- Modify: `libraries/nestjs-libraries/src/chat/tools/tool.list.ts`

- [ ] **Step 1: Study `FlowsService`**

Open `libraries/nestjs-libraries/src/database/prisma/flows/flows.service.ts`. Note the
exact signatures of `getFlows(orgId, profileId?)`, `getInstagramPosts(orgId, flowId, profileId?)`,
`quickCreateFlow(orgId, body: QuickCreateFlowDto, profileId?)`, and `updateFlowStatus(...)`.
Open `dtos/autopost/autopost.dto.ts` and `dtos/flows/flow.dto.ts` to learn the shape of
`QuickCreateFlowDto` (trigger `comment_on_post`, target post, reply text, DM text). The
tool's input schema must mirror that DTO (do not invent fields).

- [ ] **Step 2: Create the tool(s)**

Create `automations.tool.ts` with an `@Injectable()` class implementing
`AgentToolInterface`, injecting `FlowsService`. Expose at least:
- `listAutomations` → `getFlows(org.id, getProfileId())`
- `createCommentAutomation` → maps input to `QuickCreateFlowDto` and calls
  `quickCreateFlow(org.id, dto, getProfileId())`
- `setAutomationStatus` → `updateFlowStatus(...)`

Resolve org via `getAuth()` (same pattern as Task 3). Mirror the real `QuickCreateFlowDto`
fields found in Step 1.

- [ ] **Step 3: Register in `tool.list.ts`** (same as Task 3, Step 3).

- [ ] **Step 4: Build**

Run: `pnpm nx build nestjs-libraries`. Expected: compiles clean.

- [ ] **Step 5: Manual validation**

Call `listAutomations` → returns existing flows (likely empty array). Call
`createCommentAutomation` with a test target → it appears in the Postiz "Automações" tab.
(Full firing requires Trilha B config — see `_HANDOFF.md`.)

- [ ] **Step 6: Commit**

```bash
git add libraries/nestjs-libraries/src/chat/tools/automations.tool.ts \
        libraries/nestjs-libraries/src/chat/tools/tool.list.ts
git commit -m "feat(mcp): add automations tool (Flows over MCP)"
```

---

## Task 5: GitHub Actions image build

**Files:**
- Create: `.github/workflows/build-image.yml`

- [ ] **Step 1: Find the production Dockerfile**

The repo root has `Dockerfile.dev`. Find the file used to build `:latest` (check `Jenkins`,
`railway.toml`, or a root `Dockerfile`). Use that path as `DOCKERFILE_PATH` below.

- [ ] **Step 2: Create the workflow**

```yaml
name: build-image
on:
  push:
    branches: [ feat/mcp-context-fix-and-tools ]
  workflow_dispatch: {}
permissions:
  contents: read
  packages: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: DOCKERFILE_PATH
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/robo-multipost:fix-mcp
```

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/build-image.yml
git commit -m "ci: build fix-mcp image to ghcr"
git push -u origin feat/mcp-context-fix-and-tools
```

- [ ] **Step 4: Watch the Actions run**

In the GitHub repo → Actions tab, confirm the image pushes to
`ghcr.io/<you>/robo-multipost:fix-mcp`. Make the package public (or give the server pull access).

---

## Task 6: Deploy + validate (see `_HANDOFF.md`)

- [ ] In Portainer → stack `multpost` → Editor, change the `multipost` service `image:` to
  `ghcr.io/<you>/robo-multipost:fix-mcp` → Update the stack.
- [ ] Via MCP: `integrationList` returns channels; `integrationSchema` returns schema;
  schedule a `draft` carousel using `uploadMediaFromUrl` outputs as attachments; delete the draft.
- [ ] Rollback if needed: set image back to `ghcr.io/maiconramos/robo-multipost:latest`.

---

## Notes
- TDD: the Postiz repo uses Jest (`x.provider.spec.ts` is a reference). Where a tool's logic
  is non-trivial (the automations DTO mapping), add a `*.spec.ts` mocking the injected
  service and asserting the mapping. The context fix is validated by integration (MCP call).
- Keep `checkAuth` in place — it is still used by the agent path and is harmless.
