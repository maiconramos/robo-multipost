import { InfraHealthRepository } from './infra-health.repository';

describe('InfraHealthRepository', () => {
  it('ping executa SELECT 1 como tagged template (sem interpolacao)', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const repo = new InfraHealthRepository(prisma as any);

    await repo.ping();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    // tagged template → 1o argumento e um TemplateStringsArray (array), nao string
    const firstArg = prisma.$queryRaw.mock.calls[0][0];
    expect(Array.isArray(firstArg)).toBe(true);
    expect(firstArg.join('')).toContain('SELECT 1');
  });
});
