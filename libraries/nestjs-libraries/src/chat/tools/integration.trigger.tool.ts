import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import {
  IntegrationManager,
  socialIntegrationList,
} from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { timer } from '@gitroom/helpers/utils/timer';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { readRequestContext } from '@gitroom/nestjs-libraries/chat/tools/tool.context.helper';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import {
  agentProfileSelector,
  resolveAgentProfile,
} from './agent-profile-scope';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { decryptIntegrationToken } from '@gitroom/nestjs-libraries/crypto/integration-token.helper';

@Injectable()
export class IntegrationTriggerTool implements AgentToolInterface {
  constructor(
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _encryption: EncryptionService,
    private readonly profiles: ProfileService
  ) {}
  name = 'triggerTool';

  run() {
    return createTool({
      id: 'triggerTool',
      description: `After using the integrationSchema, we sometimes miss details we can\'t ask from the user, like ids.
      Sometimes this tool requires to user prompt for some settings, like a word to search for. methodName is required [input:callable-tools]`,
      inputSchema: z.object({
        profileId: agentProfileSelector,
        integrationId: z.string().describe('The id of the integration'),
        methodName: z
          .string()
          .describe(
            'The methodName from the `integrationSchema` functions in the tools array, required'
          ),
        dataSchema: z.array(
          z.object({
            key: z.string().describe('Name of the settings key to pass'),
            value: z.string().describe('Value of the key'),
          })
        ),
      }),
      outputSchema: z.object({
        output: z.array(z.record(z.string(), z.any())),
      }),
      execute: async (input: any, options: any) => {
        checkAuth(input, options);
        const { organization, profileId } = await resolveAgentProfile(
          this.profiles,
          options,
          input.profileId,
          true
        );
        const organizationId = organization.id;

        const getIntegration =
          await this._integrationService.getIntegrationById(
            organizationId,
            input.integrationId
          );

        if (!getIntegration) {
          return {
            output: [{ error: 'Integration not found' }],
          };
        }
        // mesmo escopo da tool de agendamento: o canal precisa ser do perfil
        // ativo da sessao MCP
        if (getIntegration.profileId !== profileId) {
          // outputSchema e um array de registros: a string crua seria
          // rejeitada pela validacao de saida do Mastra
          return {
            output: [
              { error: 'Integration does not belong to the active profile' },
            ],
          };
        }
        getIntegration.token = decryptIntegrationToken(
          this._encryption,
          getIntegration.token
        );

        const integrationProvider = socialIntegrationList.find(
          (p) => p.identifier === getIntegration.providerIdentifier
        )!;

        if (!integrationProvider) {
          return {
            output: [{ error: 'Integration not found' }],
          };
        }

        const tools = this._integrationManager.getAllTools();
        if (
          // @ts-ignore
          !tools[integrationProvider.identifier].some(
            (p) => p.methodName === input.methodName
          ) ||
          // @ts-ignore
          !integrationProvider[input.methodName]
        ) {
          return { output: [{ error: 'tool not found' }] };
        }

        while (true) {
          try {
            // @ts-ignore
            const load = await integrationProvider[input.methodName](
              getIntegration.token,
              input.dataSchema.reduce(
                (all: any, current: any) => ({
                  ...all,
                  [current.key]: current.value,
                }),
                {}
              ),
              getIntegration.internalId,
              getIntegration
            );

            return { output: load };
          } catch (err) {
            if (err instanceof RefreshToken) {
              const data = await this._refreshIntegrationService.refresh(
                getIntegration
              );

              if (!data) {
                await this._integrationService.disconnectChannel(
                  organizationId,
                  getIntegration
                );
                return {
                  output:
                    'We had to disconnect the channel as the token expired',
                };
              }

              const { accessToken } = data;

              if (accessToken) {
                getIntegration.token = accessToken;

                if (integrationProvider.refreshWait) {
                  await timer(10000);
                }

                continue;
              } else {
              }
            }
            return { output: [{ error: 'Unexpected error' }] };
          }
        }
      },
    });
  }
}
