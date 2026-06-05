// Evita carregar integration.manager -> nostr.provider -> nostr-tools (ESM) ao
// importar FlowsService transitivamente; o service e totalmente mockado aqui.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));
jest.mock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }));

import { PublicFlowsController } from './public.flows.controller';
import { HttpException } from '@nestjs/common';
import { FlowStatus } from '@prisma/client';

const makeFlowsService = () => ({
  quickCreateFlow: jest.fn(),
  quickUpdateFlow: jest.fn(),
  getFlows: jest.fn(),
  getFlow: jest.fn(),
  updateFlowStatus: jest.fn(),
  deleteFlow: jest.fn(),
});

const org = { id: 'org-1' } as any;

describe('PublicFlowsController', () => {
  let controller: PublicFlowsController;
  let flowsService: ReturnType<typeof makeFlowsService>;

  beforeEach(() => {
    flowsService = makeFlowsService();
    controller = new PublicFlowsController(flowsService as any);
  });

  describe('createFlow', () => {
    it('deve delegar para quickCreateFlow com default postMode next_publication', async () => {
      flowsService.quickCreateFlow.mockResolvedValue({ id: 'flow-1' });
      await controller.createFlow(org, undefined, undefined, {
        name: 'Receita',
        integrationId: 'int-1',
        dmMessage: 'Aqui esta o link',
      } as any);
      expect(flowsService.quickCreateFlow).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          integrationId: 'int-1',
          postMode: 'next_publication',
        }),
        undefined
      );
    });

    it('deve respeitar postMode explicito quando informado', async () => {
      flowsService.quickCreateFlow.mockResolvedValue({ id: 'flow-1' });
      await controller.createFlow(org, undefined, undefined, {
        name: 'X',
        integrationId: 'int-1',
        postMode: 'all',
      } as any);
      expect(flowsService.quickCreateFlow).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ postMode: 'all' }),
        undefined
      );
    });

    it('chave por-perfil: cria escopado ao proprio perfil', async () => {
      flowsService.quickCreateFlow.mockResolvedValue({ id: 'flow-1' });
      await controller.createFlow(org, 'perfil-A', undefined, {
        name: 'X',
        integrationId: 'int-1',
      } as any);
      expect(flowsService.quickCreateFlow).toHaveBeenCalledWith(
        'org-1',
        expect.any(Object),
        'perfil-A'
      );
    });

    it('chave de org: pode escopar a criacao a um perfil via ?profileId', async () => {
      flowsService.quickCreateFlow.mockResolvedValue({ id: 'flow-1' });
      await controller.createFlow(org, undefined, 'perfil-B', {
        name: 'X',
        integrationId: 'int-1',
      } as any);
      expect(flowsService.quickCreateFlow).toHaveBeenCalledWith(
        'org-1',
        expect.any(Object),
        'perfil-B'
      );
    });

    it('chave por-perfil: lanca 403 ao criar para outro profileId', async () => {
      const err: any = await controller
        .createFlow(org, 'perfil-A', 'perfil-B', {
          name: 'X',
          integrationId: 'int-1',
        } as any)
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(403);
      expect(flowsService.quickCreateFlow).not.toHaveBeenCalled();
    });
  });

  describe('listFlows', () => {
    it('chave de org: retorna todos os flows', async () => {
      flowsService.getFlows.mockResolvedValue([
        { id: 'f1', integrationId: 'int-1' },
        { id: 'f2', integrationId: 'int-2' },
      ]);
      const result = await controller.listFlows(org, undefined, undefined, undefined);
      expect(flowsService.getFlows).toHaveBeenCalledWith('org-1', undefined);
      expect(result).toHaveLength(2);
    });

    it('deve filtrar por integrationId quando informado', async () => {
      flowsService.getFlows.mockResolvedValue([
        { id: 'f1', integrationId: 'int-1' },
        { id: 'f2', integrationId: 'int-2' },
      ]);
      const result = await controller.listFlows(org, undefined, undefined, 'int-2');
      expect(result).toEqual([{ id: 'f2', integrationId: 'int-2' }]);
    });

    it('chave por-perfil: forca o proprio profileId', async () => {
      flowsService.getFlows.mockResolvedValue([]);
      await controller.listFlows(org, 'perfil-A', undefined, undefined);
      expect(flowsService.getFlows).toHaveBeenCalledWith('org-1', 'perfil-A');
    });

    it('chave por-perfil: lanca 403 ao pedir outro profileId', async () => {
      const err: any = await controller
        .listFlows(org, 'perfil-A', 'perfil-B', undefined)
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(403);
      expect(flowsService.getFlows).not.toHaveBeenCalled();
    });
  });

  describe('getFlow', () => {
    it('deve delegar para getFlow com escopo de perfil', async () => {
      flowsService.getFlow.mockResolvedValue({ id: 'f1' });
      await controller.getFlow(org, 'perfil-A', 'f1', undefined);
      expect(flowsService.getFlow).toHaveBeenCalledWith('org-1', 'f1', 'perfil-A');
    });

    it('chave por-perfil: lanca 403 ao pedir outro profileId', async () => {
      const err: any = await controller
        .getFlow(org, 'perfil-A', 'f1', 'perfil-B')
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(403);
      expect(flowsService.getFlow).not.toHaveBeenCalled();
    });
  });

  describe('updateFlow', () => {
    it('deve delegar para quickUpdateFlow com escopo de perfil', async () => {
      flowsService.quickUpdateFlow.mockResolvedValue({ id: 'f1' });
      await controller.updateFlow(org, undefined, 'f1', undefined, {
        name: 'Novo nome',
        integrationId: 'int-1',
      } as any);
      expect(flowsService.quickUpdateFlow).toHaveBeenCalledWith(
        'org-1',
        'f1',
        expect.objectContaining({ name: 'Novo nome' }),
        undefined
      );
    });

    it('chave por-perfil: lanca 403 ao editar para outro profileId', async () => {
      const err: any = await controller
        .updateFlow(org, 'perfil-A', 'f1', 'perfil-B', { name: 'X', integrationId: 'int-1' } as any)
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(403);
      expect(flowsService.quickUpdateFlow).not.toHaveBeenCalled();
    });
  });

  describe('updateFlowStatus', () => {
    it('deve delegar status para o service', async () => {
      flowsService.updateFlowStatus.mockResolvedValue({ id: 'f1' });
      await controller.updateFlowStatus(org, undefined, 'f1', undefined, {
        status: FlowStatus.PAUSED,
      });
      expect(flowsService.updateFlowStatus).toHaveBeenCalledWith(
        'org-1',
        'f1',
        FlowStatus.PAUSED,
        undefined
      );
    });
  });

  describe('deleteFlow', () => {
    it('chave por-perfil: delega delete com o proprio profileId', async () => {
      flowsService.deleteFlow.mockResolvedValue({ id: 'f1' });
      await controller.deleteFlow(org, 'perfil-A', 'f1', undefined);
      expect(flowsService.deleteFlow).toHaveBeenCalledWith('org-1', 'f1', 'perfil-A');
    });
  });
});
