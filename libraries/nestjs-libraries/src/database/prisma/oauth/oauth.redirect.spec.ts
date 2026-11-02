import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { oauthRedirectUrl } from './oauth.redirect';
import { CreateOAuthAppDto } from '@gitroom/nestjs-libraries/dtos/oauth/create-oauth-app.dto';
import { UpdateOAuthAppDto } from '@gitroom/nestjs-libraries/dtos/oauth/update-oauth-app.dto';

describe('oauthRedirectUrl', () => {
  it.each(['https://app.exemplo.com/callback', 'http://localhost:3000/cb'])(
    'aceita %s',
    (value) => {
      expect(oauthRedirectUrl(value).toString()).toContain(value.split('?')[0]);
    }
  );

  it.each([
    'javascript:alert(document.domain)',
    'javascript:443/%0aalert(document.domain)//',
    'data:text/html,<script>alert(1)</script>',
    'nao e url',
    undefined,
  ])('recusa %p', (value) => {
    expect(() => oauthRedirectUrl(value)).toThrow();
  });
});

describe('DTOs de app OAuth - redirectUrl', () => {
  const base = { name: 'App' };

  it('cadastro recusa esquema javascript:', async () => {
    const dto = plainToInstance(CreateOAuthAppDto, {
      ...base,
      redirectUrl: 'javascript:443/%0aalert(document.domain)//',
    });
    expect((await validate(dto)).some((e) => e.property === 'redirectUrl')).toBe(true);
  });

  it('cadastro aceita https', async () => {
    const dto = plainToInstance(CreateOAuthAppDto, {
      ...base,
      redirectUrl: 'https://app.exemplo.com/callback',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('edicao recusa url sem protocolo http(s)', async () => {
    const dto = plainToInstance(UpdateOAuthAppDto, {
      redirectUrl: 'ftp://exemplo.com/cb',
    });
    expect((await validate(dto)).some((e) => e.property === 'redirectUrl')).toBe(true);
  });
});
