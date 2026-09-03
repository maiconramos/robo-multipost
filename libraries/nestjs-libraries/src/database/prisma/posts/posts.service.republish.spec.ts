jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManagerMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class ShortLinkServiceMock {},
}));

import { BadRequestException } from '@nestjs/common';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { PostsRepository } from './posts.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from './posts.service';

const makeBody = (overrides: Record<string, unknown> = {}) => ({
  type: 'schedule' as const,
  shortLink: false,
  date: '2026-09-04T17:00:00.000Z',
  tags: [] as Array<{ value: string; label: string }>,
  posts: [
    {
      integration: { id: 'int-1' },
      value: [
        {
          id: 'post-1',
          content: '<p>Teste</p>',
          delay: 0,
          image: [] as Array<{ id: string; path: string }>,
        },
      ],
      settings: { __type: 'instagram' },
    },
  ],
  ...overrides,
});

const publishedPost = {
  id: 'post-1',
  organizationId: 'org-1',
  profileId: 'profile-1',
  state: 'PUBLISHED',
  publishDate: new Date('2026-09-03T12:00:00.000Z'),
  integration: {
    id: 'int-1',
    providerIdentifier: 'instagram',
  },
};

const buildService = () => {
  const repository = createMock<PostsRepository>();
  const integrationService = createMock<IntegrationService>();
  const service = new PostsService(
    repository,
    null as any,
    integrationService,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    {} as any,
    {} as any
  );

  jest.spyOn(service as any, 'startWorkflow').mockResolvedValue(undefined);
  repository.getPostById.mockResolvedValue(publishedPost as any);
  repository.createOrUpdatePost.mockResolvedValue({
    posts: [{ id: 'post-1', state: 'QUEUE' }],
  } as any);
  repository.changeDate.mockResolvedValue({ id: 'post-1' } as any);

  return { service, repository };
};

