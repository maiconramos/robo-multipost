// integration.manager puxa todos os providers sociais (nostr-tools e ESM e
// quebra o ts-jest); mock segue o padrao dos demais specs do backend.
jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({})
);

import { ExecutionContext, HttpException } from '@nestjs/common';
import { PoliciesGuard } from './permissions.guard';
import {
  AdminRoleRequiredException,
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from './permission.exception.class';

const makeContext = (path: string, handlers: any[] | undefined, org: any) => {
  const request = {
    path,
    query: {},
    org,
  };
  const reflector = { get: jest.fn().mockReturnValue(handlers) };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
  return { context, reflector };
};

const org = {
  id: 'org-1',
  createdAt: new Date(),
  users: [{ role: 'USER' }],
};

describe('PoliciesGuard', () => {
  it('permite rotas de bypass sem consultar policies', async () => {
    const { context, reflector } = makeContext('/auth/login', undefined, org);
    const permissions = { check: jest.fn() };
    const guard = new PoliciesGuard(reflector as any, permissions as any);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(permissions.check).not.toHaveBeenCalled();
  });

  it('permite quando nao ha policies no handler', async () => {
    const { context, reflector } = makeContext('/posts', undefined, org);
    const permissions = { check: jest.fn() };
    const guard = new PoliciesGuard(reflector as any, permissions as any);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('lanca 403 quando a policy negada e da secao ADMIN', async () => {
    const handlers = [[AuthorizationActions.Create, Sections.ADMIN]];
    const { context, reflector } = makeContext('/profiles', handlers, org);
    const permissions = {
      check: jest.fn().mockResolvedValue({ can: () => false }),
    };
    const guard = new PoliciesGuard(reflector as any, permissions as any);

    try {
      await guard.canActivate(context);
      fail('deveria ter lancado');
    } catch (err) {
      expect(err).toBeInstanceOf(AdminRoleRequiredException);
      expect((err as HttpException).getStatus()).toBe(403);
    }
  });

  it('mantem 402 quando a policy negada e de tier', async () => {
    const handlers = [[AuthorizationActions.Create, Sections.CHANNEL]];
    const { context, reflector } = makeContext('/integrations', handlers, org);
    const permissions = {
      check: jest.fn().mockResolvedValue({ can: () => false }),
    };
    const guard = new PoliciesGuard(reflector as any, permissions as any);

    try {
      await guard.canActivate(context);
      fail('deveria ter lancado');
    } catch (err) {
      expect(err).toBeInstanceOf(SubscriptionException);
      expect((err as HttpException).getStatus()).toBe(402);
    }
  });

  it('permite quando a ability concede todas as policies', async () => {
    const handlers = [[AuthorizationActions.Create, Sections.ADMIN]];
    const { context, reflector } = makeContext('/profiles', handlers, {
      ...org,
      users: [{ role: 'ADMIN' }],
    });
    const permissions = {
      check: jest.fn().mockResolvedValue({ can: () => true }),
    };
    const guard = new PoliciesGuard(reflector as any, permissions as any);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
