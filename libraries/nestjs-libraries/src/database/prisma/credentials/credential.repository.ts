import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class CredentialRepository {
  constructor(
    private _credential: PrismaRepository<'providerCredential'>
  ) {}

  async upsert(organizationId: string, provider: string, encryptedData: string, profileId?: string) {
    const existing = await this.findByProvider(organizationId, provider, profileId);
    if (existing) {
      return this._credential.model.providerCredential.update({
        where: { id: existing.id },
        data: { encryptedData },
      });
    }
    return this._credential.model.providerCredential.create({
      data: {
        organizationId,
        provider,
        encryptedData,
        ...(profileId ? { profileId } : {}),
      },
    });
  }

  findByProvider(organizationId: string, provider: string, profileId?: string) {
    return this._credential.model.providerCredential.findFirst({
      where: {
        organizationId,
        provider,
        ...(profileId ? { profileId } : {}),
      },
    });
  }

  findAllByOrg(organizationId: string, profileId?: string) {
    return this._credential.model.providerCredential.findMany({
      where: {
        organizationId,
        ...(profileId ? { profileId } : {}),
      },
      select: {
        provider: true,
        updatedAt: true,
      },
    });
  }

  delete(organizationId: string, provider: string, profileId?: string) {
    return this._credential.model.providerCredential.deleteMany({
      where: {
        organizationId,
        provider,
        ...(profileId ? { profileId } : {}),
      },
    });
  }
}
