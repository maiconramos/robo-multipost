jest.mock('../../../upload/media-transfer.service', () => ({
  MediaTransferService: class {},
}));
jest.mock('../../../database/prisma/posts/post-management.service', () => ({
  PostManagementService: class {},
}));
jest.mock('../../../database/prisma/profiles/profile.service', () => ({
  ProfileService: class {},
}));
jest.mock('../../../database/prisma/integrations/integration.service', () => ({
  IntegrationService: class {},
}));
jest.mock('../../../database/prisma/posts/posts.service', () => ({
  PostsService: class {},
}));
jest.mock(
  '../../../database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
import { UploadMediaFromUrlTool } from '../media.upload.tool';
import { HttpException } from '@nestjs/common';
import { PostManagementService } from '../../../database/prisma/posts/post-management.service';
import { createMock } from '../../../test';
import { ProfileService } from '../../../database/prisma/profiles/profile.service';
import { IntegrationService } from '../../../database/prisma/integrations/integration.service';
import { PostsService } from '../../../database/prisma/posts/posts.service';
import { NotificationService } from '../../../database/prisma/notifications/notification.service';
import {
  GetAccountContextTool,
  GetAnalyticsTool,
  ListNotificationsTool,
} from '../operational.query.tool';

const context = (profileId?: string) => ({
  requestContext: {
    get: (key: string) =>
      ({
        organization: '{"id":"org","name":"Org","apiKey":"SECRET"}',
        profileId,
      }[key]),
  },
});
describe('consultas operacionais MCP em paridade com REST', () => {
  const profiles = createMock<ProfileService>();
  const management = createMock<PostManagementService>();
  const integrations = createMock<IntegrationService>();
  const posts = createMock<PostsService>();
  const notifications = createMock<NotificationService>();
  beforeEach(() => {
    jest.clearAllMocks();
    management.assertAnalyticsScope.mockResolvedValue(undefined);
    profiles.getProfileById.mockResolvedValue({
      id: 'p',
      name: 'Perfil',
      isDefault: false,
      apiKey: 'SECRET',
    } as never);
    profiles.getProfilesByOrgId.mockResolvedValue([
      { id: 'default', name: 'Default', isDefault: true, apiKey: 'SECRET' },
      { id: 'p', name: 'Perfil', isDefault: false, apiKey: 'SECRET' },
    ] as never);
    integrations.checkAnalytics.mockResolvedValue([]);
    posts.checkPostAnalytics.mockResolvedValue([]);
    notifications.getNotificationsPaginated.mockResolvedValue({
      notifications: [],
      page: 0,
      total: 0,
    } as never);
  });
  it('chave de perfil identifica somente o proprio perfil sem chaves', async () => {
    const result = await (
      new GetAccountContextTool(profiles).run() as any
    ).execute({}, context('p'));
    expect(result.output).toMatchObject({
      organization: { id: 'org', name: 'Org' },
      profile: { id: 'p', name: 'Perfil' },
      profiles: [{ id: 'p', name: 'Perfil' }],
    });
    expect(result.output.profiles).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(profiles.getProfilesByOrgId).not.toHaveBeenCalled();
  });
  it('chave de org identifica perfis acessiveis e alerta sobre Default no gerenciamento', async () => {
    const result = await (
      new GetAccountContextTool(profiles).run() as any
    ).execute({}, context());
    expect(result.output.profile).toBeNull();
    expect(result.output.profiles).toHaveLength(2);
    expect(result.output.postAutomationScope).toBe('organization');
    expect(result.output.writeProfileRequired).toBe(true);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('descobre o cliente e envia midia com a mesma credencial geral, sem escolher Default', async () => {
    const account: any = new GetAccountContextTool(profiles).run();
    const transfer = {
      fromUrl: jest
        .fn()
        .mockResolvedValue({
          id: 'midia',
          name: 'x.png',
          path: '/uploads/x.png',
        }),
    };
    const upload: any = new UploadMediaFromUrlTool(
      transfer as never,
      profiles
    ).run();
    const noSelection = await upload.execute(
      { url: 'https://cdn.example/x.png' },
      context()
    );
    const [failure] = JSON.parse(noSelection.errors);
    expect(failure.error).toBe('PROFILE_REQUIRED');
    expect(failure.message).toContain('getAccountContextTool');
    expect(failure.message).toContain('mesma chave');
    expect(transfer.fromUrl).not.toHaveBeenCalled();
    const discovered = await account.execute({}, context());
    expect(discovered.output.credentialScope).toBe('organization');
    expect(discovered.output.profileSelection).toMatchObject({
      parameter: 'profileId',
      batchPostParameter: 'socialPost[].profileId',
      persists: false,
    });
    const selected = discovered.output.profiles.find(
      (profile: { name: string }) => profile.name === 'Perfil'
    );
    await upload.execute(
      { url: 'https://cdn.example/x.png', profileId: selected.id },
      context()
    );
    expect(transfer.fromUrl).toHaveBeenCalledWith(
      'org',
      'p',
      'https://cdn.example/x.png'
    );
    expect((await account.execute({}, context())).output.profile).toBeNull();
    expect(JSON.stringify(discovered)).not.toContain('SECRET');
  });
  it('consulta metricas de canal e post com escopo e dias validados', async () => {
    const tool: any = new GetAnalyticsTool(
      integrations,
      posts,
      profiles,
      management
    ).run();
    await tool.execute({ target: 'channel', id: 'ig', days: 30 }, context('p'));
    expect(integrations.checkAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'org' }),
      'ig',
      '30',
      false,
      'p'
    );
    await tool.execute({ target: 'post', id: 'post' }, context('p'));
    expect(posts.checkPostAnalytics).toHaveBeenCalledWith(
      'org',
      'post',
      7,
      false,
      'p'
    );
    expect(tool.mcp.annotations.readOnlyHint).toBe(false);
  });
  it.each([
    { target: 'post', id: 'x', days: -1 },
    { target: 'channel', id: 'x', days: 366 },
    { target: 'post', id: 'x', profileId: 'outro' },
  ])(
    'rejeita filtro invalido ou perfil fornecido pelo modelo',
    async (input) => {
      const result = await (
        new GetAnalyticsTool(
          integrations,
          posts,
          profiles,
          management
        ).run() as any
      ).execute(input, context('p'));
      expect(result.errors || result.error).toBeDefined();
      expect(posts.checkPostAnalytics).not.toHaveBeenCalled();
      expect(integrations.checkAnalytics).not.toHaveBeenCalled();
    }
  );
  it('notificacoes de perfil incluem apenas perfil e org-wide, sem marcar como lidas', async () => {
    await (
      new ListNotificationsTool(notifications, profiles).run() as any
    ).execute({ page: 2 }, context('p'));
    expect(notifications.getNotificationsPaginated).toHaveBeenCalledWith(
      'org',
      2,
      { isAdmin: false, profileIds: ['p'] }
    );
    await (
      new ListNotificationsTool(notifications, profiles).run() as any
    ).execute({}, context());
    expect(notifications.getNotificationsPaginated).toHaveBeenLastCalledWith(
      'org',
      0,
      undefined
    );
  });
  it('sem organizacao nao consulta nenhum dado', async () => {
    const result = await (
      new GetAccountContextTool(profiles).run() as any
    ).execute({}, {});
    expect(result.errors).toContain('ORGANIZATION_REQUIRED');
    expect(profiles.getProfileById).not.toHaveBeenCalled();
    expect(profiles.getProfilesByOrgId).not.toHaveBeenCalled();
  });
  it('metricas de alvo incompatível retornam erro sem consultar provider', async () => {
    management.assertAnalyticsScope.mockRejectedValueOnce(
      new HttpException('CHANNEL_NOT_FOUND', 404)
    );
    const tool: any = new GetAnalyticsTool(
      integrations,
      posts,
      profiles,
      management
    ).run();
    const r = await tool.execute(
      { target: 'channel', id: 'outro-cliente' },
      context('p')
    );
    expect(r.errors).toContain('CHANNEL_NOT_FOUND');
    expect(management.assertAnalyticsScope).toHaveBeenCalledWith(
      { organizationId: 'org', profileId: 'p' },
      'channel',
      'outro-cliente'
    );
    expect(integrations.checkAnalytics).not.toHaveBeenCalled();
    management.assertAnalyticsScope.mockRejectedValueOnce(
      new HttpException('POST_NOT_FOUND', 404)
    );
    const post = await tool.execute(
      { target: 'post', id: 'legado-sem-perfil' },
      context('p')
    );
    expect(post.errors).toContain('POST_NOT_FOUND');
    expect(posts.checkPostAnalytics).not.toHaveBeenCalled();
  });
});
