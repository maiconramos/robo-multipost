import { mock, MockProxy } from 'jest-mock-extended';

/**
 * Cria um mock completo de qualquer classe usando jest-mock-extended.
 * Todos os metodos retornam jest.fn() automaticamente.
 *
 * Uso:
 *   const repo = createMock<SetsRepository>();
 *   repo.getSets.mockResolvedValue([...]);
 */
export function createMock<T>(): MockProxy<T> & T {
  return mock<T>();
}

/**
 * Cria um mock de PrismaRepository<T> com a estrutura model.[table].
 * Retorna um objeto com model.[tableName] contendo mocks de todos
 * os metodos Prisma (findMany, findFirst, create, update, delete, count, upsert).
 *
 * Uso:
 *   const prismaMock = createPrismaRepositoryMock('sets');
 *   prismaMock.model.sets.findMany.mockResolvedValue([...]);
 */
export function createPrismaRepositoryMock<TableName extends string>(
  tableName: TableName
) {
  const tableMock = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  };

  return {
    model: {
      [tableName]: tableMock,
    } as Record<TableName, typeof tableMock>,
  };
}
