import {
  AgentToolInterface,
  ToolReturn,
} from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import z from 'zod';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import {
  agentProfileSelector,
  resolveAgentProfile,
} from './agent-profile-scope';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { getAuth } from '@gitroom/nestjs-libraries/chat/async.storage';
import { readRequestContext } from '@gitroom/nestjs-libraries/chat/tools/tool.context.helper';

@Injectable()
export class IntegrationListTool implements AgentToolInterface {
  constructor(
    private _integrationService: IntegrationService,
    private readonly profiles: ProfileService
  ) {}
  name = 'integrationList';

  run() {
    return createTool({
      id: 'integrationList',
      description: `Lista canais e seus perfis para agendar posts. Com chave de organização, use a mesma conexão: sem profileId lista os canais autorizados da organização; com profileId restringe ao cliente. Descubra o ID em getAccountContextTool ou no profileId de cada canal; não peça uma chave nova por cliente nem invente IDs.`,
      inputSchema: z.object({ profileId: agentProfileSelector }).strict(),
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            picture: z.string(),
            platform: z.string(),
            profileId: z.string().nullable(),
            profile: z.object({ id: z.string(), name: z.string() }).nullable(),
          })
        ),
      }),
      execute: async (input: any, options: any) => {
        checkAuth(input, options);
        const { organization, profileId } = await resolveAgentProfile(
          this.profiles,
          options,
          input.profileId
        );
        const organizationId = organization.id;
        const available = profileId
          ? [await this.profiles.getProfileById(organizationId, profileId)]
          : await this.profiles.getProfilesByOrgId(organizationId);
        const byId = new Map(
          available
            .filter(Boolean)
            .map((p) => [p.id, { id: p.id, name: p.name }])
        );

        return {
          output: (
            await this._integrationService.getIntegrationsList(
              organizationId,
              profileId
            )
          )
            .filter((p) => !profileId || p.profileId === profileId)
            .map((p) => ({
              name: p.customName || p.name,
              profileId: p.profileId || null,
              profile: byId.get(p.profileId) || null,
              id: p.id,
              disabled: p.disabled,
              picture: p.picture || '/no-picture.jpg',
              platform: p.providerIdentifier,
              display: p.profile,
              type: p.type,
            })),
        };
      },
    });
  }
}
