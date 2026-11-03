jest.mock('../../../integrations/integration.manager', () => ({
  socialIntegrationList: [],
}));
jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { PostManagementRepository } from './post-management.repository';
import { PostManagementService } from './post-management.service';
import {
  ListPostsTool,
  GetPostTool,
  UpdatePostTool,
} from '../../../chat/tools/manage.posts.tool';
import { PostsRepository } from './posts.repository';
const url = process.env.SHARED_FLOW_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'gerenciamento de posts em banco isolado',
  () => {
    let db: PrismaService, repo: PostManagementRepository;
    let scope: { organizationId: string; profileId: string },
      integrationId: string;
    beforeAll(async () => {
      if (!new URL(url!).pathname.startsWith('/multipost_shared_test_'))
        throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
      process.env.DATABASE_URL = url;
      db = new PrismaService();
      await db.$connect();
      repo = new PostManagementRepository(db);
    });
    afterAll(() => db?.$disconnect());
    beforeEach(async () => {
      const org = await db.organization.create({
        data: { name: 'Fixture gerenciamento' },
      });
      const profile = await db.profile.create({
        data: { organizationId: org.id, name: 'Fixture', slug: randomUUID() },
      });
      scope = { organizationId: org.id, profileId: profile.id };
      const channel = await db.integration.create({
        data: {
          ...scope,
          internalId: randomUUID(),
          name: 'Fixture',
          providerIdentifier: 'facebook',
          type: 'social',
          token: 'FIXTURE-ONLY',
        },
      });
      integrationId = channel.id;
    });
    async function fixture() {
      const root = await db.post.create({
        data: {
          ...scope,
          integrationId,
          group: randomUUID(),
          state: 'QUEUE',
          publishDate: new Date(Date.now() + 86400000),
          content: 'Original',
          image: '[]',
          settings: '{"__type":"facebook"}',
        },
      });
      const child = await db.post.create({
        data: {
          ...scope,
          integrationId,
          group: root.group,
          parentPostId: root.id,
          publishDate: root.publishDate,
          content: 'Comentario',
          image: '[]',
        },
      });
      const flow = await db.flow.create({
        data: { ...scope, integrationId, name: 'Fixture', executionVersion: 2 },
      });
      await db.scheduledAutomationTarget.create({
        data: {
          flowId: flow.id,
          integrationId,
          postId: root.id,
          boundPostIds: ['123_456'],
          publishedReleaseId: '123_456',
        },
      });
      return { root, child, flow };
    }
    it('preserva raiz grupo outro destino e vinculo ao editar cadeia e reagendar', async () => {
      const { root, child, flow } = await fixture();
      const other = await db.integration.create({
        data: {
          ...scope,
          internalId: randomUUID(),
          name: 'Outro',
          providerIdentifier: 'facebook',
          type: 'social',
          token: 'FIXTURE-ONLY',
        },
      });
      const sibling = await db.post.create({
        data: {
          ...scope,
          integrationId: other.id,
          group: root.group,
          publishDate: root.publishDate,
          content: 'Intacto',
        },
      });
      const before = await repo.detail(scope, root.id);
      await repo.write(scope, root.id, before.version, {
        date: new Date(Date.now() + 172800000).toISOString(),
        messages: [
          { id: root.id, content: 'Editado', media: [] },
          { id: child.id, content: 'Comentario editado', media: [], delay: 2 },
        ],
      });
      const saved = await repo.detail(scope, root.id);
      expect(saved.rows.map((p) => p.id)).toEqual([root.id, child.id]);
      expect(saved.rows[0].group).toBe(root.group);
      expect(
        (await db.post.findUniqueOrThrow({ where: { id: sibling.id } })).content
      ).toBe('Intacto');
      expect(
        await db.scheduledAutomationTarget.findUnique({
          where: { flowId_integrationId: { flowId: flow.id, integrationId } },
        })
      ).toMatchObject({
        postId: root.id,
        publishedReleaseId: '123_456',
        boundPostIds: ['123_456'],
      });
    });
    it('duas edicoes com o mesmo snapshot resultam em um sucesso e um conflito', async () => {
      const { root } = await fixture();
      const before = await repo.detail(scope, root.id);
      const results = await Promise.allSettled(
        [2, 3].map((intervalInDays) =>
          repo.write(scope, root.id, before.version, { intervalInDays })
        )
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    });
    it('id de mensagem alheio faz rollback e outro perfil nao consulta nem altera', async () => {
      const { root } = await fixture();
      const before = await repo.detail(scope, root.id);
      await expect(
        repo.write(scope, root.id, before.version, {
          messages: [
            { id: root.id, content: 'Nao salvar', media: [] },
            { id: 'alheio', content: 'X', media: [] },
          ],
        })
      ).rejects.toThrow('POST_MESSAGE_ID_INVALID');
      expect((await repo.detail(scope, root.id)).version).toBe(before.version);
      await expect(
        repo.detail({ ...scope, profileId: randomUUID() }, root.id)
      ).rejects.toThrow('POST_NOT_FOUND');
    });
    it('exclusao preserva targets e permite consultar versao para stop de recuperacao', async () => {
      const { root } = await fixture();
      const before = await repo.detail(scope, root.id);
      const deleted = await repo.write(scope, root.id, before.version, {
        deleted: true,
        intervalInDays: null,
      });
      await expect(repo.detail(scope, root.id)).rejects.toThrow(
        'POST_NOT_FOUND'
      );
      expect((await repo.detail(scope, root.id, undefined, true)).version).toBe(
        deleted.version
      );
      expect(
        await db.scheduledAutomationTarget.count({ where: { postId: root.id } })
      ).toBe(1);
    });
    it('parada apos o horario retira o post do recuperador sem perder o vinculo', async () => {
      const { root } = await fixture();
      await db.post.update({
        where: { id: root.id },
        data: { publishDate: new Date(), intervalInDays: 7 },
      });
      const legacy = new PostsRepository(
        { model: db } as any,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      );
      expect(
        (await legacy.searchForMissingThreeHoursPosts()).map((p) => p.id)
      ).toContain(root.id);
      const before = await repo.detail(scope, root.id);
      await repo.write(scope, root.id, before.version, {
        state: 'DRAFT',
        intervalInDays: null,
        allowPublicationWindow: true,
      });
      expect(
        (await legacy.searchForMissingThreeHoursPosts()).map((p) => p.id)
      ).not.toContain(root.id);
      expect((await repo.detail(scope, root.id)).rows[0]).toMatchObject({
        id: root.id,
        state: 'DRAFT',
        intervalInDays: null,
      });
      expect(
        await db.scheduledAutomationTarget.count({ where: { postId: root.id } })
      ).toBe(1);
    });
    it('trava cobre commit e sincronizacao para impedir reordenacao entre agentes', async () => {
      const { root } = await fixture();
      let release: () => void;
      let entered: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const order: string[] = [];
      const first = repo.lock(scope, root.id, async () => {
        order.push('A');
        entered();
        await gate;
        order.push('A-sync');
      });
      await started;
      const second = repo.lock(scope, root.id, async () => {
        order.push('B');
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(order).toEqual(['A']);
      release();
      await Promise.all([first, second]);
      expect(order).toEqual(['A', 'A-sync', 'B']);
    });
    it('conector de organizacao lista clientes e impede consultar ou editar com perfil errado', async () => {
      const { root } = await fixture();
      const second = await db.profile.create({
        data: {
          organizationId: scope.organizationId,
          name: 'Cliente B',
          slug: randomUUID(),
        },
      });
      const channel = await db.integration.create({
        data: {
          organizationId: scope.organizationId,
          profileId: second.id,
          internalId: randomUUID(),
          name: 'B',
          providerIdentifier: 'facebook',
          type: 'social',
          token: 'FIXTURE-ONLY',
        },
      });
      const other = await db.post.create({
        data: {
          organizationId: scope.organizationId,
          profileId: second.id,
          integrationId: channel.id,
          group: randomUUID(),
          state: 'QUEUE',
          publishDate: new Date(Date.now() + 86400000),
          content: 'Cliente B',
          image: '[]',
          settings: '{"__type":"facebook"}',
        },
      });
      const foreignOrg = await db.organization.create({
        data: { name: 'Outra org' },
      });
      const foreignProfile = await db.profile.create({
        data: {
          organizationId: foreignOrg.id,
          name: 'Estrangeiro',
          slug: randomUUID(),
        },
      });
      const foreignChannel = await db.integration.create({
        data: {
          organizationId: foreignOrg.id,
          profileId: foreignProfile.id,
          internalId: randomUUID(),
          name: 'Estrangeiro',
          providerIdentifier: 'facebook',
          type: 'social',
          token: 'FIXTURE-ONLY',
        },
      });
      const profileService = {
        getProfileById: (org: string, id: string) =>
          db.profile.findFirst({
            where: { organizationId: org, id, deletedAt: null },
          }),
      };
      const service = new PostManagementService(
        repo,
        {} as never,
        profileService as never,
        {} as never
      );
      const context = {
        requestContext: {
          get: (key: string) =>
            key === 'organization'
              ? JSON.stringify({ id: scope.organizationId })
              : undefined,
        },
      };
      const list: any = new ListPostsTool(service).run();
      const all = await list.execute({ state: 'QUEUE' }, context);
      expect(all.output.posts.map((p: any) => p.id).sort()).toEqual(
        [root.id, other.id].sort()
      );
      expect(
        all.output.posts.find((p: any) => p.id === other.id).profile
      ).toEqual({ id: second.id, name: 'Cliente B' });
      const filtered = await list.execute(
        { integrationId: channel.id, state: 'QUEUE' },
        context
      );
      expect(filtered.output.posts.map((p: any) => p.id)).toEqual([other.id]);
      const foreign = await list.execute(
        { integrationId: foreignChannel.id },
        context
      );
      expect(foreign.errors).toContain('CHANNEL_NOT_FOUND');
      const own = await list.execute({ profileId: scope.profileId }, context);
      expect(own.output.posts.map((p: any) => p.id)).toEqual([root.id]);
      const mismatch = await list.execute(
        { profileId: scope.profileId, integrationId: channel.id },
        context
      );
      expect(mismatch.errors).toContain('CHANNEL_NOT_FOUND');
      const missing = await (new GetPostTool(service).run() as any).execute(
        { postId: other.id },
        context
      );
      expect(missing.errors).toContain('PROFILE_REQUIRED');
      const wrong = await (new GetPostTool(service).run() as any).execute(
        { profileId: scope.profileId, postId: other.id },
        context
      );
      expect(wrong.errors).toContain('POST_NOT_FOUND');
      const edit = await (new UpdatePostTool(service).run() as any).execute(
        {
          profileId: scope.profileId,
          postId: other.id,
          expectedVersion: 'unused',
          configuration: { intervalInDays: 3 },
        },
        context
      );
      expect(edit.errors).toContain('POST_NOT_FOUND');
      expect(
        (await db.post.findUniqueOrThrow({ where: { id: other.id } }))
          .intervalInDays
      ).toBeNull();
    });
    it('midia registrada de outro cliente e recusada incluindo capa compartilhada explicitamente', async () => {
      const second = await db.profile.create({
        data: {
          organizationId: scope.organizationId,
          name: 'B',
          slug: randomUUID(),
        },
      });
      const own = await db.media.create({
        data: {
          organizationId: scope.organizationId,
          profileId: scope.profileId,
          name: 'A',
          path: 'https://cdn/' + randomUUID(),
        },
      });
      const other = await db.media.create({
        data: {
          organizationId: scope.organizationId,
          profileId: second.id,
          name: 'B',
          path: 'https://cdn/' + randomUUID(),
        },
      });
      const shared = await db.media.create({
        data: {
          organizationId: scope.organizationId,
          name: 'Compartilhada',
          path: 'https://cdn/' + randomUUID(),
        },
      });
      await expect(
        repo.assertMediaScope(scope, [own, shared])
      ).resolves.toBeUndefined();
      await expect(
        repo.assertMediaScope(scope, [{ id: other.id, path: other.path }])
      ).rejects.toThrow('POST_MEDIA_PROFILE_MISMATCH');
      await expect(
        repo.assertMediaScope(scope, [{ path: other.path }])
      ).rejects.toThrow('POST_MEDIA_PROFILE_MISMATCH');
    });
  }
);
