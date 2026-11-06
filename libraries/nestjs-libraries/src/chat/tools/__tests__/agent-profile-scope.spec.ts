jest.mock('../../../database/prisma/profiles/profile.service', () => ({
  ProfileService: class {},
}));
import { resolveAgentProfile } from '../agent-profile-scope';

const context = (profileId?: unknown, org = 'org') => ({
  requestContext: {
    get: (key: string) =>
      ({ organization: JSON.stringify({ id: org }), profileId }[key]),
  },
});
describe('selecao de perfil MCP sem estado compartilhado', () => {
  const profiles = {
    getProfileById: jest.fn(async (org: string, id: string) =>
      org === 'org' && ['a', 'b'].includes(id)
        ? { id, name: id.toUpperCase() }
        : null
    ),
  };
  beforeEach(() => jest.clearAllMocks());
  it('chave de organizacao pode selecionar cada cliente por chamada', async () => {
    const results = await Promise.all(
      ['a', 'b', 'a'].map((id) =>
        resolveAgentProfile(profiles as never, context(), id, true)
      )
    );
    expect(results.map((r) => r.profileId)).toEqual(['a', 'b', 'a']);
    expect(results[0].profile).toEqual({ id: 'a', name: 'A' });
  });
  it('leitura geral continua na organizacao sem resolver Default', async () => {
    expect(
      (await resolveAgentProfile(profiles as never, context())).profileId
    ).toBeUndefined();
    expect(profiles.getProfileById).not.toHaveBeenCalled();
  });
  it('operacao que exige perfil recusa chave geral sem selecao', async () => {
    await expect(
      resolveAgentProfile(profiles as never, context(), undefined, true)
    ).rejects.toThrow('PROFILE_REQUIRED');
    expect(profiles.getProfileById).not.toHaveBeenCalled();
  });
  it('chave de perfil usa o proprio e recusa selecionar outro antes da consulta', async () => {
    expect(
      (await resolveAgentProfile(profiles as never, context('a'), 'a', true))
        .profileId
    ).toBe('a');
    profiles.getProfileById.mockClear();
    await expect(
      resolveAgentProfile(profiles as never, context('a'), 'b')
    ).rejects.toThrow('PROFILE_KEY_MISMATCH');
    expect(profiles.getProfileById).not.toHaveBeenCalled();
  });
  it('perfil desconhecido ou de outra organizacao falha fechado', async () => {
    await expect(
      resolveAgentProfile(profiles as never, context(), 'foreign')
    ).rejects.toThrow('PROFILE_NOT_FOUND');
    await expect(
      resolveAgentProfile(
        profiles as never,
        context(undefined, 'other-org'),
        'a'
      )
    ).rejects.toThrow('PROFILE_NOT_FOUND');
  });
  it.each(['', 10, {}, []])(
    'contexto autenticado malformado nunca amplia escopo %p',
    async (value) => {
      await expect(
        resolveAgentProfile(profiles as never, context(value), 'b')
      ).rejects.toThrow('INVALID_PROFILE_CONTEXT');
    }
  );
});
