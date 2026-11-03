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
  const integrations = createMock<IntegrationService>();
  const posts = createMock<PostsService>();
  const notifications = createMock<NotificationService>();
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(result.output.postAutomationScope).toBe('default');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('consulta metricas de canal e post com escopo e dias validados', async () => {
    const tool: any = new GetAnalyticsTool(integrations, posts, profiles).run();
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
        new GetAnalyticsTool(integrations, posts, profiles).run() as any
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
});
