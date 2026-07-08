// Mocks topo-de-modulo: FlowsService importa IntegrationManager (nostr.provider
// ESM-only que quebra ts-jest) e serviços que o puxam transitivamente. Nada
// disso é usado pelo caminho de updateExecution.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManagerMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service',
  () => ({ InstagramMessagingService: class InstagramMessagingServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service',
  () => ({ CredentialService: class CredentialServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service',
  () => ({ ProfileService: class ProfileServiceMock {} })
);

import { FlowsService } from './flows.service';

const CTX = {
  id: 'exec-1',
  flow: {
    id: 'flow-7',
    name: 'Auto-DM',
    organizationId: 'org-1',
    profileId: 'prof-9',
    integration: {
      id: 'int-1',
      providerIdentifier: 'instagram',
      name: 'IG do Cliente',
      picture: 'https://cdn/ig.jpg',
    },
  },
};

const buildService = (repo: any, statusEvent: any) =>
  new FlowsService(
    repo as any,
    null as any, // temporalService
    null as any, // integrationService
    null as any, // integrationManager
    null as any, // credentialService
    null as any, // instagramMessaging
    null as any, // profileService
    {} as any, // encryption
    statusEvent as any
  );

describe('FlowsService.updateExecution (StatusEvent AUTOMATION_FAILED)', () => {
  it('registra AUTOMATION_FAILED com snapshot do canal quando status FAILED', async () => {
    const repo = {
      updateExecution: jest.fn().mockResolvedValue({ id: 'exec-1' }),
      getExecutionEventContext: jest.fn().mockResolvedValue(CTX),
    };
    const statusEvent = { record: jest.fn().mockResolvedValue(undefined) };
    const service = buildService(repo, statusEvent);

    await service.updateExecution('exec-1', {
      status: 'FAILED' as any,
      error: 'Temporal indisponível',
      completedAt: new Date(),
    });

    expect(repo.getExecutionEventContext).toHaveBeenCalledWith('exec-1');
    expect(statusEvent.record).toHaveBeenCalledTimes(1);
    expect(statusEvent.record).toHaveBeenCalledWith({
      organizationId: 'org-1',
      type: 'AUTOMATION_FAILED',
      severity: 'WARNING',
      message: 'Temporal indisponível',
      profileId: 'prof-9',
      integrationId: 'int-1',
      channelName: 'IG do Cliente',
      channelPicture: 'https://cdn/ig.jpg',
      providerIdentifier: 'instagram',
      entityId: 'flow-7', // link -> /automacoes/:flowId
    });
  });

  it('NAO registra evento para transicoes que nao sao FAILED (caminho quente)', async () => {
    const repo = {
      updateExecution: jest.fn().mockResolvedValue({ id: 'exec-1' }),
      getExecutionEventContext: jest.fn(),
    };
    const statusEvent = { record: jest.fn() };
    const service = buildService(repo, statusEvent);

    await service.updateExecution('exec-1', { currentNodeId: 'node-2' });

    expect(repo.getExecutionEventContext).not.toHaveBeenCalled();
    expect(statusEvent.record).not.toHaveBeenCalled();
  });

  it('nao registra quando o contexto da execucao nao e encontrado (evita evento orfao)', async () => {
    const repo = {
      updateExecution: jest.fn().mockResolvedValue({ id: 'exec-1' }),
      getExecutionEventContext: jest.fn().mockResolvedValue(null),
    };
    const statusEvent = { record: jest.fn() };
    const service = buildService(repo, statusEvent);

    await service.updateExecution('exec-1', { status: 'FAILED' as any });

    expect(statusEvent.record).not.toHaveBeenCalled();
  });
});
