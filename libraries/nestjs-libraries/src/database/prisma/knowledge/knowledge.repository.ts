import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { KnowledgeDocumentStatus } from '@prisma/client';

@Injectable()
export class KnowledgeRepository {
  constructor(
    private _doc: PrismaRepository<'profileKnowledgeDocument'>
  ) {}

  listByProfile(profileId: string) {
    return this._doc.model.profileKnowledgeDocument.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
    });
  }

  getById(id: string) {
    return this._doc.model.profileKnowledgeDocument.findUnique({
      where: { id },
    });
  }

  create(data: {
    profileId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    return this._doc.model.profileKnowledgeDocument.create({
      data: {
        profileId: data.profileId,
        filename: data.filename,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        status: 'PROCESSING',
      },
    });
  }

  updateStatus(
    id: string,
    status: KnowledgeDocumentStatus,
    extras?: { chunkCount?: number; errorMessage?: string | null }
  ) {
    return this._doc.model.profileKnowledgeDocument.update({
      where: { id },
      data: {
        status,
        chunkCount: extras?.chunkCount ?? undefined,
        errorMessage: extras?.errorMessage ?? null,
      },
    });
  }

  delete(id: string) {
    return this._doc.model.profileKnowledgeDocument.delete({
      where: { id },
    });
  }
}
