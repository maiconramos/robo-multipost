import { PostgresStore, PgVector } from '@mastra/pg';

export const pStore = new PostgresStore({
  connectionString: process.env.DATABASE_URL,
});

const knowledgeBaseEnabled = (): boolean => {
  const raw = process.env.ENABLE_KNOWLEDGE_BASE;
  if (raw === undefined || raw === null || raw === '') return true;
  return raw.toLowerCase() !== 'false' && raw !== '0';
};

export const isKnowledgeBaseEnabled = knowledgeBaseEnabled();

export const pgVector: PgVector | null = isKnowledgeBaseEnabled
  ? new PgVector({ connectionString: process.env.DATABASE_URL! })
  : null;
