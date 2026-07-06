import { EmailService } from './email.service';

describe('EmailService', () => {
  const OLD_ENV = process.env;
  let service: EmailService;
  let sent: jest.Mock;

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      EMAIL_FROM_ADDRESS: 'from@x.com',
      EMAIL_FROM_NAME: 'Robo',
    };
    service = new EmailService({} as any);
    sent = jest.fn().mockResolvedValue('ok');
    // Substitui o provider (EmptyProvider) por um mock que captura o HTML final.
    (service as any).emailService = {
      name: 'mock',
      validateEnvKeys: [],
      sendEmail: sent,
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  describe('sendEmailSync', () => {
    it('renderiza o rodape no idioma informado (en) e mantem o corpo', async () => {
      await service.sendEmailSync(
        'to@x.com',
        'Assunto',
        '<p>corpo</p>',
        undefined,
        'en'
      );

      const html = sent.mock.calls[0][2] as string;
      expect(html).toContain('You can change your notification preferences');
      expect(html).toContain('<p>corpo</p>');
    });

    it('renderiza o rodape em pt quando lang pt', async () => {
      await service.sendEmailSync(
        'to@x.com',
        'Assunto',
        '<p>corpo</p>',
        undefined,
        'pt'
      );

      const html = sent.mock.calls[0][2] as string;
      expect(html).toContain('preferências de notificação');
    });

    it('nao envia para destinatario sem @', async () => {
      await service.sendEmailSync('invalido', 'Assunto', '<p>x</p>');
      expect(sent).not.toHaveBeenCalled();
    });
  });
});
