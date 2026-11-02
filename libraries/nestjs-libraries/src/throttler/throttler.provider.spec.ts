import 'reflect-metadata';
import {
  Controller,
  Get,
  Post,
  Put,
  INestApplication,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import {
  LOCAL_LOGIN_EMAIL_LIMIT,
  LOCAL_LOGIN_LIMIT,
  REAL_IP_GLOBAL_CEILING_FACTOR,
  ThrottlerBehindProxyGuard,
  ThrottlerFarcasterLoginGuard,
  ThrottlerLocalLoginGuard,
  ThrottlerOrgUserGuard,
  ThrottlerRealIpGuard,
} from './throttler.provider';

@Controller()
@Throttle({ default: { limit: 1, ttl: 60_000 } })
class Routes {
  @Post('/public/v1/automations') create() {
    return {};
  }
  @Put('/public/v1/post-management/:id') update() {
    return {};
  }
  @Get('/public/v1/automations/options') options() {
    return {};
  }
  @Get('/public/v1/automations/:id/history') history() {
    return {};
  }
  @Get('/public/v1/automations/:id/history/:executionId') executionDetail() {
    return {};
  }
  @Get('/automation-history/:engine/:id') privateHistory() {
    return {};
  }
  @Get('/automation-history/:engine/:id/:executionId')
  privateExecutionDetail() {
    return {};
  }
  @Get('/public/v1/automations/capabilities') capabilities() {
    return {};
  }
  @Get('/flows-v2/channels/:id/readiness') readiness() {
    return {};
  }
  @Get('/flows/integrations/:id/webhook-status') webhookStatus() {
    return {};
  }
  @Post('/flows/quick-create') quick() {
    return {};
  }
  @Post('/public/v1/posts') post() {
    return {};
  }
  @Post('/public/facebook-automations/:app') webhook() {
    return {};
  }
  @Post('/oauth/token') token() {
    return {};
  }
  @Post('/autopost/send') autopostSend() {
    return {};
  }
  @Post('/autopost') autopostCreate() {
    return {};
  }
}
describe('limites HTTP das automacoes', () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1 }])],
      controllers: [Routes],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.org = { id: req.headers['x-fixture-org'] || 'fixture-org' };
      next();
    });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  const request = async (path: string, method = 'GET', org = 'fixture-org') => {
    const response = await fetch(url + path, {
      method,
      headers: { 'x-fixture-org': org },
    });
    await response.text();
    return response.status;
  };
  it.each([
    ['/public/v1/automations', 'POST'],
    ['/public/v1/post-management/id', 'PUT'],
    ['/public/v1/automations/options?resource=posts', 'GET'],
    ['/flows/integrations/id/webhook-status', 'GET'],
    ['/flows-v2/channels/id/readiness/', 'GET'],
    ['/FLOWS-V2/channels/id/readiness', 'GET'],
    ['/public/v1/automations/options/?resource=posts', 'GET'],
    ['/flows-v2/channels/id/readiness', 'GET'],
    ['/flows/quick-create', 'POST'],
    ['/public/v1/posts', 'POST'],
    ['/public/v1/automations/id/history', 'GET'],
    ['/PUBLIC/v1/AUTOMATIONS/id/HISTORY/exec/', 'GET'],
    ['/automation-history/instagram/id/', 'GET'],
    ['/AUTOMATION-HISTORY/shared/id/exec', 'GET'],
  ])('aplica 429 e isola organizacoes em %s', async (path, method) => {
    const org = 'org-' + path;
    expect(await request(path, method, org)).toBe(
      method === 'POST' ? 201 : 200
    );
    expect(await request(path, method, org)).toBe(429);
    expect(await request(path, method, org + '-other')).toBe(
      method === 'POST' ? 201 : 200
    );
  });
  it.each([
    '/public/v1/automations/id/history',
    '/public/v1/automations/id/history/exec',
    '/automation-history/instagram/id',
    '/automation-history/shared/id/exec',
  ])('HEAD e GET compartilham o limite do historico em %s', async (path) => {
    const org = 'head-' + path;
    expect(await request(path, 'HEAD', org)).toBe(200);
    expect(await request(path.toUpperCase() + '/', 'GET', org)).toBe(429);
  });
  it.each([
    '/public/v1/automations/capabilities',
    '/public/v1/automations/options?resource=integrations',
  ])('nao limita leituras locais %s', async (path) => {
    expect(await request(path)).toBe(200);
    expect(await request(path)).toBe(200);
  });
  it('mantem o mesmo orcamento ao alternar caixa e query sem efeito', async () => {
    expect(await request('/public/v1/posts', 'POST', 'case-fixture')).toBe(201);
    expect(await request('/public/v1/POSTS', 'POST', 'case-fixture')).toBe(429);
    expect(
      await request('/public/v1/automations', 'POST', 'query-fixture')
    ).toBe(201);
    expect(
      await request(
        '/public/v1/automations?unused=/posts',
        'POST',
        'query-fixture'
      )
    ).toBe(429);
  });
  it('nao captura webhook publico da Meta', async () => {
    expect(await request('/public/facebook-automations/app', 'POST')).toBe(201);
    expect(await request('/public/facebook-automations/app', 'POST')).toBe(201);
  });
  const tokenRequest = async (clientId: string) => {
    const response = await fetch(url + '/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    });
    await response.text();
    return response.status;
  };

  it('troca de codigo OAuth conta por app cliente (nao por IP do proxy)', async () => {
    expect(await tokenRequest('pcd_app_a')).toBe(201);
    expect(await tokenRequest('pcd_app_a')).toBe(429);
    // outro app nao e bloqueado por quem martela o primeiro
    expect(await tokenRequest('pcd_app_b')).toBe(201);
  });

  it('client_secret_basic conta pelo client_id do header', async () => {
    const basic = (id: string) =>
      fetch(url + '/oauth/token', {
        method: 'POST',
        headers: {
          authorization:
            'Basic ' + Buffer.from(`${id}:segredo`).toString('base64'),
        },
      }).then(async (r) => {
        await r.text();
        return r.status;
      });
    expect(await basic('pcd_basic_a')).toBe(201);
    expect(await basic('pcd_basic_a')).toBe(429);
    // mesmo app pelo corpo cai no mesmo balde
    expect(await tokenRequest('pcd_basic_a')).toBe(429);
    expect(await basic('pcd_basic_b')).toBe(201);
  });

  it('teste de feed do autopost tem orcamento proprio', async () => {
    expect(await request('/autopost/send', 'POST', 'oauth-fixture')).toBe(201);
    expect(await request('/autopost/send', 'POST', 'oauth-fixture')).toBe(429);
    // o resto do autopost nao e limitado
    expect(await request('/autopost', 'POST', 'oauth-fixture')).toBe(201);
    expect(await request('/autopost', 'POST', 'oauth-fixture')).toBe(201);
  });
});