describe('PostsService - republicacao explicita', () => {
  it('rejeita salvar como schedule um post publicado sem opt-in', async () => {
    const { service, repository } = buildService();

    const result = expect(
      service.createPost('org-1', makeBody() as any, 'profile-1')
    ).rejects;
    await result.toBeInstanceOf(BadRequestException);
    await result.toThrow("use type 'update'");
    await result.toThrow('republish: true');

    expect(repository.getPostById).toHaveBeenCalledWith('post-1', 'org-1');
    expect(repository.createOrUpdatePost).not.toHaveBeenCalled();
  });

  it('valida todo o lote antes de escrever o primeiro canal', async () => {
    const { service, repository } = buildService();
    const body = makeBody() as any;
    body.posts = [
      {
        ...body.posts[0],
        value: [{ ...body.posts[0].value[0], id: undefined }],
      },
      {
        ...body.posts[0],
        integration: { id: 'int-2' },
        value: [{ ...body.posts[0].value[0], id: 'post-2' }],
      },
    ];

    await expect(
      service.createPost('org-1', body, 'profile-1')
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.getPostById).toHaveBeenCalledWith('post-2', 'org-1');
    expect(repository.createOrUpdatePost).not.toHaveBeenCalled();
  });

  it('exige booleano true real para autorizar a republicacao', async () => {
    const { service, repository } = buildService();

    await expect(
      service.createPost(
        'org-1',
        makeBody({ republish: 'true' }) as any,
        'profile-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.createOrUpdatePost).not.toHaveBeenCalled();
  });

  it('permite republicar quando o cliente envia republish true', async () => {
    const { service, repository } = buildService();

    await service.createPost(
      'org-1',
      makeBody({ republish: true }) as any,
      'profile-1'
    );

    expect(repository.getPostById).toHaveBeenCalledWith('post-1', 'org-1');
    expect(repository.createOrUpdatePost).toHaveBeenCalledTimes(1);
  });

  it('rejeita republicacao fora do perfil mesmo com opt-in', async () => {
    const { service, repository } = buildService();
    repository.getPostById.mockResolvedValue({
      ...publishedPost,
      profileId: 'profile-2',
    } as any);

    await expect(
      service.createPost(
        'org-1',
        makeBody({ republish: true }) as any,
        'profile-1'
      )
    ).rejects.toThrow('Post does not belong to this profile');

    expect(repository.createOrUpdatePost).not.toHaveBeenCalled();
  });

  it('rejeita id de post inexistente antes do upsert', async () => {
    const { service, repository } = buildService();
    repository.getPostById.mockResolvedValue(null);

    await expect(
      service.createPost(
        'org-1',
        makeBody({ type: 'update' }) as any,
        'profile-1'
      )
    ).rejects.toThrow('Post not found');

    expect(repository.createOrUpdatePost).not.toHaveBeenCalled();
  });

  it('nao bloqueia o agendamento de um post que ainda esta na fila', async () => {
    const { service, repository } = buildService();
    repository.getPostById.mockResolvedValue({
      ...publishedPost,
      state: 'QUEUE',
    } as any);

    await service.createPost('org-1', makeBody() as any, 'profile-1');

    expect(repository.createOrUpdatePost).toHaveBeenCalledTimes(1);
  });

  it('mantem updates de conteudo de posts publicados sem exigir republicacao', async () => {
    const { service, repository } = buildService();

    await service.createPost(
      'org-1',
      makeBody({ type: 'update' }) as any,
      'profile-1'
    );

    expect(repository.getPostById).toHaveBeenCalledWith('post-1', 'org-1');
    expect(repository.createOrUpdatePost).toHaveBeenCalledTimes(1);
  });

  it('usa update como default seguro ao alterar apenas a data', async () => {
    const { service, repository } = buildService();

    await service.changeDate(
      'org-1',
      'post-1',
      '2026-09-04T17:00:00.000Z',
      undefined,
      'profile-1'
    );

    expect(repository.changeDate).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      '2026-09-04T17:00:00.000Z',
      false,
      'update'
    );
    expect((service as any).startWorkflow).not.toHaveBeenCalled();
  });

  it('rejeita reagendar um post publicado sem opt-in antes de qualquer escrita', async () => {
    const { service, repository } = buildService();

    await expect(
      service.changeDate(
        'org-1',
        'post-1',
        '2026-09-04T17:00:00.000Z',
        'schedule',
        'profile-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.changeDate).not.toHaveBeenCalled();
    expect((service as any).startWorkflow).not.toHaveBeenCalled();
  });

  it('preserva profileId e permite reagendar com opt-in explicito', async () => {
    const { service, repository } = buildService();

    await service.changeDate(
      'org-1',
      'post-1',
      '2026-09-04T17:00:00.000Z',
      'schedule',
      'profile-1',
      true
    );

    expect(repository.changeDate).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      '2026-09-04T17:00:00.000Z',
      false,
      'schedule'
    );
    expect((service as any).startWorkflow).toHaveBeenCalledTimes(1);
  });

  it('reagenda um post em fila sem exigir opt-in de republicacao', async () => {
    const { service, repository } = buildService();
    repository.getPostById.mockResolvedValue({
      ...publishedPost,
      state: 'QUEUE',
    } as any);

    await service.changeDate(
      'org-1',
      'post-1',
      '2026-09-04T17:00:00.000Z',
      'schedule',
      'profile-1'
    );

    expect(repository.changeDate).toHaveBeenCalledTimes(1);
    expect((service as any).startWorkflow).toHaveBeenCalledTimes(1);
  });

  it('nao aceita string como opt-in ao reagendar', async () => {
    const { service, repository } = buildService();

    await expect(
      service.changeDate(
        'org-1',
        'post-1',
        '2026-09-04T17:00:00.000Z',
        'schedule',
        'profile-1',
        'true' as any
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.changeDate).not.toHaveBeenCalled();
  });
});
