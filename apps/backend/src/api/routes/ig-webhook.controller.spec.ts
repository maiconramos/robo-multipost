import 'reflect-metadata';

// Mocks ANTES dos imports — FlowsService/IntegrationService importam o
// IntegrationManager que carrega nostr-tools (ESM nao compila no Jest).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/flows/flows.service',
  () => ({ FlowsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);

import { IgWebhookController } from './ig-webhook.controller';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MockProxy } from 'jest-mock-extended';
import { ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';

// Assina o rawBody exatamente como a Meta faz (HMAC-SHA256 sobre os bytes crus).
const sign = (raw: Buffer, secret: string): string =>
  'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');

const makeReq = (body: any, secret?: string): any => {
  const rawBody = Buffer.from(JSON.stringify(body));
  const headers: Record<string, string> = {};
  if (secret) headers['x-hub-signature-256'] = sign(rawBody, secret);
  return { body, rawBody, headers };
};

// Corpo de webhook de comentario para uma conta (entry.id = igAccountId).
const commentBody = (igAccountId: string) => ({
  object: 'instagram',
  entry: [
    {
      id: igAccountId,
      changes: [
        {
          field: 'comments',
          value: {
            id: 'comment-1',
            from: { id: 'commenter-1', username: 'bob' },
            media: { id: 'media-1' },
            text: 'quero o link',
          },
        },
      ],
    },
  ],
});

// Corpo com duas entries (contas distintas).
const twoEntryCommentBody = (accountA: string, accountB: string) => ({
  object: 'instagram',
  entry: [
    {
      id: accountA,
      changes: [
        {
          field: 'comments',
          value: {
            id: 'comment-A',
            from: { id: 'commenter-A', username: 'a' },
            media: { id: 'media-A' },
            text: 'a',
          },
        },
      ],
    },
    {
      id: accountB,
      changes: [
        {
          field: 'comments',
          value: {
            id: 'comment-B',
            from: { id: 'commenter-B', username: 'b' },
            media: { id: 'media-B' },
            text: 'b',
          },
        },
      ],
    },
  ],
});

const integration = (id: string, organizationId: string): any => ({
  id,
  organizationId,
  providerIdentifier: 'instagram',
  disabled: false,
  deletedAt: null,
  profileId: null,
});

