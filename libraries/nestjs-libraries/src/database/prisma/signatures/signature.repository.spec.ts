import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';
import { SignatureRepository } from './signature.repository';

describe('SignatureRepository.createOrUpdateSignature - escopo de perfil', () => {
  it('nao edita assinatura de outro perfil pelo id', async () => {
    const mock = createPrismaRepositoryMock('signatures');
    mock.model.signatures.findFirst.mockResolvedValue(null);
    const repo = new SignatureRepository(mock as any);
    await expect(
      repo.createOrUpdateSignature('org', { content: 'x', autoAdd: false } as any, 'sig-B', 'prof-A')
    ).rejects.toMatchObject({ status: 404 });
    expect(mock.model.signatures.findFirst).toHaveBeenCalledWith({
      where: { id: 'sig-B', organizationId: 'org', deletedAt: null, profileId: 'prof-A' },
      select: { id: true },
    });
    expect(mock.model.signatures.upsert).not.toHaveBeenCalled();
  });

  it('editar nao move a assinatura de perfil', async () => {
    const mock = createPrismaRepositoryMock('signatures');
    mock.model.signatures.findFirst.mockResolvedValue({ id: 'sig-A' });
    mock.model.signatures.upsert.mockResolvedValue({ id: 'sig-A', profileId: 'prof-A' });
    const repo = new SignatureRepository(mock as any);
    await repo.createOrUpdateSignature('org', { content: 'novo', autoAdd: false } as any, 'sig-A', 'prof-A');
    expect(mock.model.signatures.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { organizationId: 'org', content: 'novo', autoAdd: false },
      })
    );
  });

  it('marcar como padrao so desmarca as assinaturas do mesmo perfil', async () => {
    const mock = createPrismaRepositoryMock('signatures');
    mock.model.signatures.upsert.mockResolvedValue({ id: 'sig-new', profileId: 'prof-A' });
    const repo = new SignatureRepository(mock as any);
    await repo.createOrUpdateSignature('org', { content: 'x', autoAdd: true } as any, undefined, 'prof-A');
    expect(mock.model.signatures.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org', profileId: 'prof-A', id: { not: 'sig-new' } },
      data: { autoAdd: false },
    });
  });
});
