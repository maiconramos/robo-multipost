import 'reflect-metadata';

// Mocks ANTES dos imports — FlowsService importa IntegrationManager que
// importa nostr-tools (ESM nao compila no Jest).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/flows/flows.service',
  () => ({ FlowsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/flows/unmatched-comment.service',
  () => ({ UnmatchedCommentService: class {} })
);

import { AutomationsInboxController } from './automations-inbox.controller';
import { UnmatchedStatus } from '@prisma/client';

describe('AutomationsInboxController', () => {
  let controller: AutomationsInboxController;
  let unmatchedService: any;
  let flowsService: any;

  beforeEach(() => {
    unmatchedService = {
      listInbox: jest.fn(),
      bindToFlow: jest.fn(),
      ignore: jest.fn(),
      listAliasesEnriched: jest.fn(),
    };
    flowsService = {
      listAliases: jest.fn(),
      addManualAlias: jest.fn(),
      removeAlias: jest.fn(),
      lookupAliasFlows: jest.fn(),
    };
    controller = new AutomationsInboxController(
      unmatchedService,
      flowsService
    );
  });

  describe('listInbox', () => {
    it('deve delegar com filtros', async () => {
      unmatchedService.listInbox.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.listInbox({ id: 'org-1' } as any, {
        integrationId: 'int-1',
        status: UnmatchedStatus.PENDING,
        page: 2,
        limit: 10,
      });

      expect(unmatchedService.listInbox).toHaveBeenCalledWith('org-1', 'int-1', {
        status: UnmatchedStatus.PENDING,
        page: 2,
        limit: 10,
      });
    });
  });

  describe('bindFromInbox', () => {
    it('deve passar userId como boundBy', async () => {
      await controller.bindFromInbox(
        { id: 'org-1' } as any,
        { id: 'u-1' } as any,
        { unmatchedCommentId: 'uc-1', flowId: 'f-1' }
      );

      expect(unmatchedService.bindToFlow).toHaveBeenCalledWith(
        'org-1',
        'uc-1',
        'f-1',
        'u-1'
      );
    });
  });

  describe('ignoreFromInbox', () => {
    it('deve passar reason e userId', async () => {
      await controller.ignoreFromInbox(
        { id: 'org-1' } as any,
        { id: 'u-1' } as any,
        { unmatchedCommentId: 'uc-1', reason: 'spam' }
      );

      expect(unmatchedService.ignore).toHaveBeenCalledWith(
        'org-1',
        'uc-1',
        'spam',
        'u-1'
      );
    });
  });

  describe('listAliases', () => {
    it('deve delegar pro service enrichment', async () => {
      unmatchedService.listAliasesEnriched.mockResolvedValue([{ id: 'a-1' }]);

      const result = await controller.listAliases(
        { id: 'org-1' } as any,
        'f-1'
      );

      expect(unmatchedService.listAliasesEnriched).toHaveBeenCalledWith(
        'org-1',
        'f-1'
      );
      expect(result).toEqual([{ id: 'a-1' }]);
    });
  });

  describe('createAlias', () => {
    it('deve delegar para addManualAlias com source MANUAL', async () => {
      await controller.createAlias(
        { id: 'org-1' } as any,
        { id: 'u-1' } as any,
        { flowId: 'f-1', aliasMediaId: 'media-X' }
      );

      expect(flowsService.addManualAlias).toHaveBeenCalledWith(
        'org-1',
        'f-1',
        'media-X',
        'u-1'
      );
    });
  });

  describe('deleteAlias', () => {
    it('deve delegar para removeAlias', async () => {
      await controller.deleteAlias({ id: 'org-1' } as any, 'a-1');

      expect(flowsService.removeAlias).toHaveBeenCalledWith('org-1', 'a-1');
    });
  });

  describe('lookupAlias', () => {
    it('deve retornar flows ligados ao media', async () => {
      flowsService.lookupAliasFlows.mockResolvedValue([
        { id: 'a-1', flowId: 'f-1', flow: { id: 'f-1', name: 'Flow A' } },
      ]);

      const result = await controller.lookupAlias({ id: 'org-1' } as any, {
        integrationId: 'int-1',
        aliasMediaId: 'media-X',
      });

      expect(flowsService.lookupAliasFlows).toHaveBeenCalledWith(
        'org-1',
        'int-1',
        'media-X'
      );
      expect(result).toHaveLength(1);
    });
  });
});