describe('IgWebhookController', () => {
  let controller: IgWebhookController;
  let flowsService: MockProxy<FlowsService> & FlowsService;
  let integrationService: MockProxy<IntegrationService> & IntegrationService;
  let credentialService: MockProxy<CredentialService> & CredentialService;

  const ENV_KEYS = [
    'INSTAGRAM_APP_SECRET',
    'FACEBOOK_APP_SECRET',
    'SKIP_IG_WEBHOOK_HMAC',
    'NODE_ENV',
  ];
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = {};
    for (const k of ENV_KEYS) envSnapshot[k] = process.env[k];
    // Estado limpo: sem env secrets, sem skip. NODE_ENV fica 'test' (nao-prod).
    delete process.env.INSTAGRAM_APP_SECRET;
    delete process.env.FACEBOOK_APP_SECRET;
    delete process.env.SKIP_IG_WEBHOOK_HMAC;

    flowsService = createMock<FlowsService>();
    integrationService = createMock<IntegrationService>();
    credentialService = createMock<CredentialService>();

    // Sem credenciais por padrao; cada teste sobrescreve o que precisa.
    credentialService.findAllDecrypted.mockResolvedValue([] as any);
    integrationService.getIntegrationsByInternalId.mockResolvedValue([] as any);

    controller = new IgWebhookController(
      flowsService,
      integrationService,
      credentialService
    );
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (envSnapshot[k] === undefined) delete process.env[k];
      else process.env[k] = envSnapshot[k];
    }
  });

  describe('handleWebhook (POST) - assinatura', () => {
    it('aceita assinatura valida com segredo global do ambiente e despacha o comentario', async () => {
      process.env.INSTAGRAM_APP_SECRET = 'env-secret';
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
      ] as any);

      const body = commentBody('account-1');
      await controller.handleWebhook(makeReq(body, 'env-secret'));

      expect(flowsService.handleIncomingComment).toHaveBeenCalledTimes(1);
      expect(flowsService.handleIncomingComment).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationId: 'int-1',
          organizationId: 'org-1',
          igCommentId: 'comment-1',
        })
      );
    });

    it('preserva o fan-out multi-conta quando assinado com o segredo global', async () => {
      process.env.INSTAGRAM_APP_SECRET = 'env-secret';
      // Mesma conta co-conectada em duas orgs.
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-a', 'org-a'),
        integration('int-b', 'org-b'),
      ] as any);

      await controller.handleWebhook(
        makeReq(commentBody('account-shared'), 'env-secret')
      );

      expect(flowsService.handleIncomingComment).toHaveBeenCalledTimes(2);
      const orgs = flowsService.handleIncomingComment.mock.calls.map(
        (c: any) => c[0].organizationId
      );
      expect(orgs).toEqual(expect.arrayContaining(['org-a', 'org-b']));
    });

    it('aceita assinatura valida com o segredo da credencial da org dona da conta', async () => {
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
      ] as any);
      credentialService.findAllDecrypted.mockResolvedValue([
        { organizationId: 'org-1', profileId: null, data: { instagramAppSecret: 'secret-1' } },
        { organizationId: 'org-2', profileId: null, data: { instagramAppSecret: 'secret-2' } },
      ] as any);

      await controller.handleWebhook(
        makeReq(commentBody('account-1'), 'secret-1')
      );

      expect(flowsService.handleIncomingComment).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' })
      );
    });

    it('rejeita falsificacao cross-tenant quando org A assina payload com conta da org B', async () => {
      // account-B pertence a org-2; atacante assina com o secret da org-1.
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-2', 'org-2'),
      ] as any);
      credentialService.findAllDecrypted.mockResolvedValue([
        { organizationId: 'org-1', profileId: null, data: { instagramAppSecret: 'secret-1' } },
        { organizationId: 'org-2', profileId: null, data: { instagramAppSecret: 'secret-2' } },
      ] as any);

      await expect(
        controller.handleWebhook(makeReq(commentBody('account-B'), 'secret-1'))
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(flowsService.handleIncomingComment).not.toHaveBeenCalled();
    });

    it('descarta a entry da vitima em corpo misto assinado pela org A e processa so a entry autorizada', async () => {
      // account-A -> org-1 (dona do secret usado); account-B -> org-2 (vitima).
      integrationService.getIntegrationsByInternalId.mockImplementation(((
        id: string
      ) => {
        if (id === 'account-A') return Promise.resolve([integration('int-a', 'org-1')]);
        if (id === 'account-B') return Promise.resolve([integration('int-b', 'org-2')]);
        return Promise.resolve([]);
      }) as any);
      credentialService.findAllDecrypted.mockResolvedValue([
        { organizationId: 'org-1', profileId: null, data: { instagramAppSecret: 'secret-1' } },
        { organizationId: 'org-2', profileId: null, data: { instagramAppSecret: 'secret-2' } },
      ] as any);

      await controller.handleWebhook(
        makeReq(twoEntryCommentBody('account-A', 'account-B'), 'secret-1')
      );

      expect(flowsService.handleIncomingComment).toHaveBeenCalledTimes(1);
      expect(flowsService.handleIncomingComment).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' })
      );
      const orgs = flowsService.handleIncomingComment.mock.calls.map(
        (c: any) => c[0].organizationId
      );
      expect(orgs).not.toContain('org-2');
    });

    it('nao despacha para org B quando conta co-conectada e assinada apenas com o segredo da org A', async () => {
      // account-shared co-conectada em org-1 e org-2; assinado so com secret da org-1.
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
        integration('int-2', 'org-2'),
      ] as any);
      credentialService.findAllDecrypted.mockResolvedValue([
        { organizationId: 'org-1', profileId: null, data: { instagramAppSecret: 'secret-1' } },
        { organizationId: 'org-2', profileId: null, data: { instagramAppSecret: 'secret-2' } },
      ] as any);

      await controller.handleWebhook(
        makeReq(commentBody('account-shared'), 'secret-1')
      );

      const orgs = flowsService.handleIncomingComment.mock.calls.map(
        (c: any) => c[0].organizationId
      );
      expect(orgs).toEqual(['org-1']);
      expect(orgs).not.toContain('org-2');
    });

    it('autoriza as duas orgs quando compartilham o mesmo segredo de app', async () => {
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
        integration('int-2', 'org-2'),
      ] as any);
      credentialService.findAllDecrypted.mockResolvedValue([
        { organizationId: 'org-1', profileId: null, data: { instagramAppSecret: 'shared' } },
        { organizationId: 'org-2', profileId: null, data: { instagramAppSecret: 'shared' } },
      ] as any);

      await controller.handleWebhook(
        makeReq(commentBody('account-shared'), 'shared')
      );

      const orgs = flowsService.handleIncomingComment.mock.calls.map(
        (c: any) => c[0].organizationId
      );
      expect(orgs).toEqual(expect.arrayContaining(['org-1', 'org-2']));
      expect(orgs).toHaveLength(2);
    });

    it('falha fechado em producao quando nenhum segredo esta configurado', async () => {
      process.env.NODE_ENV = 'production';
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
      ] as any);

      await expect(
        controller.handleWebhook(makeReq(commentBody('account-1')))
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(flowsService.handleIncomingComment).not.toHaveBeenCalled();
    });

    it('pula validacao fora de producao quando nenhum segredo esta configurado', async () => {
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
      ] as any);

      await controller.handleWebhook(makeReq(commentBody('account-1')));

      expect(flowsService.handleIncomingComment).toHaveBeenCalledTimes(1);
    });

    it('ignora SKIP_IG_WEBHOOK_HMAC em producao e exige assinatura valida', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SKIP_IG_WEBHOOK_HMAC = 'true';
      process.env.INSTAGRAM_APP_SECRET = 'env-secret';
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
      ] as any);

      // Assinatura errada -> mesmo com SKIP=true, em producao deve rejeitar.
      await expect(
        controller.handleWebhook(makeReq(commentBody('account-1'), 'wrong-secret'))
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(flowsService.handleIncomingComment).not.toHaveBeenCalled();
    });

    it('respeita SKIP_IG_WEBHOOK_HMAC fora de producao', async () => {
      process.env.SKIP_IG_WEBHOOK_HMAC = 'true';
      process.env.INSTAGRAM_APP_SECRET = 'env-secret';
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
      ] as any);

      // Sem header de assinatura, mas SKIP em dev -> processa.
      await controller.handleWebhook(makeReq(commentBody('account-1')));

      expect(flowsService.handleIncomingComment).toHaveBeenCalledTimes(1);
    });

    it('retorna 403 quando falta o header x-hub-signature-256', async () => {
      process.env.INSTAGRAM_APP_SECRET = 'env-secret';
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
      ] as any);

      await expect(
        controller.handleWebhook(makeReq(commentBody('account-1')))
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(flowsService.handleIncomingComment).not.toHaveBeenCalled();
    });

    it('retorna 403 quando a assinatura e invalida', async () => {
      process.env.INSTAGRAM_APP_SECRET = 'env-secret';
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
      ] as any);

      await expect(
        controller.handleWebhook(makeReq(commentBody('account-1'), 'outro-secret'))
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(flowsService.handleIncomingComment).not.toHaveBeenCalled();
    });

    it('usa o rawBody bruto para o HMAC quando disponivel', async () => {
      process.env.INSTAGRAM_APP_SECRET = 'env-secret';
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
      ] as any);

      // rawBody com espacos extras: assina os BYTES crus, nao o JSON re-serializado.
      const body = commentBody('account-1');
      const rawBody = Buffer.from('   ' + JSON.stringify(body) + '   ');
      const req: any = {
        body,
        rawBody,
        headers: { 'x-hub-signature-256': sign(rawBody, 'env-secret') },
      };

      await controller.handleWebhook(req);

      expect(flowsService.handleIncomingComment).toHaveBeenCalledTimes(1);
    });

    it('ignora entry de conta desconhecida sem afetar as demais', async () => {
      process.env.INSTAGRAM_APP_SECRET = 'env-secret';
      integrationService.getIntegrationsByInternalId.mockImplementation(((
        id: string
      ) =>
        id === 'account-A'
          ? Promise.resolve([integration('int-a', 'org-1')])
          : Promise.resolve([])) as any);

      await controller.handleWebhook(
        makeReq(twoEntryCommentBody('account-A', 'account-unknown'), 'env-secret')
      );

      expect(flowsService.handleIncomingComment).toHaveBeenCalledTimes(1);
      expect(flowsService.handleIncomingComment).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' })
      );
    });
  });

  describe('handleWebhook (POST) - despacho por escopo', () => {
    const postbackBody = (igAccountId: string) => ({
      object: 'instagram',
      entry: [
        {
          id: igAccountId,
          messaging: [
            {
              sender: { id: 'sender-1' },
              recipient: { id: igAccountId },
              postback: { payload: 'pb_abc', mid: 'mid-1' },
            },
          ],
        },
      ],
    });

    const storyReplyBody = (igAccountId: string) => ({
      object: 'instagram',
      entry: [
        {
          id: igAccountId,
          messaging: [
            {
              sender: { id: 'sender-1' },
              recipient: { id: igAccountId },
              message: {
                mid: 'mid-1',
                text: 'oi',
                reply_to: { story: { id: 'story-1' } },
              },
            },
          ],
        },
      ],
    });

    it('nao processa postback de conta fora do escopo da assinatura', async () => {
      // Assinado com secret da org-1, mas o postback e da conta da org-2.
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-2', 'org-2'),
      ] as any);
      credentialService.findAllDecrypted.mockResolvedValue([
        { organizationId: 'org-1', profileId: null, data: { instagramAppSecret: 'secret-1' } },
        { organizationId: 'org-2', profileId: null, data: { instagramAppSecret: 'secret-2' } },
      ] as any);

      await expect(
        controller.handleWebhook(makeReq(postbackBody('account-2'), 'secret-1'))
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(flowsService.handlePostbackClick).not.toHaveBeenCalled();
    });

    it('processa postback quando a conta pertence ao escopo da assinatura', async () => {
      process.env.INSTAGRAM_APP_SECRET = 'env-secret';
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-1', 'org-1'),
      ] as any);

      await controller.handleWebhook(
        makeReq(postbackBody('account-1'), 'env-secret')
      );

      expect(flowsService.handlePostbackClick).toHaveBeenCalledTimes(1);
    });

    it('filtra a entry de messaging da vitima em corpo misto e processa so a autorizada', async () => {
      // Assinatura valida da org-1 (escopo orgs:{org-1}); corpo tem postback da
      // conta da org-1 (autorizada) + postback da conta da org-2 (vitima).
      // Exercita o filtro isEntryAllowed, nao o caminho de 403 da assinatura.
      integrationService.getIntegrationsByInternalId.mockImplementation(((
        id: string
      ) => {
        if (id === 'account-1') return Promise.resolve([integration('int-1', 'org-1')]);
        if (id === 'account-2') return Promise.resolve([integration('int-2', 'org-2')]);
        return Promise.resolve([]);
      }) as any);
      credentialService.findAllDecrypted.mockResolvedValue([
        { organizationId: 'org-1', profileId: null, data: { instagramAppSecret: 'secret-1' } },
        { organizationId: 'org-2', profileId: null, data: { instagramAppSecret: 'secret-2' } },
      ] as any);

      const body = {
        object: 'instagram',
        entry: [
          {
            id: 'account-1',
            messaging: [
              {
                sender: { id: 's1' },
                recipient: { id: 'account-1' },
                postback: { payload: 'pb_autorizado', mid: 'm1' },
              },
            ],
          },
          {
            id: 'account-2',
            messaging: [
              {
                sender: { id: 's2' },
                recipient: { id: 'account-2' },
                postback: { payload: 'pb_vitima', mid: 'm2' },
              },
            ],
          },
        ],
      };

      await controller.handleWebhook(makeReq(body, 'secret-1'));

      expect(flowsService.handlePostbackClick).toHaveBeenCalledTimes(1);
      expect(flowsService.handlePostbackClick).toHaveBeenCalledWith(
        expect.objectContaining({ igAccountId: 'account-1', payload: 'pb_autorizado' })
      );
    });

    it('filtra o despacho de story reply para orgs fora do escopo', async () => {
      integrationService.getIntegrationsByInternalId.mockResolvedValue([
        integration('int-2', 'org-2'),
      ] as any);
      credentialService.findAllDecrypted.mockResolvedValue([
        { organizationId: 'org-1', profileId: null, data: { instagramAppSecret: 'secret-1' } },
        { organizationId: 'org-2', profileId: null, data: { instagramAppSecret: 'secret-2' } },
      ] as any);

      await expect(
        controller.handleWebhook(makeReq(storyReplyBody('account-2'), 'secret-1'))
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(flowsService.handleIncomingStoryReply).not.toHaveBeenCalled();
    });
  });
});
