import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { HttpException } from '@nestjs/common';
import { checkAuth } from '../auth.context';
import { agentIdentity, agentProfileSelector } from './agent-profile-scope';
import {
  AutomationManagementService,
  automationErrorCode,
} from '../../integrations/automations/automation-management.service';
import type { FlowScope } from '../../dtos/flows/flow-v2.dto';

export function automationTool<T extends z.AnyZodObject>(
  service: Pick<AutomationManagementService, 'scope'>,
  id: string,
  description: string,
  inputSchema: T,
  execute: (scope: FlowScope, input: z.infer<T>) => unknown | Promise<unknown>,
  organizationRead?: (
    organizationId: string,
    input: z.infer<T>
  ) => unknown | Promise<unknown>
) {
  const schema = inputSchema
    .extend({ profileId: agentProfileSelector })
    .strict();
  return createTool({
    id,
    description:
      description +
      ' profileId seleciona o cliente por chamada para chave de organização; chave de perfil não pode acessar outro. Sem perfil, apenas listagens gerais habilitadas abrangem a organização. Demais operações retornam PROFILE_REQUIRED; nunca usam Default implicitamente.',
    inputSchema: schema,
    execute: async (raw: unknown, options: unknown) => {
      try {
        checkAuth(raw, options);
        const parsed = schema.safeParse(raw);
        if (!parsed.success)
          return {
            errors: JSON.stringify([
              {
                error: 'INVALID_TOOL_INPUT',
                fields: parsed.error.issues.map((i) => i.path.join('.')),
              },
            ]),
          };
        const { profileId: requested, ...data } = parsed.data as z.infer<T> & {
          profileId?: string;
        };
        const { organization, profileId } = agentIdentity(options, requested);
        if (!profileId) {
          if (organizationRead)
            return {
              output: await organizationRead(
                organization.id,
                data as z.infer<T>
              ),
            };
          throw new HttpException('PROFILE_REQUIRED', 400);
        }
        const scope = await service.scope(organization.id, profileId);
        return { output: await execute(scope, data as z.infer<T>), scope };
      } catch (error) {
        return {
          errors: JSON.stringify([{ error: automationErrorCode(error) }]),
        };
      }
    },
  });
}
