import { ProfileService } from '../../database/prisma/profiles/profile.service';
import {
  agentProfileSelector,
  resolveAgentProfile,
} from './agent-profile-scope';
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { KnowledgeService } from '@gitroom/nestjs-libraries/database/prisma/knowledge/knowledge.service';
import { readRequestContext } from '@gitroom/nestjs-libraries/chat/tools/tool.context.helper';

@Injectable()
export class KnowledgeQueryTool implements AgentToolInterface {
  constructor(
    private _knowledgeService: KnowledgeService,
    private readonly profiles: ProfileService
  ) {}
  name = 'knowledgeBaseQuery';

  run() {
    return createTool({
      id: 'knowledgeBaseQuery',
      description:
        'Query the profile knowledge base (uploaded documents like briefings, catalogs, PDFs) for factual information before generating content. Use this BEFORE writing posts that mention specific products, prices, features or facts about the brand.',
      inputSchema: z.object({
        profileId: agentProfileSelector,
        query: z
          .string()
          .describe('Natural language question or keyword search'),
        topK: z.number().optional().default(4),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            score: z.number().optional(),
            text: z.string().optional(),
            filename: z.string().optional(),
          })
        ),
      }),
      execute: async (input: any, options: any) => {
        checkAuth(input, options);
        const { profileId } = await resolveAgentProfile(
          this.profiles,
          options,
          input.profileId,
          true
        );
        const results = await this._knowledgeService.query(
          profileId,
          input.query,
          input.topK || 4
        );
        return { results };
      },
    });
  }
}
