import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SignatureDto } from '@gitroom/nestjs-libraries/dtos/signature/signature.dto';

@Injectable()
export class SignatureRepository {
  constructor(private _signatures: PrismaRepository<'signatures'>) {}

  getSignaturesByOrgId(orgId: string, profileId?: string) {
    return this._signatures.model.signatures.findMany({
      where: { organizationId: orgId, deletedAt: null, ...(profileId ? { profileId } : {}) },
    });
  }

  getDefaultSignature(orgId: string, profileId?: string) {
    return this._signatures.model.signatures.findFirst({
      where: { organizationId: orgId, autoAdd: true, deletedAt: null, ...(profileId ? { profileId } : {}) },
    });
  }

  async createOrUpdateSignature(
    orgId: string,
    signature: SignatureDto,
    id?: string,
    profileId?: string
  ) {
    // editar por id so dentro do proprio perfil; a edicao nao move o perfil
    if (id) {
      const existing = await this._signatures.model.signatures.findFirst({
        where: {
          id,
          organizationId: orgId,
          deletedAt: null,
          ...(profileId ? { profileId } : {}),
        },
        select: { id: true },
      });
      if (!existing) {
        throw new HttpException('Signature not found', HttpStatus.NOT_FOUND);
      }
    }

    const values = {
      organizationId: orgId,
      content: signature.content,
      autoAdd: signature.autoAdd,
    };

    const { id: updatedId, profileId: savedProfileId } =
      await this._signatures.model.signatures.upsert({
        where: { id: id || uuidv4(), organizationId: orgId },
        update: values,
        create: { ...values, ...(profileId ? { profileId } : {}) },
      });

    // assinatura padrao e por perfil: so desmarca as do mesmo perfil
    if (values.autoAdd) {
      await this._signatures.model.signatures.updateMany({
        where: {
          organizationId: orgId,
          profileId: savedProfileId ?? null,
          id: { not: updatedId },
        },
        data: { autoAdd: false },
      });
    }

    return { id: updatedId };
  }

  deleteSignature(orgId: string, id: string, profileId?: string) {
    return this._signatures.model.signatures.update({
      where: { id, organizationId: orgId, ...(profileId ? { profileId } : {}) },
      data: { deletedAt: new Date() },
    });
  }
}
