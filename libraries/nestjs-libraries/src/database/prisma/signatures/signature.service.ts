import { Injectable } from '@nestjs/common';
import { SignatureRepository } from '@gitroom/nestjs-libraries/database/prisma/signatures/signature.repository';
import { SignatureDto } from '@gitroom/nestjs-libraries/dtos/signature/signature.dto';

@Injectable()
export class SignatureService {
  constructor(private _signatureRepository: SignatureRepository) {}

  getSignaturesByOrgId(orgId: string, profileId?: string) {
    return this._signatureRepository.getSignaturesByOrgId(orgId, profileId);
  }

  getDefaultSignature(orgId: string, profileId?: string) {
    return this._signatureRepository.getDefaultSignature(orgId, profileId);
  }

  createOrUpdateSignature(orgId: string, signature: SignatureDto, id?: string, profileId?: string) {
    return this._signatureRepository.createOrUpdateSignature(
      orgId,
      signature,
      id,
      profileId
    );
  }

  deleteSignature(orgId: string, id: string) {
    return this._signatureRepository.deleteSignature(orgId, id);
  }
}