@Controller()
class PublicRoutes {
  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Post('/auth/farcaster/signer')
  signer() {
    return {};
  }

  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Post('/auth/farcaster/signer/status')
  status() {
    return {};
  }

  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Get('/auth/headers')
  headers() {
    return {};
  }

  @UseGuards(ThrottlerOrgUserGuard)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Post('/integrations/farcaster/signer')
  channel() {
    return {};
  }

  @UseGuards(ThrottlerFarcasterLoginGuard)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Post('/auth/oauth/:provider/exists')
  exists() {
    return {};
  }

  @UseGuards(ThrottlerFarcasterLoginGuard)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Post('/auth/register')
  register() {
    return {};
  }
}

// upstream #2078: rotas do Farcaster limitadas por cliente (IP que o proxy
// repassa, ou org/usuario nas autenticadas) + teto global do fork, ja que o
// x-forwarded-for e forjavel quando o proxy nao o sobrescreve
describe('guards de limite do Farcaster', () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [PublicRoutes],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      if (req.headers['x-fixture-org']) {
        req.org = { id: req.headers['x-fixture-org'] };
        req.user = { id: req.headers['x-fixture-user'] };
      }
      next();
    });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  const call = async (
    path: string,
    {
      method = 'POST',
      forwardedFor = '',
      headers = {},
      body,
    }: {
      method?: string;
      forwardedFor?: string;
      headers?: Record<string, string>;
      body?: unknown;
    } = {}
  ) => {
    const response = await fetch(url + path, {
      method,
      headers: {
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    await response.text();
    return response;
  };

  it('limita cada cliente pelo primeiro IP do x-forwarded-for', async () => {
    const path = '/auth/farcaster/signer';
    expect((await call(path, { forwardedFor: '203.0.113.1, 10.0.0.2' })).status).toBe(201);
    expect((await call(path, { forwardedFor: '203.0.113.1, 10.0.0.3' })).status).toBe(429);
    expect((await call(path, { forwardedFor: '203.0.113.2, 10.0.0.2' })).status).toBe(201);
  });

  it('teto global por rota segura quem troca o x-forwarded-for a cada chamada', async () => {
    // a rota de status tem contador proprio (outro handler)
    const statuses: number[] = [];
    for (let i = 0; i <= REAL_IP_GLOBAL_CEILING_FACTOR; i++) {
      statuses.push(
        (
          await call('/auth/farcaster/signer/status', {
            forwardedFor: `198.51.100.${i}`,
          })
        ).status
      );
    }
    expect(statuses.slice(0, REAL_IP_GLOBAL_CEILING_FACTOR)).toEqual(
      Array(REAL_IP_GLOBAL_CEILING_FACTOR).fill(201)
    );
    expect(statuses[REAL_IP_GLOBAL_CEILING_FACTOR]).toBe(429);
  });

  it('x-forwarded-for que nao e IP cai no IP da conexao (sem chave arbitraria)', async () => {
    const path = '/auth/farcaster/signer';
    // sem IP valido, todas as chamadas abaixo contam como o mesmo cliente
    // (127.0.0.1): a primeira passa, as seguintes batem no limite
    expect((await call(path, { forwardedFor: 'lixo-1' })).status).toBe(201);
    expect((await call(path, { forwardedFor: 'lixo-2' })).status).toBe(429);
    expect((await call(path, { forwardedFor: '' })).status).toBe(429);
  });

  it('mantem os X-RateLimit-* do cliente (o teto global nao sobrescreve)', async () => {
    const response = await call('/auth/headers', {
      method: 'GET',
      forwardedFor: '192.0.2.10',
    });
    expect(response.headers.get('x-ratelimit-limit')).toBe('2');
    expect(response.headers.get('x-ratelimit-remaining')).toBe('1');
  });

  it('rotas autenticadas contam por org + usuario', async () => {
    const path = '/integrations/farcaster/signer';
    const as = (org: string, user: string) => ({
      headers: { 'x-fixture-org': org, 'x-fixture-user': user },
    });
    expect((await call(path, as('org-a', 'user-1'))).status).toBe(201);
    expect((await call(path, as('org-a', 'user-1'))).status).toBe(429);
    expect((await call(path, as('org-a', 'user-2'))).status).toBe(201);
    expect((await call(path, as('org-b', 'user-1'))).status).toBe(201);
  });

  it('troca do code so e limitada para o provider FARCASTER', async () => {
    const exists = (provider: string) =>
      call(`/auth/oauth/${provider}/exists`, { forwardedFor: '192.0.2.20' });
    expect((await exists('GOOGLE')).status).toBe(201);
    expect((await exists('GOOGLE')).status).toBe(201);
    expect((await exists('FARCASTER')).status).toBe(201);
    expect((await exists('farcaster')).status).toBe(429);

    const register = (provider: string) =>
      call('/auth/register', {
        forwardedFor: '192.0.2.21',
        body: { provider },
      });
    expect((await register('LOCAL')).status).toBe(201);
    expect((await register('LOCAL')).status).toBe(201);
    expect((await register('FARCASTER')).status).toBe(201);
    expect((await register('FARCASTER')).status).toBe(429);
  });
});

@Controller()
class LocalLoginRoutes {
  @UseGuards(ThrottlerFarcasterLoginGuard, ThrottlerLocalLoginGuard)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Post('/auth/login')
  login() {
    return {};
  }
}

describe('limite do login por senha (LOCAL)', () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [LocalLoginRoutes],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard }],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  const login = async (ip: string, provider = 'LOCAL', email = 'a@b.com') => {
    const response = await fetch(url + '/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ provider, email, password: 'x' }),
    });
    await response.text();
    return response.status;
  };

  it(`aceita ${LOCAL_LOGIN_LIMIT} tentativas por IP e bloqueia a seguinte`, async () => {
    const statuses: number[] = [];
    for (let i = 0; i <= LOCAL_LOGIN_LIMIT; i++) {
      statuses.push(await login('203.0.113.50'));
    }
    expect(statuses.slice(0, LOCAL_LOGIN_LIMIT).every((s) => s === 201)).toBe(true);
    expect(statuses[LOCAL_LOGIN_LIMIT]).toBe(429);
  });

  it('outro IP nao e afetado (sem teto global que bloqueie todo mundo)', async () => {
    expect(await login('203.0.113.51')).toBe(201);
  });

  it('login social nao entra no limite de senha', async () => {
    expect(await login('203.0.113.50', 'GOOGLE')).toBe(201);
  });

  it(`trocar o IP a cada tentativa nao dribla o limite por conta (${LOCAL_LOGIN_EMAIL_LIMIT})`, async () => {
    const statuses: number[] = [];
    for (let i = 0; i <= LOCAL_LOGIN_EMAIL_LIMIT; i++) {
      statuses.push(await login(`198.51.100.${i + 1}`, 'LOCAL', 'Alvo@Empresa.com'));
    }
    expect(statuses.slice(0, LOCAL_LOGIN_EMAIL_LIMIT).every((s) => s === 201)).toBe(true);
    expect(statuses[LOCAL_LOGIN_EMAIL_LIMIT]).toBe(429);
    // outra conta segue normal
    expect(await login('198.51.100.250', 'LOCAL', 'outra@empresa.com')).toBe(201);
  });
});
