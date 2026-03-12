import { SetsService } from './sets.service';
import { SetsRepository } from './sets.repository';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MockProxy } from 'jest-mock-extended';
import { SetsDto } from '@gitroom/nestjs-libraries/dtos/sets/sets.dto';

/**
 * Exemplo de TDD para SetsService.
 *
 * Abordagem: instanciacao direta (sem TestingModule do NestJS).
 * Para services com poucas dependencias, instanciar diretamente
 * e mais simples e rapido que montar um modulo de teste.
 *
 * Pattern: ARRANGE → ACT → ASSERT
 */
describe('SetsService', () => {
  let service: SetsService;
  let repository: MockProxy<SetsRepository> & SetsRepository;

  beforeEach(() => {
    // ARRANGE: criar mock do repository e instanciar o service
    repository = createMock<SetsRepository>();
    service = new SetsService(repository);
  });

  describe('getTotal', () => {
    it('deve delegar ao repository com orgId', async () => {
      // ARRANGE
      repository.getTotal.mockResolvedValue(5);

      // ACT
      const result = await service.getTotal('org-123');

      // ASSERT
      expect(repository.getTotal).toHaveBeenCalledWith('org-123', undefined);
      expect(result).toBe(5);
    });

    it('deve passar profileId quando fornecido', async () => {
      repository.getTotal.mockResolvedValue(3);

      const result = await service.getTotal('org-123', 'profile-456');

      expect(repository.getTotal).toHaveBeenCalledWith(
        'org-123',
        'profile-456'
      );
      expect(result).toBe(3);
    });
  });

  describe('getSets', () => {
    it('deve retornar os sets do repository', async () => {
      const mockSets = [
        {
          id: '1',
          name: 'Set A',
          content: 'Conteudo A',
          profileId: 'p1',
          organizationId: 'org-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      repository.getSets.mockResolvedValue(mockSets);

      const result = await service.getSets('org-123');

      expect(repository.getSets).toHaveBeenCalledWith('org-123', undefined);
      expect(result).toEqual(mockSets);
    });
  });

  describe('createSet', () => {
    it('deve criar um set delegando ao repository', async () => {
      const dto: SetsDto = { name: 'Novo Set', content: 'Conteudo do set' };
      const mockResult = { id: 'new-id' };
      repository.createSet.mockResolvedValue(mockResult);

      const result = await service.createSet('org-123', dto);

      expect(repository.createSet).toHaveBeenCalledWith(
        'org-123',
        dto,
        undefined
      );
      expect(result).toEqual(mockResult);
    });

    it('deve passar profileId ao criar set', async () => {
      const dto: SetsDto = { name: 'Set', content: 'Conteudo' };
      repository.createSet.mockResolvedValue({ id: 'id-1' });

      await service.createSet('org-123', dto, 'profile-456');

      expect(repository.createSet).toHaveBeenCalledWith(
        'org-123',
        dto,
        'profile-456'
      );
    });
  });

  describe('deleteSet', () => {
    it('deve deletar um set pelo id', async () => {
      repository.deleteSet.mockResolvedValue(undefined);

      await service.deleteSet('org-123', 'set-789');

      expect(repository.deleteSet).toHaveBeenCalledWith(
        'org-123',
        'set-789',
        undefined
      );
    });
  });
});
