import { PublicProfilesController } from './public.profiles.controller';

jest.mock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }));

const makeProfileService = () => ({
  getProfileById: jest.fn(),
  getProfilesByOrgId: jest.fn(),
});

describe('PublicProfilesController - listProfiles', () => {
  let controller: PublicProfilesController;
  let profileService: ReturnType<typeof makeProfileService>;

  beforeEach(() => {
    profileService = makeProfileService();
    controller = new PublicProfilesController(profileService as any);
  });

  it('chave de org: retorna todos os perfis com hasApiKey', async () => {
    profileService.getProfilesByOrgId.mockResolvedValue([
      { id: 'prof-1', name: 'Default', isDefault: true, apiKey: 'enc-key' },
      { id: 'prof-2', name: 'Honda', isDefault: false, apiKey: null },
    ]);

    const result = await controller.listProfiles({ id: 'org-1' } as any, undefined);

    expect(result).toEqual([
      { id: 'prof-1', name: 'Default', isDefault: true, hasApiKey: true },
      { id: 'prof-2', name: 'Honda', isDefault: false, hasApiKey: false },
    ]);
  });

  it('chave de perfil: retorna array com um item (proprio perfil)', async () => {
    profileService.getProfileById.mockResolvedValue({
      id: 'prof-2',
      name: 'Honda',
      isDefault: false,
      apiKey: 'enc-key',
    });

    const result = await controller.listProfiles({ id: 'org-1' } as any, 'prof-2');

    expect(result).toEqual([
      { id: 'prof-2', name: 'Honda', isDefault: false, hasApiKey: true },
    ]);
    expect(profileService.getProfilesByOrgId).not.toHaveBeenCalled();
  });

  it('perfil inexistente com chave de perfil: retorna array vazio', async () => {
    profileService.getProfileById.mockResolvedValue(null);

    const result = await controller.listProfiles({ id: 'org-1' } as any, 'prof-inexistente');

    expect(result).toEqual([]);
  });
});
