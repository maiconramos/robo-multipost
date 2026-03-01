import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class CredentialRepository {
  constructor(
    private _credential: PrismaRepository<'providerCredential'>
  ) {}

  upsert(organizationId: string, provider: string, encryptedData: string) {
    return this._credential.model.providerCredential.upsert({
      where: {
        organizationId_provider: { organizationId, provider },
      },
      create: {
        organizationId,
        provider,
        encryptedData,
      },
      update: {
        encryptedData,
      },
    });
  }

  findByProvider(organizationId: string, provider: string) {
    return this._credential.model.providerCredential.findUnique({
      where: {
        organizationId_provider: { organizationId, provider },
      },
    });
  }

  findAllByOrg(organizationId: string) {
    return this._credential.model.providerCredential.findMany({
      where: { organizationId },
      select: {
        provider: true,
        updatedAt: true,
      },
    });
  }

  delete(organizationId: string, provider: string) {
    return this._credential.model.providerCredential.delete({
      where: {
        organizationId_provider: { organizationId, provider },
      },
    });
  }
}
