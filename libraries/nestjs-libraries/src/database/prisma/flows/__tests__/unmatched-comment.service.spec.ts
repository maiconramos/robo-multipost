import 'reflect-metadata';

// Mocks ANTES dos imports — IntegrationService carrega IntegrationManager
// que carrega NostrProvider (nostr-tools ESM nao compila no Jest).
jest.mock('../../integrations/integration.service', () => ({
  IntegrationService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/instagram.provider',
  () => ({
    InstagramProvider: class {},
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service',
  () => ({
    InstagramMessagingService: class {},
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/instagram-route.resolver',
  () => ({
    resolveIgRoute: jest.fn(),
  })
);
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
  },
}));

import { UnmatchedCommentService } from '../unmatched-comment.service';
import { FlowsRepository } from '../flows.repository';
import { IntegrationService } from '../../integrations/integration.service';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import { InstagramMessagingService } from '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service';
import { AliasSource, UnmatchedStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

const { resolveIgRoute } = jest.requireMock(
  '@gitroom/nestjs-libraries/integrations/social/instagram-route.resolver'
);
const { ioRedis } = jest.requireMock(
  '@gitroom/nestjs-libraries/redis/redis.service'
);

describe('UnmatchedCommentService', () => {
  let service: UnmatchedCommentService;
  let repo: jest.Mocked<FlowsRepository>;
  let integrationService: jest.Mocked<IntegrationService>;
  let instagramProvider: jest.Mocked<InstagramProvider>;
  let messagingService: jest.Mocked<InstagramMessagingService>;

  beforeEach(() => {
    jest.resetAllMocks();

    repo = {
      listUnmatchedByIntegration: jest.fn(),
      findUnmatchedById: jest.fn(),
      findUnmatchedByIdInternal: jest.fn(),
      listAliasesByFlow: jest.fn(),
      getFlow: jest.fn(),
      createAlias: jest.fn(),
      findAliasesByIntegrationAndMedia: jest.fn(),
      markUnmatchedBound: jest.fn(),
      markUnmatchedIgnored: jest.fn(),
      markAllPendingBoundForMedia: jest.fn().mockResolvedValue(0),
      markAllPendingIgnoredForMedia: jest.fn().mockResolvedValue(0),
      upsertIgnoredMedia: jest.fn(),
      updateUnmatchedMetadata: jest.fn(),
      deleteUnmatchedOlderThan: jest.fn(),
    } as any;

    integrationService = {
      getIntegrationById: jest.fn(),
    } as any;

    instagramProvider = {
      getMediaMetadata: jest.fn(),
    } as any;

    messagingService = {} as any;

    service = new UnmatchedCommentService(
      repo,
      integrationService,
      instagramProvider,
      messagingService
    );
  });

  describe('listInbox', () => {
    it('deve delegar pro repo com opcoes de paginacao', async () => {
      repo.listUnmatchedByIntegration.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      } as any);

      const result = await service.listInbox('org-1', 'int-1', {
        status: UnmatchedStatus.PENDING,
        page: 2,
      });

      expect(repo.listUnmatchedByIntegration).toHaveBeenCalledWith(
        'org-1',
        'int-1',
        { status: UnmatchedStatus.PENDING, page: 2 }
      );
      expect(result.total).toBe(0);
    });
  });

  describe('bindToFlow', () => {
    it('deve lancar BadRequest quando o unmatched nao existe', async () => {
      repo.findUnmatchedById.mockResolvedValue(null as any);

      await expect(
        service.bindToFlow('org-1', 'uc-X', 'f-1')
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deve lancar quando flow eh de outra integracao', async () => {
      repo.findUnmatchedById.mockResolvedValue({
        id: 'uc-1',
        integrationId: 'int-1',
        organizationId: 'org-1',
        igMediaId: 'media-X',
      } as any);
      repo.getFlow.mockResolvedValue({
        id: 'f-1',
        integrationId: 'int-2',
      } as any);

      await expect(
        service.bindToFlow('org-1', 'uc-1', 'f-1')
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deve criar alias e marcar como BOUND', async () => {
      repo.findUnmatchedById.mockResolvedValue({
        id: 'uc-1',
        integrationId: 'int-1',
        organizationId: 'org-1',
        igMediaId: 'media-X',
      } as any);
      repo.getFlow.mockResolvedValue({
        id: 'f-1',
        integrationId: 'int-1',
      } as any);
      repo.createAlias.mockResolvedValue({ id: 'a-1' } as any);

      const result = await service.bindToFlow('org-1', 'uc-1', 'f-1', 'u-1');

      expect(repo.createAlias).toHaveBeenCalledWith({
        flowId: 'f-1',
        integrationId: 'int-1',
        aliasMediaId: 'media-X',
        source: AliasSource.WEBHOOK_INBOX,
        boundBy: 'u-1',
      });
      expect(repo.markUnmatchedBound).toHaveBeenCalledWith('uc-1', 'f-1');
      expect(result.status).toBe(UnmatchedStatus.BOUND);
    });

    it('deve marcar em massa outros UnmatchedComment do mesmo media como BOUND', async () => {
      repo.findUnmatchedById.mockResolvedValue({
        id: 'uc-1',
        integrationId: 'int-1',
        organizationId: 'org-1',
        igMediaId: 'media-X',
      } as any);
      repo.getFlow.mockResolvedValue({
        id: 'f-1',
        integrationId: 'int-1',
      } as any);
      repo.createAlias.mockResolvedValue({ id: 'a-1' } as any);
      (repo.markAllPendingBoundForMedia as jest.Mock).mockResolvedValue(2);

      const result = await service.bindToFlow('org-1', 'uc-1', 'f-1', 'u-1');

      expect(repo.markAllPendingBoundForMedia).toHaveBeenCalledWith(
        'int-1',
        'media-X',
        'f-1',
        'uc-1'
      );
      expect(result.bulkBoundCount).toBe(2);
    });

    it('deve ser idempotente em P2002 (alias ja existe)', async () => {
      repo.findUnmatchedById.mockResolvedValue({
        id: 'uc-1',
        integrationId: 'int-1',
        organizationId: 'org-1',
        igMediaId: 'media-X',
      } as any);
      repo.getFlow.mockResolvedValue({
        id: 'f-1',
        integrationId: 'int-1',
      } as any);

      const p2002 = new Error('Unique constraint failed') as any;
      p2002.code = 'P2002';
      repo.createAlias.mockRejectedValue(p2002);
      repo.findAliasesByIntegrationAndMedia.mockResolvedValue([
        { id: 'a-existing', flowId: 'f-1' },
      ] as any);

      const result = await service.bindToFlow('org-1', 'uc-1', 'f-1');

      expect(result.alias).toEqual({ id: 'a-existing', flowId: 'f-1' });
      expect(repo.markUnmatchedBound).toHaveBeenCalledWith('uc-1', 'f-1');
    });
  });

  describe('ignore', () => {
    it('deve lancar BadRequest quando o unmatched nao existe', async () => {
      repo.findUnmatchedById.mockResolvedValue(null as any);

      await expect(
        service.ignore('org-1', 'uc-X')
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deve criar IgnoredMedia e marcar como IGNORED', async () => {
      repo.findUnmatchedById.mockResolvedValue({
        id: 'uc-1',
        integrationId: 'int-1',
        organizationId: 'org-1',
        igMediaId: 'media-X',
      } as any);

      const result = await service.ignore(
        'org-1',
        'uc-1',
        'spam',
        'u-1'
      );

      expect(repo.upsertIgnoredMedia).toHaveBeenCalledWith({
        integrationId: 'int-1',
        organizationId: 'org-1',
        igMediaId: 'media-X',
        reason: 'spam',
        ignoredBy: 'u-1',
      });
      expect(repo.markUnmatchedIgnored).toHaveBeenCalledWith('uc-1');
      expect(result.status).toBe(UnmatchedStatus.IGNORED);
    });

    it('deve marcar em massa outros UnmatchedComment do mesmo media como IGNORED', async () => {
      repo.findUnmatchedById.mockResolvedValue({
        id: 'uc-1',
        integrationId: 'int-1',
        organizationId: 'org-1',
        igMediaId: 'media-X',
      } as any);
      (repo.markAllPendingIgnoredForMedia as jest.Mock).mockResolvedValue(3);

      const result = await service.ignore('org-1', 'uc-1', 'spam', 'u-1');

      expect(repo.markAllPendingIgnoredForMedia).toHaveBeenCalledWith(
        'int-1',
        'media-X',
        'uc-1'
      );
      expect(result.bulkIgnoredCount).toBe(3);
    });
  });

  describe('enrich', () => {
    it('deve usar cache quando hit e nao chamar Graph API', async () => {
      repo.findUnmatchedByIdInternal.mockResolvedValue({
        id: 'uc-1',
        igMediaId: 'media-X',
        organizationId: 'org-1',
        integrationId: 'int-1',
      } as any);
      ioRedis.get.mockResolvedValue(
        JSON.stringify({
          permalink: 'p',
          caption: 'c',
          thumbnailUrl: 't',
          mediaType: 'VIDEO',
          isAd: true,
        })
      );

      await service.enrich('uc-1');

      expect(instagramProvider.getMediaMetadata).not.toHaveBeenCalled();
      expect(repo.updateUnmatchedMetadata).toHaveBeenCalledWith(
        'uc-1',
        expect.objectContaining({
          permalink: 'p',
          isAd: true,
          enrichmentError: null,
        })
      );
    });

    it('deve buscar via Graph API quando cache miss', async () => {
      repo.findUnmatchedByIdInternal.mockResolvedValue({
        id: 'uc-1',
        igMediaId: 'media-X',
        organizationId: 'org-1',
        integrationId: 'int-1',
      } as any);
      ioRedis.get.mockResolvedValue(null);
      integrationService.getIntegrationById.mockResolvedValue({
        id: 'int-1',
        token: 'tok',
        providerIdentifier: 'instagram',
        organizationId: 'org-1',
        internalId: 'ig-acc',
      } as any);
      resolveIgRoute.mockResolvedValue({
        token: 'tok',
        host: 'graph.facebook.com',
        useIgGraph: false,
        source: 'page-access-token',
      });
      instagramProvider.getMediaMetadata.mockResolvedValue({
        id: 'media-X',
        permalink: 'https://...',
        caption: 'legenda',
        thumbnailUrl: 'https://thumb',
        mediaType: 'VIDEO',
        isAd: false,
      } as any);

      await service.enrich('uc-1');

      expect(instagramProvider.getMediaMetadata).toHaveBeenCalledWith(
        'media-X',
        'tok',
        'graph.facebook.com'
      );
      expect(repo.updateUnmatchedMetadata).toHaveBeenCalledWith(
        'uc-1',
        expect.objectContaining({
          permalink: 'https://...',
          isAd: false,
          enrichmentError: null,
        })
      );
    });

    it('deve gravar enrichmentError quando Graph API falha', async () => {
      repo.findUnmatchedByIdInternal.mockResolvedValue({
        id: 'uc-1',
        igMediaId: 'media-X',
        organizationId: 'org-1',
        integrationId: 'int-1',
      } as any);
      ioRedis.get.mockResolvedValue(null);
      integrationService.getIntegrationById.mockResolvedValue({
        id: 'int-1',
        token: 'tok',
        providerIdentifier: 'instagram',
        organizationId: 'org-1',
        internalId: 'ig-acc',
      } as any);
      resolveIgRoute.mockResolvedValue({
        token: 'tok',
        host: 'graph.facebook.com',
        useIgGraph: false,
        source: 'page-access-token',
      });
      instagramProvider.getMediaMetadata.mockRejectedValue(
        new Error('IG rate limit')
      );

      await service.enrich('uc-1');

      expect(repo.updateUnmatchedMetadata).toHaveBeenCalledWith(
        'uc-1',
        expect.objectContaining({
          enrichmentError: 'IG rate limit',
        })
      );
    });

    it('deve sair silenciosamente quando integracao some', async () => {
      repo.findUnmatchedByIdInternal.mockResolvedValue({
        id: 'uc-1',
        igMediaId: 'media-X',
        organizationId: 'org-1',
        integrationId: 'int-deleted',
      } as any);
      ioRedis.get.mockResolvedValue(null);
      integrationService.getIntegrationById.mockResolvedValue(null);

      await service.enrich('uc-1');

      expect(instagramProvider.getMediaMetadata).not.toHaveBeenCalled();
      expect(repo.updateUnmatchedMetadata).toHaveBeenCalledWith(
        'uc-1',
        expect.objectContaining({
          enrichmentError: 'integration not found',
        })
      );
    });
  });

  describe('listAliasesEnriched', () => {
    it('deve enriquecer cada alias com metadata do cache', async () => {
      repo.listAliasesByFlow.mockResolvedValue([
        {
          id: 'a-1',
          flowId: 'f-1',
          integrationId: 'int-1',
          aliasMediaId: 'media-X',
          source: 'MANUAL',
        },
      ] as any);
      ioRedis.get.mockResolvedValue(
        JSON.stringify({
          permalink: 'https://insta',
          thumbnailUrl: 'https://thumb',
          caption: 'legenda',
          mediaType: 'VIDEO',
          isAd: true,
        })
      );

      const result = await service.listAliasesEnriched('org-1', 'f-1');

      expect(repo.listAliasesByFlow).toHaveBeenCalledWith('org-1', 'f-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'a-1',
        permalink: 'https://insta',
        thumbnailUrl: 'https://thumb',
        caption: 'legenda',
        isAd: true,
      });
    });

    it('deve degradar para nulls quando metadata indisponivel', async () => {
      repo.listAliasesByFlow.mockResolvedValue([
        {
          id: 'a-1',
          flowId: 'f-1',
          integrationId: 'int-1',
          aliasMediaId: 'media-X',
          source: 'MANUAL',
        },
      ] as any);
      ioRedis.get.mockResolvedValue(null);
      integrationService.getIntegrationById.mockResolvedValue(null);

      const result = await service.listAliasesEnriched('org-1', 'f-1');

      expect(result[0].permalink).toBeNull();
      expect(result[0].thumbnailUrl).toBeNull();
    });
  });

  describe('namespace de organizacao na chave de cache', () => {
    it('deve incluir o organizationId na chave ao ler cache no enrich', async () => {
      repo.findUnmatchedByIdInternal.mockResolvedValue({
        id: 'uc-1',
        igMediaId: 'media-X',
        organizationId: 'org-1',
        integrationId: 'int-1',
      } as any);
      ioRedis.get.mockResolvedValue(JSON.stringify({ permalink: 'p' }));

      await service.enrich('uc-1');

      expect(ioRedis.get).toHaveBeenCalledWith(
        'ig:media:org-1:media-X:metadata'
      );
    });

    it('deve gravar cache com a chave namespaced apos buscar no Graph API', async () => {
      repo.findUnmatchedByIdInternal.mockResolvedValue({
        id: 'uc-1',
        igMediaId: 'media-X',
        organizationId: 'org-1',
        integrationId: 'int-1',
      } as any);
      ioRedis.get.mockResolvedValue(null);
      integrationService.getIntegrationById.mockResolvedValue({
        id: 'int-1',
        providerIdentifier: 'instagram',
        organizationId: 'org-1',
      } as any);
      resolveIgRoute.mockResolvedValue({
        token: 'tok',
        host: 'graph.facebook.com',
      });
      instagramProvider.getMediaMetadata.mockResolvedValue({
        id: 'media-X',
        permalink: 'https://x',
      } as any);

      await service.enrich('uc-1');

      expect(ioRedis.setex).toHaveBeenCalledWith(
        'ig:media:org-1:media-X:metadata',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('deve isolar a chave por organizationId no getMediaMetadataCached', async () => {
      repo.listAliasesByFlow.mockResolvedValue([
        {
          id: 'a-1',
          flowId: 'f-1',
          integrationId: 'int-1',
          aliasMediaId: 'media-X',
          source: 'MANUAL',
        },
      ] as any);
      ioRedis.get.mockResolvedValue(null);
      integrationService.getIntegrationById.mockResolvedValue(null);

      await service.listAliasesEnriched('org-2', 'f-1');

      expect(ioRedis.get).toHaveBeenCalledWith(
        'ig:media:org-2:media-X:metadata'
      );
    });
  });

  describe('cleanupExpired', () => {
    it('deve delegar pro repo retornando o count', async () => {
      repo.deleteUnmatchedOlderThan.mockResolvedValue(12);

      const result = await service.cleanupExpired(
        new Date('2026-04-12T00:00:00Z')
      );

      expect(result).toBe(12);
    });
  });
});
