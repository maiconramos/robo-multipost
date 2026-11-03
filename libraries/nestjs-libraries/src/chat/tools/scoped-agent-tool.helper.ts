import { HttpException } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Organization } from '@prisma/client';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { checkAuth } from '../auth.context';
import {
  agentProfileSelector,
  resolveAgentProfile,
} from './agent-profile-scope';

export type AgentScope = { organization: Organization; profileId?: string };

// Selection is request-local. Only explicitly permitted reads may remain organization-wide.
export function scopedAgentTool<T extends z.AnyZodObject>(
  profiles: ProfileService,
  id: string,
  description: string,
  inputSchema: T,
  execute: (scope: AgentScope, input: z.infer<T>) => Promise<unknown>,
  readOnly: boolean,
  idempotent = readOnly,
  requireProfile = !readOnly,
  allowProfileSelection = true
) {
  const schema = (
    allowProfileSelection
      ? inputSchema.extend({ profileId: agentProfileSelector })
      : inputSchema
  ).strict();
  return createTool({
    id,
    description,
    inputSchema: schema,
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
        const input = schema.safeParse(raw);
        if (!input.success)
          return {
            errors: JSON.stringify([
              {
                error: 'INVALID_TOOL_INPUT',
                fields: input.error.issues.map((i) => i.path.join('.')),
              },
            ]),
          };
        const { profileId: selected, ...data } = input.data as z.infer<T> & {
          profileId?: string;
        };
        const scope = await resolveAgentProfile(
          profiles,
          options,
          selected,
          requireProfile
        );
        return {
          output: await execute(scope, data as z.infer<T>),
          scope: {
            organizationId: scope.organization.id,
            profile: scope.profile,
          },
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
