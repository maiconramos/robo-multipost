import { MetaSystemUserService, SYSTEM_USER_PAGE_TOKEN_TTL } from './meta-system-user.service';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MockProxy } from 'jest-mock-extended';

const integration = {
  id: 'int-1',
  name: 'Pagina X',
  providerIdentifier: 'facebook',
  organizationId: 'org-1',
  profileId: 'prof-1',
  internalId: '755639424460731',
  rootInternalId: '755639424460731',
} as any;

const buildProvider = (overrides: Record<string, any> = {}) => ({
  identifier: 'facebook',
  reConnect: jest.fn().mockResolvedValue({
    id: '755639424460731',
    name: 'Pagina X',
    accessToken: 'EAA-page-token',
    picture: 'https://pic',
    username: '',
  }),
  ...overrides,
});

describe('MetaSystemUserService', () => {
  let service: MetaSystemUserService;
  let credentialService: MockProxy<CredentialService> & CredentialService;

  beforeEach(() => {
    credentialService = createMock<CredentialService>();
    service = new MetaSystemUserService(credentialService);
  });

  describe('resolveHealedToken', () => {
    it('retorna null para provider que nao e facebook/instagram', async () => {
      const provider = buildProvider({ identifier: 'linkedin' });

      const result = await service.resolveHealedToken(
        { ...integration, providerIdentifier: 'linkedin' },
        provider as any
      );

      expect(result).toBeNull();
      expect(credentialService.getSystemUserToken).not.toHaveBeenCalled();
      expect(provider.reConnect).not.toHaveBeenCalled();
    });

    it('retorna null quando o provider nao implementa reConnect', async () => {
      const provider = buildProvider({ reConnect: undefined });

      const result = await service.resolveHealedToken(
        integration,
        provider as any
      );

      expect(result).toBeNull();
      expect(credentialService.getSystemUserToken).not.toHaveBeenCalled();
    });

    it('retorna null quando nao ha token de usuario do sistema configurado', async () => {
      credentialService.getSystemUserToken.mockResolvedValue(undefined);
      const provider = buildProvider();

      const result = await service.resolveHealedToken(
        integration,
        provider as any
      );

      expect(result).toBeNull();
      expect(credentialService.getSystemUserToken).toHaveBeenCalledWith(
        'org-1',
        'prof-1'
      );
      expect(provider.reConnect).not.toHaveBeenCalled();
    });

    it('cura o token via reConnect quando ha token do system user', async () => {
      credentialService.getSystemUserToken.mockResolvedValue('EAA-system');
      const provider = buildProvider();

      const result = await service.resolveHealedToken(
        integration,
        provider as any
      );

      // reConnect resolve pelo 2o argumento (requiredId = internalId)
      expect(provider.reConnect).toHaveBeenCalledWith(
        '755639424460731',
        '755639424460731',
        'EAA-system'
      );
      expect(result).toEqual({
        id: '755639424460731',
        name: 'Pagina X',
        accessToken: 'EAA-page-token',
        picture: 'https://pic',
        username: '',
        refreshToken: 'EAA-page-token',
        expiresIn: SYSTEM_USER_PAGE_TOKEN_TTL,
      });
    });

    it('funciona para instagram passando o ig business account id como requiredId', async () => {
      credentialService.getSystemUserToken.mockResolvedValue('EAA-system');
      const provider = buildProvider({ identifier: 'instagram' });

      const result = await service.resolveHealedToken(
        {
          ...integration,
          providerIdentifier: 'instagram',
          internalId: '17841400000000000',
        },
        provider as any
      );

      expect(provider.reConnect).toHaveBeenCalledWith(
        '17841400000000000',
        '17841400000000000',
        'EAA-system'
      );
      expect(result?.accessToken).toBe('EAA-page-token');
    });

    it('resolve o token sem perfil (org-level) passando profileId undefined', async () => {
      credentialService.getSystemUserToken.mockResolvedValue('EAA-system');
      const provider = buildProvider();

      await service.resolveHealedToken(
        { ...integration, profileId: null },
        provider as any
      );

      expect(credentialService.getSystemUserToken).toHaveBeenCalledWith(
        'org-1',
        undefined
      );
    });

    it('retorna null quando reConnect lanca (pagina fora do business manager)', async () => {
      credentialService.getSystemUserToken.mockResolvedValue('EAA-system');
      const provider = buildProvider({
        reConnect: jest
          .fn()
          .mockRejectedValue(new Error('Page not found in your accounts')),
      });
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      const result = await service.resolveHealedToken(
        integration,
        provider as any
      );

      expect(result).toBeNull();
      // Loga name+message apenas — nunca o objeto de erro cru (poderia
      // carregar o token do system user no corpo da requisicao).
      expect(errorSpy).toHaveBeenCalled();
      expect(String(errorSpy.mock.calls[0][0])).toContain(
        'Page not found in your accounts'
      );
      errorSpy.mockRestore();
    });

    it('retorna null quando a leitura da credencial lanca (credencial ilegivel)', async () => {
      // ENCRYPTION_KEY trocada apos salvar torna o decrypt da credencial
      // facebook ilegivel — o heal deve falhar suave (null) para o caller
      // seguir para o disconnectChannel legado, nunca propagar o throw.
      credentialService.getSystemUserToken.mockRejectedValue(
        new Error('Unsupported state or unable to authenticate data')
      );
      const provider = buildProvider();
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      const result = await service.resolveHealedToken(
        integration,
        provider as any
      );

      expect(result).toBeNull();
      expect(provider.reConnect).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('retorna null quando reConnect devolve sem accessToken', async () => {
      credentialService.getSystemUserToken.mockResolvedValue('EAA-system');
      const provider = buildProvider({
        reConnect: jest.fn().mockResolvedValue({
          id: 'x',
          name: 'y',
          accessToken: '',
          picture: '',
          username: '',
        }),
      });

      const result = await service.resolveHealedToken(
        integration,
        provider as any
      );

      expect(result).toBeNull();
    });
  });
});
