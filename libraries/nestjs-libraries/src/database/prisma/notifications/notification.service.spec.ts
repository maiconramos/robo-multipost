import { NotificationService } from './notification.service';

const makeRepo = () => ({
  createNotification: jest.fn(),
  getMainPageCount: jest.fn(),
  getNotifications: jest.fn(),
  getNotificationsPaginated: jest.fn(),
});

const makeEmail = () => ({
  sendEmail: jest.fn(),
  hasProvider: jest.fn().mockReturnValue(true),
});

const makeOrgRepo = () => ({
  getLanguage: jest.fn().mockResolvedValue({ language: 'en' }),
  getUsersForNotification: jest.fn().mockResolvedValue([]),
});

const makeTemporal = () => {
  const signalWithStart = jest.fn();
  return {
    signalWithStart,
    service: {
      client: {
        getRawClient: () => ({ workflow: { signalWithStart } }),
      },
    },
  };
};

describe('NotificationService', () => {
  let service: NotificationService;
  let repo: ReturnType<typeof makeRepo>;
  let email: ReturnType<typeof makeEmail>;
  let orgRepo: ReturnType<typeof makeOrgRepo>;
  let temporal: ReturnType<typeof makeTemporal>;

  const payload = {
    subjectKey: 'notif_post_error_subject',
    messageKey: 'notif_post_error',
    params: { provider: 'X' },
    profileId: 'prof-1',
  };

  beforeEach(() => {
    repo = makeRepo();
    email = makeEmail();
    orgRepo = makeOrgRepo();
    temporal = makeTemporal();
    service = new NotificationService(
      repo as any,
      email as any,
      orgRepo as any,
      temporal.service as any
    );
  });

  describe('inAppNotification', () => {
    it('grava contentKey params e profileId renderizando content no idioma da org', async () => {
      await service.inAppNotification('org-1', payload, false, false, 'fail');

      expect(orgRepo.getLanguage).toHaveBeenCalledWith('org-1');
      expect(repo.createNotification).toHaveBeenCalledWith(
        'org-1',
        expect.stringContaining('posting on X'),
        {
          contentKey: 'notif_post_error',
          contentParams: { provider: 'X' },
          profileId: 'prof-1',
        }
      );
    });

    it('nao envia e-mail quando sendEmail false', async () => {
      await service.inAppNotification('org-1', payload, false);

      expect(email.sendEmail).not.toHaveBeenCalled();
      expect(temporal.signalWithStart).not.toHaveBeenCalled();
    });

    it('enfileira digest com chave params e profileId quando digest true', async () => {
      await service.inAppNotification('org-1', payload, true, true, 'success');

      expect(temporal.signalWithStart).toHaveBeenCalledWith(
        'digestEmailWorkflow',
        expect.objectContaining({
          signal: 'email',
          signalArgs: [
            [
              expect.objectContaining({
                messageKey: 'notif_post_error',
                subjectKey: 'notif_post_error_subject',
                profileId: 'prof-1',
                type: 'success',
              }),
            ],
          ],
        })
      );
      expect(email.sendEmail).not.toHaveBeenCalled();
    });

    it('envia e-mail imediato escopado pelo perfil do payload', async () => {
      orgRepo.getUsersForNotification.mockResolvedValue([
        { email: 'a@b.com', sendSuccessEmails: true, sendFailureEmails: true },
      ]);

      await service.inAppNotification('org-1', payload, true, false, 'fail');

      expect(orgRepo.getUsersForNotification).toHaveBeenCalledWith(
        'org-1',
        'prof-1'
      );
      expect(email.sendEmail).toHaveBeenCalledWith(
        'a@b.com',
        expect.any(String),
        expect.stringContaining('posting on X'),
        'top',
        undefined,
        'en'
      );
    });
  });

  describe('sendEmailsToOrg', () => {
    it('respeita a preferencia sendFailureEmails para o tipo fail', async () => {
      orgRepo.getUsersForNotification.mockResolvedValue([
        { email: 'skip@b.com', sendSuccessEmails: true, sendFailureEmails: false },
        { email: 'send@b.com', sendSuccessEmails: false, sendFailureEmails: true },
      ]);

      await service.sendEmailsToOrg('org-1', payload, 'fail', 'en');

      expect(email.sendEmail).toHaveBeenCalledTimes(1);
      expect(email.sendEmail).toHaveBeenCalledWith(
        'send@b.com',
        expect.any(String),
        expect.any(String),
        'top',
        undefined,
        'en'
      );
    });

    it('tipo info ignora preferencias e envia a todos os destinatarios', async () => {
      orgRepo.getUsersForNotification.mockResolvedValue([
        { email: 'a@b.com', sendSuccessEmails: false, sendFailureEmails: false },
        { email: 'c@d.com', sendSuccessEmails: false, sendFailureEmails: false },
      ]);

      await service.sendEmailsToOrg('org-1', payload, 'info', 'en');

      expect(email.sendEmail).toHaveBeenCalledTimes(2);
    });
  });
});
