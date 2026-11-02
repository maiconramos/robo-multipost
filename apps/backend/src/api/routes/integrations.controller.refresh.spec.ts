jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/nostr.provider',
  () => ({ NostrProvider: class {} })
);
jest.mock('@gitroom/nestjs-libraries/crypto/integration-token.helper', () => ({
  decryptIntegrationToken: (_enc: unknown, stored: string) => stored,
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
}));

import { IntegrationsController } from './integrations.controller';

const userOrg = { id: 'org-1', users: [{ role: 'USER' }] } as any;
const adminOrg = { id: 'org-1', users: [{ role: 'ADMIN' }] } as any;
const profile = { id: 'prof-1' } as any;

const build = (channelProfileId: string | null, found = true) => {
  const provider: any = {
    revokeToken: jest.fn().mockResolvedValue(undefined),
    generateAuthUrl: jest
      .fn()
      .mockResolvedValue({ codeVerifier: 'cv', state: 'st', url: 'https://auth.example' }),
  };
  const manager = {
    getAllowedSocialsIntegrations: () => ['youtube'],
    getSocialIntegration: () => provider,
    getProviderCredentials: jest.fn().mockResolvedValue(null),
  };
  const integrationService = {
    getIntegrationsByInternalId: jest.fn().mockResolvedValue([
      { id: 'int-9', organizationId: 'org-1', profileId: channelProfileId, token: 'OLD' },
    ]),
    getChannelProfileByInternalId: jest
      .fn()
      .mockResolvedValue(found ? { profileId: channelProfileId } : null),
  };
  const controller = new IntegrationsController(
    manager as any,
    integrationService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );
  return { controller, provider, integrationService };
};

// Reconectar com ?refresh=<internalId> revoga o token antigo no provider
// (Google): so de um canal que o membro alcanca.
describe('IntegrationsController GET /social/:integration (refresh)', () => {
  it('USER nao reconecta canal de outro perfil (nem desativado)', async () => {
    const { controller, provider, integrationService } = build('prof-2');
    await expect(
      controller.getIntegrationUrl('youtube', 'yt-1', '', '', userOrg, profile)
    ).rejects.toMatchObject({ status: 403 });
    expect(integrationService.getChannelProfileByInternalId).toHaveBeenCalledWith(
      'org-1',
      'yt-1'
    );
    expect(provider.revokeToken).not.toHaveBeenCalled();
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
  });

  it('USER com refresh de canal inexistente segue para o consent', async () => {
    const { controller } = build(null, false);
    await expect(
      controller.getIntegrationUrl('youtube', 'yt-1', '', '', userOrg, profile)
    ).resolves.toEqual({ url: 'https://auth.example' });
  });

  it('USER do mesmo perfil, canal legado sem perfil e admin revogam', async () => {
    const same = build('prof-1');
    await same.controller.getIntegrationUrl('youtube', 'yt-1', '', '', userOrg, profile);
    expect(same.provider.revokeToken).toHaveBeenCalledWith('OLD');

    const legacy = build(null);
    await legacy.controller.getIntegrationUrl('youtube', 'yt-1', '', '', userOrg, profile);
    expect(legacy.provider.revokeToken).toHaveBeenCalled();

    const admin = build('prof-2');
    await admin.controller.getIntegrationUrl('youtube', 'yt-1', '', '', adminOrg, profile);
    expect(admin.provider.revokeToken).toHaveBeenCalled();
    // admin nao passa pela checagem de perfil
    expect(admin.integrationService.getChannelProfileByInternalId).not.toHaveBeenCalled();
  });
});

describe('IntegrationsController DELETE / (deleteChannel)', () => {
  it('id que nao e texto (filtro Prisma) e recusado antes de qualquer consulta', async () => {
    const integrationService = {
      validateIntegrationProfile: jest.fn(),
      getPostsForChannel: jest.fn(),
      deleteChannel: jest.fn(),
    };
    const controller = new IntegrationsController(
      {} as any,
      integrationService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await expect(
      controller.deleteChannel(userOrg, profile, { not: 'int-x' } as any)
    ).rejects.toMatchObject({ status: 400 });
    expect(integrationService.validateIntegrationProfile).not.toHaveBeenCalled();
    expect(integrationService.getPostsForChannel).not.toHaveBeenCalled();
  });
});
