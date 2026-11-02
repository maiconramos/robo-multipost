import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * redirectUrl de app OAuth: so http(s). A tela de consentimento navega para
 * esse endereco (window.location.href) no Autorizar e no Negar; um
 * `javascript:` cadastrado por outra org rodaria no dominio da app com a
 * sessao de quem clicou. Apps salvos antes da validacao no DTO tambem passam
 * por aqui antes de cada redirecionamento.
 */
export const OAUTH_REDIRECT_PROTOCOLS = ['http', 'https'];

export function oauthRedirectUrl(value: unknown): URL {
  let url: URL | null = null;
  try {
    url = typeof value === 'string' ? new URL(value) : null;
  } catch {
    url = null;
  }
  if (!url || !OAUTH_REDIRECT_PROTOCOLS.includes(url.protocol.replace(/:$/, ''))) {
    throw new HttpException(
      { error: 'invalid_request', error_description: 'Invalid redirect_uri' },
      HttpStatus.BAD_REQUEST
    );
  }
  return url;
}
