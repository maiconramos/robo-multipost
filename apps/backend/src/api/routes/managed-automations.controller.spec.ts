import { ManagedAutomationsController } from './managed-automations.controller';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { AutomationManagementService } from '@gitroom/nestjs-libraries/integrations/automations/automation-management.service';
jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({})
);
describe('automacoes gerenciadas no painel', () => {
  it('exige perfil do contexto e nao adota perfil enviado no body', async () => {
    const service = createMock<AutomationManagementService>();
    const controller = new ManagedAutomationsController(service);
    await expect(controller.list({ id: 'o' } as any, null)).rejects.toThrow(
      'PROFILE_REQUIRED'
    );
    await controller.detail({ id: 'o' } as any, { id: 'p' } as any, 'f');
    expect(service.detail).toHaveBeenCalledWith(
      { organizationId: 'o', profileId: 'p' },
      'f',
      3
    );
  });
});

import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { ProfileAccessGuard } from '@gitroom/nestjs-libraries/services/auth/profile-access/profile-access.guard';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
describe('HTTP do painel com guarda de perfil', () => {
  let app: INestApplication,
    base: string,
    viewer = false;
  const service = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'z', executionVersion: 3 }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ManagedAutomationsController],
      providers: [{ provide: AutomationManagementService, useValue: service }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use((req: any, _res: unknown, next: () => void) => {
      req.org = { id: 'org', users: [{ role: 'USER' }] };
      req.user = { id: 'user' };
      req.profile = { id: 'client' };
      req.profileRole = viewer ? 'VIEWER' : 'OWNER';
      next();
    });
    app.useGlobalGuards(
      new ProfileAccessGuard(new Reflector(), createMock<ProfileService>())
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    viewer = false;
  });
  const send = (body: unknown) =>
    fetch(`${base}/managed-automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  it('le em VIEWER mas impede escrita antes do servico', async () => {
    viewer = true;
    expect((await fetch(`${base}/managed-automations`)).status).toBe(200);
    expect(
      (
        await send({
          name: 'Teste',
          integrationId: 'zi',
          dmMessage: 'Oi',
          activate: false,
        })
      ).status
    ).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
  });
  it('recusa perfil forjado e aceita contrato valido com contexto autenticado', async () => {
    expect(
      (
        await send({
          name: 'Teste',
          integrationId: 'zi',
          dmMessage: 'Oi',
          profileId: 'other',
        })
      ).status
    ).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    expect(
      (
        await send({
          name: 'Teste',
          integrationId: 'zi',
          dmMessage: 'Oi',
          activate: false,
        })
      ).status
    ).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      { organizationId: 'org', profileId: 'client' },
      expect.objectContaining({ integrationId: 'zi' })
    );
  });
});
