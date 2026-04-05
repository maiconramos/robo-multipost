import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { isKnowledgeBaseEnabled } from '@gitroom/nestjs-libraries/chat/mastra.store';

@Injectable()
export class VectorInitService implements OnModuleInit {
  private readonly logger = new Logger(VectorInitService.name);

  async onModuleInit() {
    if (!isKnowledgeBaseEnabled) {
      this.logger.log('Knowledge Base disabled via ENABLE_KNOWLEDGE_BASE=false');
      return;
    }
    if (!process.env.DATABASE_URL) {
      this.logger.warn('DATABASE_URL not set; skipping pgvector init');
      return;
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
      this.logger.log('pgvector extension enabled');
    } catch (err) {
      this.logger.error(
        `Failed to enable pgvector extension — Knowledge Base features will degrade. ${(err as Error).message}`
      );
    } finally {
      await pool.end();
    }
  }
}
