import { RepostRepository } from './repost.repository';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

describe('RepostRepository', () => {
  let repository: RepostRepository;
  let prismaMock: ReturnType<typeof createPrismaRepositoryMock<'repostRule'>>;

  beforeEach(() => {
    prismaMock = createPrismaRepositoryMock('repostRule');
    // RepostRepository tem 4 args; so o primeiro (repostRule) e exercitado aqui.
    repository = new RepostRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  describe('findAllEnabled', () => {
    it('busca regras habilitadas e nao deletadas, selecionando id e organizationId', async () => {
      prismaMock.model.repostRule.findMany.mockResolvedValue([
        { id: 'r1', organizationId: 'o1' },
      ] as any);

      const result = await repository.findAllEnabled();

      expect(prismaMock.model.repostRule.findMany).toHaveBeenCalledWith({
        where: { enabled: true, deletedAt: null },
        select: { id: true, organizationId: true },
      });
      expect(result).toEqual([{ id: 'r1', organizationId: 'o1' }]);
    });
  });
});
