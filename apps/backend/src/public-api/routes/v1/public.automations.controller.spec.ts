jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({})
);
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PublicAutomationsController } from './public.automations.controller';
import { AutomationManagementService } from '@gitroom/nestjs-libraries/integrations/automations/automation-management.service';
import { automationConfigurationSchema } from '@gitroom/nestjs-libraries/dtos/flows/automation-management.dto';
describe('API HTTP de automacoes para agentes', () => {
  let app: INestApplication, base: string;
  const scope = { organizationId: 'org', profileId: 'perfil' };
  const service = {
    scope: jest.fn().mockResolvedValue(scope),
    create: jest.fn().mockResolvedValue({ id: 'f' }),
    update: jest.fn(),
    detail: jest.fn(),
    status: jest.fn(),
    history: jest.fn(),
    capabilities: jest.fn(),
    options: jest.fn(),
    aliases: jest.fn(),
    canvas: jest.fn(),
    repost: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicAutomationsController],
      providers: [{ provide: AutomationManagementService, useValue: service }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(
      (
        req: { org?: { id: string }; publicApiProfileId?: string },
        _res: unknown,
        next: () => void
      ) => {
        req.org = { id: 'org' };
        req.publicApiProfileId = 'perfil';
        next();
      }
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());
  const send = (path: string, body: unknown, method = 'POST') =>
    fetch(`${base}/public/v1/automations${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  it('Swagger apresenta todos os campos declarativos e arrays do canvas', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build()
    );
    const schemas = doc.components!.schemas! as Record<
      string,
      { properties?: Record<string, unknown> }
    >;
    expect(Object.keys(schemas.AutomationConfigurationDto.properties!)).toEqual(
      expect.arrayContaining(Object.keys(automationConfigurationSchema.shape))
    );
    expect(schemas.AutomationCanvasDto.properties).toHaveProperty('nodes');
    expect(schemas.FlowNodeDto.properties).toHaveProperty('data');
    expect(schemas.FlowEdgeDto.properties).toHaveProperty('sourceHandle');
    expect(doc.paths).toHaveProperty('/public/v1/automations/{id}/canvas');
  });
  it('rejeita chave de perfil tentando escopo divergente antes de consultar servico', async () => {
    const result = await send('?profileId=outro', {
      name: 'X',
      integrationId: 'ig',
      dmMessage: 'Link',
    });
    expect(result.status).toBe(403);
    expect(service.scope).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
  });
  it('recusa campos desconhecidos em criacao e patch aninhado', async () => {
    expect(
      (await send('', { name: 'X', integrationId: 'ig', stolenToken: 'nao' }))
        .status
    ).toBe(400);
    expect(
      (
        await send(
          '/f',
          { configuration: { dmMessage: 'X', secret: 'nao' } },
          'PUT'
        )
      ).status
    ).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });
  it('encaminha campos completos do Messenger e snapshot de edicao sem filtrar', async () => {
    const input = {
      name: 'Messenger',
      integrationId: 'fb',
      platform: 'facebook',
      triggerType: 'messenger_message',
      keywords: ['quero'],
      priority: 20,
      dmMessage: 'DM',
      activate: false,
    };
    expect((await send('', input)).status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      scope,
      expect.objectContaining(input)
    );
    const patch = {
      configuration: {
        replyMessages: ['A', 'B'],
        openingDmMessage: 'Inicio',
        maxGateAttempts: 7,
      },
      expectedUpdatedAt: '2026-10-27T12:00:00.000Z',
    };
    expect((await send('/f?executionVersion=1', patch, 'PUT')).status).toBe(
      200
    );
    expect(service.update).toHaveBeenCalledWith(
      scope,
      'f',
      1,
      expect.objectContaining(patch)
    );
  });
  it('nao confunde capabilities com id e recusa versao desconhecida', async () => {
    expect(
      (await fetch(`${base}/public/v1/automations/capabilities`)).status
    ).toBe(200);
    expect(service.capabilities).toHaveBeenCalled();
    expect(
      (await fetch(`${base}/public/v1/automations/f?executionVersion=4`)).status
    ).toBe(400);
    expect(service.detail).not.toHaveBeenCalled();
  });
  it('encaminha motor Zernio explicito em leitura e edicao com revisao', async () => {
    const response = await fetch(
      `${base}/public/v1/automations/f?executionVersion=3`
    );
    expect(response.status).toBe(200);
    expect(service.detail).toHaveBeenCalledWith(scope, 'f', 3);
    await send(
      '/f?executionVersion=3',
      { configuration: { dmMessages: ['Oi'] }, expectedRevision: 9 },
      'PUT'
    );
    expect(service.update).toHaveBeenCalledWith(
      scope,
      'f',
      3,
      expect.objectContaining({ expectedRevision: 9 })
    );
  });
});
