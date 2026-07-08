// Os repositories importados puxam integration.manager (nostr-tools e ESM),
// redis (conexao no load) e upload.factory (createStorage no construtor). Mocks
// seguem o padrao dos demais specs do repo.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn().mockReturnValue({}) },
}));

import { StatusService } from './status.service';

const org = { id: 'org-1' } as any;

const build = (integ: any, posts: any, flows: any) =>
  new StatusService(integ as any, posts as any, flows as any);

describe('StatusService', () => {
  describe('getProblems', () => {
    it('classifica severidade e embute o perfil de origem por item', async () => {
      const integ = {
        getProblemChannels: jest.fn().mockResolvedValue([
          {
            id: 'i1',
            providerIdentifier: 'linkedin',
            internalId: 'in1',
            name: 'LI',
            picture: null,
            refreshNeeded: true,
            disabled: false,
            refreshError: 'ApplicationFailure: expired',
            refreshErrorAt: new Date('2026-07-06T00:00:00.000Z'),
            clientProfile: { id: 'p1', name: 'Cliente A' },
          },
          {
            id: 'i2',
            providerIdentifier: 'instagram',
            internalId: 'in2',
            name: 'IG',
            picture: null,
            refreshNeeded: false,
            disabled: true,
            refreshError: null,
            refreshErrorAt: null,
            clientProfile: null,
          },
        ]),
      };
      const posts = {
        getErrorPosts: jest.fn().mockResolvedValue([
          {
            id: 'po1',
            error: 'bad_body',
            updatedAt: new Date('2026-07-06T00:00:00.000Z'),
            integration: {
              id: 'i1',
              providerIdentifier: 'linkedin',
              name: 'LI',
              picture: null,
            },
            profile: { id: 'p1', name: 'Cliente A' },
          },
        ]),
      };
      const flows = {
        getFailedExecutions: jest.fn().mockResolvedValue([
          {
            id: 'f1',
            error: 'boom',
            createdAt: new Date('2026-07-06T00:00:00.000Z'),
            flow: { id: 'fl1', name: 'Link na bio', profile: { id: 'p2', name: 'Cliente B' } },
          },
        ]),
      };

      const result = await build(integ, posts, flows).getProblems(org);

      // canal com token morto -> critico; so desativado -> atencao
      expect(result.channels[0].severity).toBe('critical');
      expect(result.channels[0].reason).toBe('ApplicationFailure: expired');
      expect(result.channels[0].reasonAt).toBe('2026-07-06T00:00:00.000Z');
      expect(result.channels[0].profile).toEqual({ id: 'p1', name: 'Cliente A' });
      expect(result.channels[1].severity).toBe('warning');
      expect(result.channels[1].profile).toBeNull();

      // post sempre critico, com canal + perfil
      expect(result.posts[0].severity).toBe('critical');
      expect(result.posts[0].channel?.identifier).toBe('linkedin');
      expect(result.posts[0].profile).toEqual({ id: 'p1', name: 'Cliente A' });

      // automacao sempre atencao, perfil via flow
      expect(result.automations[0].severity).toBe('warning');
      expect(result.automations[0].flowName).toBe('Link na bio');
      expect(result.automations[0].profile).toEqual({ id: 'p2', name: 'Cliente B' });

      // summary: 1 canal critico + 1 post = 2 criticos; 1 canal warning + 1 automacao = 2
      expect(result.summary).toEqual({
        critical: 2,
        warning: 2,
        total: 4,
        truncated: false,
      });
    });

    it('summary.total=0 quando nao ha problemas', async () => {
      const result = await build(
        { getProblemChannels: jest.fn().mockResolvedValue([]) },
        { getErrorPosts: jest.fn().mockResolvedValue([]) },
        { getFailedExecutions: jest.fn().mockResolvedValue([]) }
      ).getProblems(org);

      expect(result.summary.total).toBe(0);
      expect(result.summary.truncated).toBe(false);
      expect(result.channels).toEqual([]);
    });

    it('post sem integracao (canal removido) vira channel:null', async () => {
      const result = await build(
        { getProblemChannels: jest.fn().mockResolvedValue([]) },
        {
          getErrorPosts: jest.fn().mockResolvedValue([
            { id: 'po1', error: 'x', updatedAt: new Date('2026-07-06T00:00:00.000Z'), integration: null, profile: null },
          ]),
        },
        { getFailedExecutions: jest.fn().mockResolvedValue([]) }
      ).getProblems(org);

      expect(result.posts[0].channel).toBeNull();
      expect(result.posts[0].profile).toBeNull();
    });

    it('repassa profileId aos tres repositories', async () => {
      const integ = { getProblemChannels: jest.fn().mockResolvedValue([]) };
      const posts = { getErrorPosts: jest.fn().mockResolvedValue([]) };
      const flows = { getFailedExecutions: jest.fn().mockResolvedValue([]) };

      await build(integ, posts, flows).getProblems(org, 'prof-9');

      expect(integ.getProblemChannels).toHaveBeenCalledWith('org-1', 'prof-9');
      expect(posts.getErrorPosts).toHaveBeenCalledWith('org-1', 'prof-9', 50);
      expect(flows.getFailedExecutions).toHaveBeenCalledWith('org-1', 'prof-9', 50);
    });
  });
});
