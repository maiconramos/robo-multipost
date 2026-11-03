import { HttpException } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Organization } from '@prisma/client';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { checkAuth } from '../auth.context';
import { readRequestContext } from './tool.context.helper';

export type AgentScope = { organization: Organization; profileId?: string };

// Unlike post/automation management, an org-only media key stays org-scoped.
export function scopedAgentTool<T extends z.ZodTypeAny>(
  profiles: ProfileService,
  id: string,
  description: string,
  inputSchema: T,
  execute: (scope: AgentScope, input: z.infer<T>) => Promise<unknown>,
  readOnly: boolean,
  idempotent = readOnly
) {
  return createTool({
    id,
    description,
    inputSchema,
    mcp: {
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: false,
        idempotentHint: idempotent,
        openWorldHint: true,
      },
    },
    execute: async (raw: unknown, options: unknown) => {
      try {
        checkAuth(raw, options);
        const input = inputSchema.safeParse(raw);
        if (!input.success)
          return {
            errors: JSON.stringify([
              {
                error: 'INVALID_TOOL_INPUT',
                fields: input.error.issues.map((i) => i.path.join('.')),
              },
            ]),
          };
        const context = readRequestContext(options);
        const organization = JSON.parse(
          String(context.get('organization') || 'null')
        );
        if (typeof organization?.id !== 'string' || !organization.id)
          throw new HttpException('ORGANIZATION_REQUIRED', 401);
        const rawProfile = context.get('profileId');
        if (
          rawProfile !== undefined &&
          rawProfile !== null &&
          (typeof rawProfile !== 'string' || !rawProfile)
        )
          throw new HttpException('INVALID_PROFILE_CONTEXT', 403);
        const profileId =
          typeof rawProfile === 'string' ? rawProfile : undefined;
        if (
          profileId &&
          !(await profiles.getProfileById(organization.id, profileId))
        )
          throw new HttpException('PROFILE_NOT_FOUND', 404);
        return {
          output: await execute({ organization, profileId }, input.data),
        };
      } catch (error) {
        let code = 'TOOL_FAILED';
        if (error instanceof HttpException) {
          const body = error.getResponse();
          const candidate =
            typeof body === 'string' ? body : (body as { code?: string }).code;
          code =
            typeof candidate === 'string' &&
            /^[A-Z][A-Z0-9_]{1,64}$/.test(candidate)
              ? candidate
              : `HTTP_${error.getStatus()}`;
        }
        return { errors: JSON.stringify([{ error: code }]) };
      }
    },
  });
}
