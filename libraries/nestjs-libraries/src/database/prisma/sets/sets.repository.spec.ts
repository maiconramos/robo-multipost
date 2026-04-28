import { SetsRepository } from './sets.repository';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

/**
 * Exemplo de TDD para SetsRepository.
 *
 * Demonstra como mockar PrismaRepository<'sets'> sem banco de dados real.
 * O mock simula a estrutura model.sets com todos os metodos Prisma.
 */
describe('SetsRepository', () => {
  let repository: SetsRepository;
  let prismaMock: ReturnType<typeof createPrismaRepositoryMock<'sets'>>;

  beforeEach(() => {
    prismaMock = createPrismaRepositoryMock('sets');
    // Instanciar o repository injetando o mock no lugar do PrismaRepository
    repository = new SetsRepository(prismaMock as any);
  });

  describe('getTotal', () => {
    it('deve contar sets por organizacao', async () => {
      prismaMock.model.sets.count.mockResolvedValue(7);

      const result = await repository.getTotal('org-123');

      expect(prismaMock.model.sets.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
      });
      expect(result).toBe(7);
    });

    it('deve filtrar por profileId quando fornecido', async () => {
      prismaMock.model.sets.count.mockResolvedValue(2);

      const result = await repository.getTotal('org-123', 'profile-456');

      expect(prismaMock.model.sets.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-123', profileId: 'profile-456' },
      });
      expect(result).toBe(2);
    });
  });

  describe('getSets', () => {
    it('deve buscar sets ordenados por data de criacao decrescente', async () => {
      const mockSets = [
        {
          id: '1',
          name: 'Set A',
          content: 'A',
          organizationId: 'org-123',
          createdAt: new Date(),
        },
      ];
      prismaMock.model.sets.findMany.mockResolvedValue(mockSets);

      const result = await repository.getSets('org-123');

      expect(prismaMock.model.sets.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockSets);
    });
  });

  describe('deleteSet', () => {
    it('deve deletar set por id e organizacao', async () => {
      prismaMock.model.sets.delete.mockResolvedValue({} as any);

      await repository.deleteSet('org-123', 'set-1');

      expect(prismaMock.model.sets.delete).toHaveBeenCalledWith({
        where: { id: 'set-1', organizationId: 'org-123' },
      });
    });

    it('deve incluir profileId no filtro quando fornecido', async () => {
      prismaMock.model.sets.delete.mockResolvedValue({} as any);

      await repository.deleteSet('org-123', 'set-1', 'profile-456');

      expect(prismaMock.model.sets.delete).toHaveBeenCalledWith({
        where: {
          id: 'set-1',
          organizationId: 'org-123',
          profileId: 'profile-456',
        },
      });
    });
  });

  describe('createSet', () => {
    it('deve fazer upsert com os dados do DTO', async () => {
      const dto = { name: 'Meu Set', content: 'Conteudo aqui' };
      prismaMock.model.sets.upsert.mockResolvedValue({ id: 'new-id' } as any);

      const result = await repository.createSet('org-123', dto as any);

      expect(prismaMock.model.sets.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-123' }),
          create: expect.objectContaining({
            organizationId: 'org-123',
            name: 'Meu Set',
            content: 'Conteudo aqui',
          }),
          update: { name: 'Meu Set', content: 'Conteudo aqui' },
        })
      );
      expect(result).toEqual({ id: 'new-id' });
    });
  });
});
