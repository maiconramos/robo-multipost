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
