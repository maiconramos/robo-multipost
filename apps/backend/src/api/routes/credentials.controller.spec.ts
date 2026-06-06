import { CredentialsController } from './credentials.controller';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';
import { InstagramMessagingService } from '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MockProxy } from 'jest-mock-extended';
import { Organization } from '@prisma/client';

describe('CredentialsController', () => {
  let controller: CredentialsController;
  let credentialService: MockProxy<CredentialService> & CredentialService;
  let messaging: MockProxy<InstagramMessagingService> &
    InstagramMessagingService;

  const org = { id: 'org-1' } as Organization;

  beforeEach(() => {
    credentialService = createMock<CredentialService>();
    messaging = createMock<InstagramMessagingService>();
    controller = new CredentialsController(credentialService, messaging);
  });

  describe('saveMessagingTokens', () => {
    it('preserva a conta ja registrada ao adicionar uma segunda conta sem reenviar o token antiga (regressao: conta antiga sumia)', async () => {
      // A conta A ja esta salva com seu token. O frontend nunca recebe o token
      // (e redacted no GET), entao ao adicionar a conta B ele remonta a lista
      // com a conta A SEM token.
      const accountA = {
        igUserId: 'A',
        username: 'almafitnessx',
        token: 'tokenA',
        refreshedAt: '2026-05-01T00:00:00.000Z',
        validatedAt: '2026-05-01T00:00:00.000Z',
      };
      credentialService.getMessagingTokens.mockResolvedValue({
        instagramTokens: [accountA],
      } as any);
      messaging.validateIgUserToken.mockResolvedValue({
        ok: true,
        igUserId: 'B',
        username: 'segundaconta',
      } as any);

      await controller.saveMessagingTokens(org, null, {
        instagramTokens: [
          // conta A remontada pelo frontend, SEM token
          { igUserId: 'A', username: 'almafitnessx' } as any,
          // conta B nova, com token
          { igUserId: 'B', username: 'segundaconta', token: 'tokenB' },
        ],
      });

      expect(credentialService.updateMessagingTokens).toHaveBeenCalledTimes(1);
      const updates =
        credentialService.updateMessagingTokens.mock.calls[0][2];
      const saved = updates.instagramTokens || [];

      // As DUAS contas devem ser persistidas
      expect(saved).toHaveLength(2);
      const savedA = saved.find((t: any) => t.igUserId === 'A');
      const savedB = saved.find((t: any) => t.igUserId === 'B');

      // conta A preservada integralmente (token original intacto)
      expect(savedA).toBeDefined();
      expect(savedA.token).toBe('tokenA');
      expect(savedA.refreshedAt).toBe('2026-05-01T00:00:00.000Z');

      // conta B validada e adicionada
      expect(savedB).toBeDefined();
      expect(savedB.token).toBe('tokenB');
    });

    it('nao revalida a conta antiga sem token (so valida o token novo)', async () => {
      credentialService.getMessagingTokens.mockResolvedValue({
        instagramTokens: [
          {
            igUserId: 'A',
            username: 'a',
            token: 'tokenA',
            refreshedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
      } as any);
      messaging.validateIgUserToken.mockResolvedValue({
        ok: true,
        igUserId: 'B',
        username: 'b',
      } as any);

      await controller.saveMessagingTokens(org, null, {
        instagramTokens: [
          { igUserId: 'A', username: 'a' } as any,
          { igUserId: 'B', username: 'b', token: 'tokenB' },
        ],
      });

      expect(messaging.validateIgUserToken).toHaveBeenCalledTimes(1);
      expect(messaging.validateIgUserToken).toHaveBeenCalledWith('tokenB');
    });

    it('mantem prior preservando refreshedAt quando o token reenviado e igual ao armazenado', async () => {
      credentialService.getMessagingTokens.mockResolvedValue({
        instagramTokens: [
          {
            igUserId: 'A',
            username: 'a',
            token: 'tokenA',
            refreshedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
      } as any);

      await controller.saveMessagingTokens(org, null, {
        instagramTokens: [{ igUserId: 'A', username: 'a', token: 'tokenA' }],
      });

      expect(messaging.validateIgUserToken).not.toHaveBeenCalled();
      const updates =
        credentialService.updateMessagingTokens.mock.calls[0][2];
      expect(updates.instagramTokens).toHaveLength(1);
      expect(updates.instagramTokens![0].refreshedAt).toBe(
        '2026-05-01T00:00:00.000Z'
      );
    });

    it('descarta entrada sem token quando nao existe conta previa com aquele igUserId', async () => {
      credentialService.getMessagingTokens.mockResolvedValue({
        instagramTokens: [],
      } as any);

      await controller.saveMessagingTokens(org, null, {
        instagramTokens: [{ igUserId: 'fantasma', username: 'x' } as any],
      });

      const updates =
        credentialService.updateMessagingTokens.mock.calls[0][2];
      expect(updates.instagramTokens).toHaveLength(0);
    });
  });
});
