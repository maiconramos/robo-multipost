import { HttpException, Injectable, Logger } from '@nestjs/common';
import { KnowledgeRepository } from '@gitroom/nestjs-libraries/database/prisma/knowledge/knowledge.repository';
import { ProfileRepository } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.repository';
import { pgVector, isKnowledgeBaseEnabled } from '@gitroom/nestjs-libraries/chat/mastra.store';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const EMBEDDING_DIMENSION = 1536; // text-embedding-3-small

export const getKnowledgeIndexName = (profileId: string): string =>
  `kb_${profileId.replace(/-/g, '')}`;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private _knowledgeRepository: KnowledgeRepository,
    private _profileRepository: ProfileRepository
  ) {}

  get enabled(): boolean {
    return isKnowledgeBaseEnabled && !!pgVector;
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new HttpException('Knowledge Base is disabled', 403);
    }
  }

  private async assertOwnership(orgId: string, profileId: string) {
    const profile = await this._profileRepository.getProfileById(orgId, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
  }

  async list(orgId: string, profileId: string) {
    this.assertEnabled();
    await this.assertOwnership(orgId, profileId);
    return this._knowledgeRepository.listByProfile(profileId);
  }

  async upload(
    orgId: string,
    profileId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    this.assertEnabled();
    await this.assertOwnership(orgId, profileId);

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new HttpException(
        `Unsupported file type. Allowed: PDF, TXT, MD`,
        400
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new HttpException('File too large (max 10MB)', 413);
    }

    const record = await this._knowledgeRepository.create({
      profileId,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });

    this.processDocument(record.id, profileId, file).catch((err) => {
      this.logger.error(`Failed to process document ${record.id}: ${err.message}`);
    });

    return record;
  }

  async delete(orgId: string, profileId: string, documentId: string) {
    this.assertEnabled();
    await this.assertOwnership(orgId, profileId);

    const doc = await this._knowledgeRepository.getById(documentId);
    if (!doc || doc.profileId !== profileId) {
      throw new HttpException('Document not found', 404);
    }

    const indexName = getKnowledgeIndexName(profileId);
    try {
      // Best-effort: delete chunks belonging to this document via metadata filter
      if (pgVector) {
        await pgVector.deleteVectors({
          indexName,
          filter: { documentId },
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to delete vector chunks for doc ${documentId}: ${(err as Error).message}`);
    }

    await this._knowledgeRepository.delete(documentId);
    return { success: true };
  }

  private async extractText(file: {
    mimetype: string;
    buffer: Buffer;
  }): Promise<string> {
    if (file.mimetype === 'application/pdf') {
      // pdf-parse is CJS; use require-style dynamic import
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(file.buffer);
      return result.text;
    }
    return file.buffer.toString('utf-8');
  }

  private async processDocument(
    documentId: string,
    profileId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    try {
      const text = await this.extractText(file);
      if (!text || !text.trim()) {
        throw new Error('Document appears to be empty');
      }

      const mDoc = MDocument.fromText(text, {
        profileId,
        documentId,
        filename: file.originalname,
      });
      const chunks = await mDoc.chunk({
        strategy: 'recursive',
        maxSize: 512,
        overlap: 50,
      });

      if (chunks.length === 0) {
        throw new Error('No chunks produced from document');
      }

      const { embeddings } = await embedMany({
        model: openai.embedding('text-embedding-3-small') as any,
        values: chunks.map((c) => c.text),
      });

      if (!pgVector) throw new Error('PgVector not initialized');

      const indexName = getKnowledgeIndexName(profileId);
      await pgVector.createIndex({
        indexName,
        dimension: EMBEDDING_DIMENSION,
      }).catch(() => {
        /* index may already exist */
      });

      await pgVector.upsert({
        indexName,
        vectors: embeddings,
        metadata: chunks.map((c) => ({
          profileId,
          documentId,
          filename: file.originalname,
          text: c.text,
        })),
      });

      await this._knowledgeRepository.updateStatus(documentId, 'READY', {
        chunkCount: chunks.length,
      });
      this.logger.log(`Indexed document ${documentId} with ${chunks.length} chunks`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Failed to index ${documentId}: ${message}`);
      await this._knowledgeRepository
        .updateStatus(documentId, 'FAILED', { errorMessage: message })
        .catch(() => undefined);
    }
  }

  async query(profileId: string, queryText: string, topK = 4) {
    if (!this.enabled || !pgVector) return [];
    try {
      const { embeddings } = await embedMany({
        model: openai.embedding('text-embedding-3-small') as any,
        values: [queryText],
      });
      const indexName = getKnowledgeIndexName(profileId);
      const results = await pgVector.query({
        indexName,
        queryVector: embeddings[0],
        topK,
        filter: { profileId },
      });
      return results.map((r: any) => ({
        score: r.score,
        text: r.metadata?.text,
        filename: r.metadata?.filename,
      }));
    } catch (err) {
      this.logger.warn(`Knowledge query failed: ${(err as Error).message}`);
      return [];
    }
  }
}
