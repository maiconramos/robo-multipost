import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const UserAgent = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['user-agent'];
  }
);

// Idioma detectado do request. O proxy do frontend ja envia
// `x-i18next-current-language`; caimos em `accept-language` como fallback.
// Usado no cadastro para popular Organization.language.
export const AcceptLanguage = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return (
      request.headers['x-i18next-current-language'] ||
      request.headers['accept-language'] ||
      ''
    );
  }
);
