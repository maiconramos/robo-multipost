import 'reflect-metadata';

jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/nostr.provider',
  () => ({
    NostrProvider: class {
      identifier = 'nostr';
    },
  })
);

import { IntegrationManager } from './integration.manager';

describe('IntegrationManager.getProviderCredentials', () => {
  it('reutiliza a credencial Google do YouTube no GMB', async () => {
    const credentialService = {
      getRawShared: jest
        .fn()
        .mockImplementation(
          async (
            _organizationId: string,
            provider: string,
            _profileId?: string
          ) =>
            provider === 'youtube'
              ? {
                  clientId: 'google-client-id',
                  clientSecret: 'google-client-secret',
                }
              : undefined
        ),
    };
    const manager = new IntegrationManager(credentialService as any);

    await expect(
      manager.getProviderCredentials('gmb', 'org-1', 'profile-1')
    ).resolves.toEqual({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    });
    expect(credentialService.getRawShared).toHaveBeenCalledWith(
      'org-1',
      'youtube',
      'profile-1'
    );
  });
});
