import {
  emailT,
  normalizeLang,
  resolveOrgLang,
  renderDigestEmail,
} from '@gitroom/nestjs-libraries/emails/i18n/email.i18n';
import {
  CATALOG,
  NOTIFICATION_MESSAGE_KEYS,
} from '@gitroom/nestjs-libraries/emails/i18n/catalog';
import * as fs from 'fs';
import * as path from 'path';

function loadFrontendLocale(lang: string): Record<string, string> {
  const file = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'react-shared-libraries',
    'src',
    'translation',
    'locales',
    lang,
    'translation.json'
  );
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

describe('emailT', () => {
  it('traduz chave existente no idioma pedido', () => {
    expect(emailT('email_reset_subject', 'en')).toBe('Reset your password');
    expect(emailT('email_reset_subject', 'pt')).toBe('Redefina sua senha');
  });

  it('interpola params no template', () => {
    const html = emailT('email_reset_html', 'en', {
      link: 'http://x/y',
      minutes: 20,
    });
    expect(html).toContain('http://x/y');
    expect(html).toContain('20 minutes');
  });

  it('remove placeholder quando param ausente', () => {
    const out = emailT('notif_post_error', 'en', { provider: 'X' });
    expect(out).toContain('posting on X');
    expect(out).not.toContain('{{error}}');
  });

  it('faz fallback para pt quando idioma nao suportado', () => {
    expect(emailT('email_reset_subject', 'fr')).toBe('Redefina sua senha');
  });

  it('retorna a propria chave quando inexistente', () => {
    expect(emailT('chave_inexistente_123', 'en')).toBe('chave_inexistente_123');
  });

  it('escapa HTML nos valores interpolados (anti-XSS)', () => {
    const out = emailT('notif_post_error', 'en', {
      provider: '<img src=x onerror=alert(1)>',
    });
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    // o HTML proposital do proprio template continua intacto
    expect(emailT('email_reset_html', 'en', { link: 'http://x' })).toContain(
      '<a href="http://x">'
    );
  });
});

describe('normalizeLang', () => {
  it('reduz regiao para o codigo base suportado', () => {
    expect(normalizeLang('pt-BR')).toBe('pt');
    expect(normalizeLang('en-US')).toBe('en');
  });

  it('default pt quando vazio ou nao suportado', () => {
    expect(normalizeLang(undefined)).toBe('pt');
    expect(normalizeLang('zz')).toBe('pt');
  });

  it('lida com Accept-Language com q-values e multiplas tags', () => {
    expect(normalizeLang('en;q=0.9,fr;q=0.8')).toBe('en');
    expect(normalizeLang('pt-BR,en;q=0.9')).toBe('pt');
  });
});

describe('resolveOrgLang', () => {
  it('resolve do campo language da org com fallback pt', () => {
    expect(resolveOrgLang({ language: 'en' })).toBe('en');
    expect(resolveOrgLang({ language: null })).toBe('pt');
    expect(resolveOrgLang(null)).toBe('pt');
  });
});

describe('renderDigestEmail', () => {
  it('usa o assunto do item unico quando ha so um', () => {
    const { subject, html } = renderDigestEmail(
      [
        {
          subjectKey: 'notif_streak_subject',
          messageKey: 'notif_streak',
          type: 'info',
        },
      ],
      'en'
    );
    expect(subject).toBe('Streak Reminder');
    expect(html).toContain('lose your streak');
  });

  it('usa assunto de digest e junta mensagens quando ha varios', () => {
    const { subject, html } = renderDigestEmail(
      [
        {
          messageKey: 'notif_post_published',
          params: { provider: 'X', url: 'u' },
          type: 'success',
        },
        { messageKey: 'notif_streak', type: 'info' },
      ],
      'en'
    );
    expect(subject).toBe('[Multipost] Your latest notifications');
    expect(html).toContain('<br/>');
  });
});

describe('paridade de chaves de notificacao backend x frontend', () => {
  const ptFront = loadFrontendLocale('pt');
  const enFront = loadFrontendLocale('en');

  it.each([...NOTIFICATION_MESSAGE_KEYS])(
    'chave %s existe no catalogo backend (pt e en)',
    (key) => {
      expect(CATALOG.pt[key]).toBeDefined();
      expect(CATALOG.en[key]).toBeDefined();
    }
  );

  it.each([...NOTIFICATION_MESSAGE_KEYS])(
    'chave %s existe no translation.json do frontend (pt e en)',
    (key) => {
      expect(ptFront[key]).toBeDefined();
      expect(enFront[key]).toBeDefined();
    }
  );
});
