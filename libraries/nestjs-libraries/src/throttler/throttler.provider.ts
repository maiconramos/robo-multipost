import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { isIP } from 'net';
import { extractBasicCredentials } from '@gitroom/nestjs-libraries/chat/oauth-types';

const canonicalPath = (req: { path?: string; url?: string }) =>
  (req.path || req.url?.split('?')[0] || '')
    .toLowerCase()
    .replace(/^\/api(?=\/)/, '')
    .replace(/\/+$/, '');

// rotas sensiveis com orcamento proprio: troca de codigo OAuth (segredo do
// cliente sem login, contra forca bruta) e o teste manual de feed do autopost
// (download de URL externa)
const sensitiveBucket = (req: {
  method?: string;
  path?: string;
  url?: string;
}) => {
  if (req.method !== 'POST') {
    return undefined;
  }
  const route = canonicalPath(req);
  if (route === '/oauth/token') {
    return 'oauth';
  }
  if (route === '/autopost/send') {
    return 'autopost-send';
  }
  return undefined;
};

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const route = canonicalPath(req);
    const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const publicPosts =
      req.method === 'POST' && /^\/public\/v1\/posts(?:\/|$)/.test(route);
    const automation =
      /^(?:\/public\/v1)?\/(?:automations|flows|flows-v2|post-management)(?:\/|$)/.test(
        route
      ) || /^\/facebook-automations(?:\/|$)/.test(route);
    const historyRead =
      ['GET', 'HEAD'].includes(req.method) &&
      (/^\/public\/v1\/automations\/[^/]+\/history(?:\/[^/]+)?$/.test(route) ||
        /^\/automation-history\/(?:instagram|shared)\/[^/]+(?:\/[^/]+)?$/.test(
          route
        ));
    const resource = req.query?.resource;
    const remoteRead =
      req.method === 'GET' &&
      (/\/(?:posts|stories|readiness|check|webhook-status)$/.test(route) ||
        (route.endsWith('/options') &&
          ['posts', 'stories', 'readiness', 'resolve_post'].includes(
            String(resource)
          )));
    // Webhooks have their own signature/authentication; this policy only covers
    // authenticated automation routes and preserves the existing posts budget.
    if (
      publicPosts ||
      historyRead ||
      !!sensitiveBucket(req) ||
      (automation && (mutation || remoteRead))
    ) {
      return super.canActivate(context);
    }
    return true;
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    const sensitive = sensitiveBucket(req);
    if (sensitive === 'oauth') {
      // sem login e atras de proxy (sem trust proxy o req.ip e o do nginx):
      // conta por app cliente, nao por IP — um balde global deixaria qualquer
      // um bloquear a troca de token de todos os apps
      const clientId =
        extractBasicCredentials(req.headers?.authorization)?.clientId ||
        (typeof req.body?.client_id === 'string' ? req.body.client_id : '');
      return 'oauth_client_' + (clientId.slice(0, 120) || 'unknown');
    }
    const identity = req.org?.id || req.ip;
    if (sensitive) {
      return identity + '_' + sensitive;
    }
    return (
      identity +
      '_' +
      (/^\/public\/v1\/posts(?:\/|$)/.test(canonicalPath(req))
        ? 'posts'
        : 'other')
    );
  }
}

// Teto global por rota: segura o custo mesmo que o limite por cliente seja
// contornado (x-forwarded-for forjado num proxy que so acrescenta o IP).
export const REAL_IP_GLOBAL_CEILING_FACTOR = 10;

const FARCASTER_PROVIDER = 'FARCASTER';

// Guard por rota para endpoints que criam custo fora (porte do upstream
// #2078): conta pelo IP do cliente, nao pela org que o guard global usa.
// Aplicar com `@UseGuards(ThrottlerRealIpGuard)` + `@Throttle(...)`.
// O IP vem do primeiro x-forwarded-for, o que so e confiavel quando o proxy da
// frente sobrescreve o header: em producao o Traefik troca o XFF nao confiavel
// pelo IP do cliente e o nginx do container acrescenta o dele
// (`$proxy_add_x_forwarded_for`), entao o primeiro item e o cliente real. Valor
// que nao e IP cai no req.ip (sem chave arbitraria no Redis).
@Injectable()
export class ThrottlerRealIpGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    return `ip:${isIP(forwarded) ? forwarded : req.ip}`;
  }

  // teto global por rota (desligado no login: ver ThrottlerLocalLoginGuard)
  protected readonly withGlobalCeiling: boolean = true;

  protected override async handleRequest(
    requestProps: ThrottlerRequest
  ): Promise<boolean> {
    const allowed = await super.handleRequest(requestProps);
    if (!this.withGlobalCeiling) {
      return allowed;
    }
    // sem headers no teto global: os X-RateLimit-* ficam os do cliente
    return super.handleRequest({
      ...requestProps,
      throttler: { ...requestProps.throttler, setHeaders: false },
      limit: requestProps.limit * REAL_IP_GLOBAL_CEILING_FACTOR,
      getTracker: async () => 'all',
    });
  }
}

// Rotas autenticadas que criam custo fora: conta por org + usuario (o
// AuthMiddleware ja preencheu req.org/req.user), com o mesmo teto global.
@Injectable()
export class ThrottlerOrgUserGuard extends ThrottlerRealIpGuard {
  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    if (req.org?.id && req.user?.id) {
      return `org:${req.org.id}:user:${req.user.id}`;
    }
    return super.getTracker(req);
  }
}

// Troca do code do login social (/auth/oauth/:provider/exists, /auth/login,
// /auth/register): limita so quando o provider e FARCASTER — os demais logins
// seguem sem este limite.
@Injectable()
export class ThrottlerFarcasterLoginGuard extends ThrottlerRealIpGuard {
  protected override async shouldSkip(
    context: ExecutionContext
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const provider = String(
      req.params?.provider || req.body?.provider || ''
    ).toUpperCase();
    return provider !== FARCASTER_PROVIDER;
  }
}

// Login por senha (provider LOCAL): conta por IP do cliente, com orcamento
// proprio (o @Throttle da rota e o do Farcaster). Sem teto global de proposito:
// um teto unico deixaria qualquer um bloquear o login de todo mundo.
export const LOCAL_LOGIN_LIMIT = 20;
export const LOCAL_LOGIN_TTL_MS = 10 * 60_000;

@Injectable()
export class ThrottlerLocalLoginGuard extends ThrottlerRealIpGuard {
  protected override async shouldSkip(
    context: ExecutionContext
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const provider = String(req.body?.provider || 'LOCAL').toUpperCase();
    return provider !== 'LOCAL';
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    return `local-login:${await super.getTracker(req)}`;
  }

  protected override readonly withGlobalCeiling = false;

  protected override async handleRequest(
    requestProps: ThrottlerRequest
  ): Promise<boolean> {
    return super.handleRequest({
      ...requestProps,
      limit: LOCAL_LOGIN_LIMIT,
      ttl: LOCAL_LOGIN_TTL_MS,
    });
  }
}
