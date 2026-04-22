import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { organizationId as organizationIdKey } from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { RepostRepository } from '@gitroom/nestjs-libraries/database/prisma/repost/repost.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { InstagramMessagingService } from '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service';
import { resolveIgRoute } from '@gitroom/nestjs-libraries/integrations/social/instagram-route.resolver';
import type { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import {
  CreateRepostRuleDto,
  UpdateRepostRuleDto,
} from '@gitroom/nestjs-libraries/dtos/repost/repost.rule.dto';

export const REPOST_SOURCE_IDENTIFIERS = [
  'instagram',
  'instagram-standalone',
] as const;

export const REPOST_DESTINATION_IDENTIFIERS = [
  'tiktok',
  'zernio-tiktok',
  'youtube',
  'zernio-youtube',
] as const;

export type RepostDestinationIdentifier =
  (typeof REPOST_DESTINATION_IDENTIFIERS)[number];

const WORKFLOW_NAME = 'repostWorkflow';
const workflowIdOf = (ruleId: string) => `repost-rule-${ruleId}`;

@Injectable()
export class RepostService {
  constructor(
    private _repostRepository: RepostRepository,
    private _temporalService: TemporalService,
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager,
    private _instagramMessagingService: InstagramMessagingService
  ) {}

  getRules(orgId: string, profileId?: string) {
    return this._repostRepository.getRules(orgId, profileId);
  }

  async getRule(orgId: string, id: string, profileId?: string) {
    const rule = await this._repostRepository.getRuleById(id, orgId, profileId);
    if (!rule) {
      throw new NotFoundException('Repost rule not found');
    }
    return rule;
  }

  getRuleFresh(id: string) {
    return this._repostRepository.getRuleFresh(id);
  }

  async sourceCandidates(orgId: string, profileId?: string) {
    const integrations = await this._integrationService.getIntegrationsList(
      orgId,
      profileId
    );
    return integrations
      .filter((i) => !i.disabled && !i.deletedAt)
      .filter((i) =>
        (REPOST_SOURCE_IDENTIFIERS as readonly string[]).includes(
          i.providerIdentifier
        )
      )
      .map((i) => ({
        id: i.id,
        name: i.name,
        picture: i.picture,
        providerIdentifier: i.providerIdentifier,
      }));
  }

  async destinationCandidates(orgId: string, profileId?: string) {
    const integrations = await this._integrationService.getIntegrationsList(
      orgId,
      profileId
    );
    return integrations
      .filter((i) => !i.disabled && !i.deletedAt)
      .filter((i) =>
        (REPOST_DESTINATION_IDENTIFIERS as readonly string[]).includes(
          i.providerIdentifier
        )
      )
      .map((i) => ({
        id: i.id,
        name: i.name,
        picture: i.picture,
        providerIdentifier: i.providerIdentifier,
      }));
  }

  async createRule(
    orgId: string,
    profileId: string | undefined,
    body: CreateRepostRuleDto
  ) {
    if (!profileId) {
      throw new BadRequestException(
        'A repost rule must belong to a specific profile'
      );
    }

    await this.assertSourceBelongsToProfile(
      orgId,
      profileId,
      body.sourceIntegrationId
    );
    await this.assertDestinationsBelongToProfile(
      orgId,
      profileId,
      body.destinationIntegrationIds
    );

    const rule = await this._repostRepository.createRule(
      orgId,
      profileId,
      body
    );

    // Bootstrap do checkpoint: sem isso, o primeiro ciclo pegaria todos os
    // stories ativos (até 24h) como "novos". Com o bootstrap, só stories
    // publicados apos a criacao da regra viram repostados.
    await this.bootstrapCheckpoint(rule.id);

    if (rule.enabled) {
      await this.processCron(true, orgId, rule.id);
    }

    return this._repostRepository.getRuleFresh(rule.id);
  }

  async updateRule(
    orgId: string,
    id: string,
    body: UpdateRepostRuleDto,
    profileId?: string
  ) {
    const existing = await this.getRule(orgId, id, profileId);

    if (body.sourceIntegrationId) {
      await this.assertSourceBelongsToProfile(
        orgId,
        existing.profileId,
        body.sourceIntegrationId
      );
    }
    if (body.destinationIntegrationIds) {
      await this.assertDestinationsBelongToProfile(
        orgId,
        existing.profileId,
        body.destinationIntegrationIds
      );
    }

    const updated = await this._repostRepository.updateRule(
      orgId,
      id,
      body,
      profileId
    );

    // Se alguma coisa sensivel mudou, recicla o workflow para pegar as
    // mudancas na proxima execucao — sleep durable ja leria fresh da DB,
    // entao reiniciar so eh necessario quando enabled mudou.
    if (body.enabled !== undefined) {
      await this.processCron(body.enabled, orgId, id);
    }

    return updated;
  }

  async toggleRule(
    orgId: string,
    id: string,
    enabled: boolean,
    profileId?: string
  ) {
    await this.getRule(orgId, id, profileId);
    const updated = await this._repostRepository.toggleRule(
      orgId,
      id,
      enabled,
      profileId
    );
    await this.processCron(enabled, orgId, id);
    return updated;
  }

  async deleteRule(orgId: string, id: string, profileId?: string) {
    await this.getRule(orgId, id, profileId);
    await this._repostRepository.softDeleteRule(orgId, id, profileId);
    await this.processCron(false, orgId, id);
    return { success: true };
  }

  async runNow(orgId: string, id: string, profileId?: string) {
    const rule = await this.getRule(orgId, id, profileId);
    if (!rule.enabled) {
      throw new BadRequestException(
        'Enable the rule before running a manual cycle'
      );
    }
    // Idempotent: start joga-se com mesmo workflowId -> Temporal ignora
    // duplicacao. Se nao estiver rodando, arranca; se estiver, nada muda.
    await this.processCron(true, orgId, id);
    return { success: true };
  }

  getLogs(orgId: string, id: string, page: number, size: number, profileId?: string) {
    return this.getRule(orgId, id, profileId).then(async () => ({
      rows: await this._repostRepository.getLogs(id, page, size),
      total: await this._repostRepository.countLogs(id),
      page,
      size,
    }));
  }

  async advanceCheckpoint(id: string, lastSourceItemId: string) {
    return this._repostRepository.advanceCheckpoint(id, lastSourceItemId);
  }

  touchLastRun(id: string) {
    return this._repostRepository.touchLastRun(id);
  }

  async resetCheckpoint(orgId: string, id: string, profileId?: string) {
    await this.getRule(orgId, id, profileId);
    await this._repostRepository.clearCheckpoint(id);
    return { success: true };
  }

  private async bootstrapCheckpoint(ruleId: string) {
    const rule = await this._repostRepository.getRuleFresh(ruleId);
    if (!rule) return;

    try {
      const integration = await this._integrationService.getIntegrationById(
        rule.organizationId,
        rule.sourceIntegrationId
      );
      if (!integration) return;

      const route = await resolveIgRoute(
        integration as any,
        this._instagramMessagingService
      );
      const provider = this._integrationManager.getSocialIntegration(
        'instagram'
      ) as unknown as InstagramProvider | undefined;
      if (!provider) return;

      const { stories } = await provider.getRecentStories(
        integration.internalId,
        route.token,
        route.host
      );
      console.log(
        `[repost] bootstrap rule=${ruleId} host=${route.host} ` +
          `stories=${stories.length} ids=[${stories.map((s) => s.id).join(',')}]`
      );
      if (!stories.length) return;

      const latest = stories.reduce((acc, cur) =>
        (cur.id || '') > (acc.id || '') ? cur : acc
      );
      if (latest?.id) {
        console.log(
          `[repost] bootstrap rule=${ruleId} checkpoint set to ${latest.id} — ` +
            `only stories published AFTER this point will be reposted`
        );
        await this._repostRepository.advanceCheckpoint(ruleId, latest.id);
      }
    } catch (err) {
      console.error(
        `[repost] bootstrap rule=${ruleId} failed (rule will still work, first ` +
          `cycle may include currently active stories):`,
        (err as Error).message || err
      );
    }
  }

  private async processCron(active: boolean, orgId: string, id: string) {
    if (active) {
      try {
        return await this._temporalService.client
          .getRawClient()
          ?.workflow.start(WORKFLOW_NAME, {
            workflowId: workflowIdOf(id),
            taskQueue: 'main',
            args: [{ ruleId: id }],
            typedSearchAttributes: new TypedSearchAttributes([
              {
                key: organizationIdKey,
                value: orgId,
              },
            ]),
          });
      } catch (err) {
        // Ja esta rodando (WorkflowExecutionAlreadyStarted) — ok.
        return null;
      }
    }

    try {
      return await this._temporalService.terminateWorkflow(workflowIdOf(id));
    } catch (err) {
      return false;
    }
  }

  private async assertSourceBelongsToProfile(
    orgId: string,
    profileId: string,
    integrationId: string
  ) {
    const integrations = await this._integrationService.getIntegrationsList(
      orgId,
      profileId
    );
    const found = integrations.find((i) => i.id === integrationId);
    if (!found) {
      throw new BadRequestException('Source integration not found for this profile');
    }
    if (
      !(REPOST_SOURCE_IDENTIFIERS as readonly string[]).includes(
        found.providerIdentifier
      )
    ) {
      throw new BadRequestException(
        'Source integration is not an Instagram Business account'
      );
    }
  }

  private async assertDestinationsBelongToProfile(
    orgId: string,
    profileId: string,
    ids: string[]
  ) {
    const integrations = await this._integrationService.getIntegrationsList(
      orgId,
      profileId
    );
    const allowedIds = new Set(integrations.map((i) => i.id));
    for (const id of ids) {
      if (!allowedIds.has(id)) {
        throw new BadRequestException(
          `Destination integration ${id} does not belong to this profile`
        );
      }
    }
    const chosen = integrations.filter((i) => ids.includes(i.id));
    const invalid = chosen.filter(
      (i) =>
        !(REPOST_DESTINATION_IDENTIFIERS as readonly string[]).includes(
          i.providerIdentifier
        )
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Unsupported destination channel: ${invalid
          .map((i) => i.providerIdentifier)
          .join(', ')}`
      );
    }
  }
}
