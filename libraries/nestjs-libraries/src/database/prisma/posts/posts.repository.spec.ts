import { PostsRepository } from './posts.repository';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

describe('PostsRepository.getErrorPosts', () => {
  let repo: PostsRepository;
  let prismaMock: ReturnType<typeof createPrismaRepositoryMock<'post'>>;

  beforeEach(() => {
    prismaMock = createPrismaRepositoryMock('post');
    (prismaMock.model.post as any).findMany = jest
      .fn()
      .mockResolvedValue([] as any);
    repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  const arg = () => prismaMock.model.post.findMany.mock.calls[0][0] as any;

  it('filtra state=ERROR por org, ignora filhos de thread, janela de 30 dias e limit padrao', async () => {
    await repo.getErrorPosts('org-1');

    const a = arg();
    expect(a.where.organizationId).toBe('org-1');
    expect(a.where.state).toBe('ERROR');
    expect(a.where.deletedAt).toBeNull();
    expect(a.where.OR).toEqual([
      { profileId: null },
      { profile: { deletedAt: null } },
    ]);
    expect(a.where.parentPostId).toBeNull();
    expect(a.where.updatedAt.gte).toBeInstanceOf(Date);
    expect(a.orderBy).toEqual({ updatedAt: 'desc' });
    expect(a.take).toBe(50);
    // Seguranca: NAO seleciona `error` (serializacao crua da excecao — pode
    // conter refresh_token/client_secret). A tela so precisa da contagem.
    expect(a.select.error).toBeUndefined();
    // canal + perfil embutidos (sem N+1)
    expect(a.select.integration.select).toEqual({
      id: true,
      providerIdentifier: true,
      internalId: true,
      name: true,
      picture: true,
    });
    expect(a.select.profile.select).toEqual({ id: true, name: true });
  });

  it('aplica profileId quando informado e respeita o limit', async () => {
    await repo.getErrorPosts('org-1', 'prof-2', 10);

    const a = arg();
    expect(a.where.profileId).toBe('prof-2');
    expect(a.take).toBe(10);
  });

  it('nao filtra por profileId quando ausente', async () => {
    await repo.getErrorPosts('org-1');
    expect(arg().where.profileId).toBeUndefined();
  });
});

describe('PostsRepository.changeState', () => {
  let repo: PostsRepository;
  let prismaMock: ReturnType<typeof createPrismaRepositoryMock<'post'>>;

  beforeEach(() => {
    prismaMock = createPrismaRepositoryMock('post');
    (prismaMock.model.post as any).update = jest
      .fn()
      .mockResolvedValue({ id: 'p1', integration: {} } as any);
    repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('inclui name/picture do canal (snapshot do StatusEvent) alem do providerIdentifier', async () => {
    // Estado nao-ERROR: nao aciona o ramo da tabela `errors`, isola o include.
    await repo.changeState('p1', 'PUBLISHED' as any);

    const call = prismaMock.model.post.update.mock.calls[0][0] as any;
    expect(call.include.integration.select).toEqual({
      providerIdentifier: true,
      name: true,
      picture: true,
    });
  });
});

describe('PostsRepository - ciclo de republicacao apos erro', () => {
  let repo: PostsRepository;
  let prismaMock: ReturnType<typeof createPrismaRepositoryMock<'post'>>;

  beforeEach(() => {
    prismaMock = createPrismaRepositoryMock('post');
    prismaMock.model.post.update.mockResolvedValue({ id: 'p1' } as any);
    repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('limpa o erro atual quando a publicacao termina com sucesso', async () => {
    await repo.updatePost('p1', 'remote-1', 'https://example.com/post/1');

    expect(prismaMock.model.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        state: 'PUBLISHED',
        releaseURL: 'https://example.com/post/1',
        releaseId: 'remote-1',
        error: null,
      },
    });
  });

  it('limpa o erro atual ao reagendar uma nova tentativa', async () => {
    await repo.changeDate(
      'org-1',
      'p1',
      '2026-09-07T14:30:00.000Z',
      false,
      'schedule'
    );

    expect(prismaMock.model.post.update).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: 'p1' },
      data: {
        publishDate: new Date('2026-09-07T14:30:00.000Z'),
        state: 'QUEUE',
        releaseId: null,
        releaseURL: null,
        error: null,
      },
    });
  });

  it('preserva o erro atual quando altera somente a data', async () => {
    await repo.changeDate(
      'org-1',
      'p1',
      '2026-09-07T14:30:00.000Z',
      false,
      'update'
    );

    const call = prismaMock.model.post.update.mock.calls[0][0] as any;
    expect(call.data).toEqual({
      publishDate: new Date('2026-09-07T14:30:00.000Z'),
    });
    expect(call.data).not.toHaveProperty('error');
  });
});

describe('PostsRepository.searchForMissingThreeHoursPosts', () => {
  it('ignora posts de perfis cancelados e preserva posts legados de workspace', async () => {
    const prismaMock = createPrismaRepositoryMock('post');
    prismaMock.model.post.findMany.mockResolvedValue([] as any);
    const repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await repo.searchForMissingThreeHoursPosts();

    expect(prismaMock.model.post.findMany.mock.calls[0][0].where.OR).toEqual([
      { profileId: null },
      { profile: { deletedAt: null } },
    ]);
  });
});

describe('PostsRepository.getPost for publishing', () => {
  it('ignora a raiz quando o perfil foi cancelado', async () => {
    const prismaMock = createPrismaRepositoryMock('post');
    prismaMock.model.post.findUnique.mockResolvedValue(null);
    const repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await repo.getPost('post-1', true, 'org-1', true);

    expect(prismaMock.model.post.findUnique.mock.calls[0][0].where.OR).toEqual([
      { profileId: null },
      { profile: { deletedAt: null } },
    ]);
  });
});
