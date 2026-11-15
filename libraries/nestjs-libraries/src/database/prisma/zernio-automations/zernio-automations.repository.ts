import { Injectable } from '@nestjs/common';
import { Prisma, FlowStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { FlowScope } from '../../../dtos/flows/flow-v2.dto';
import type { AutomationConfiguration } from '../../../dtos/flows/automation-management.dto';
import {
  zernioFail,
  type ZernioDefinition,
} from '../../../integrations/automations/zernio-automation.contract';
const include = {
  integration: {
    select: { id: true, name: true, picture: true, providerIdentifier: true },
  },
} as const;
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class ZernioAutomationsRepository {
  constructor(private readonly db: PrismaService) {}
  private scope(s: FlowScope) {
    if (!s.organizationId || !s.profileId) zernioFail('PROFILE_REQUIRED', 403);
    return { organizationId: s.organizationId, profileId: s.profileId };
  }
  private integrationScope(s: FlowScope): Prisma.IntegrationWhereInput {
    return {
      ...this.scope(s),
      providerIdentifier: 'zernio-instagram',
      deletedAt: null,
      clientProfile: { deletedAt: null },
    };
  }
  private flowScope(s: FlowScope): Prisma.FlowWhereInput {
    return {
      ...this.scope(s),
      executionVersion: 3,
      deletedAt: null,
      integration: this.integrationScope(s),
    };
  }
  channels(s: FlowScope) {
    return this.db.integration.findMany({
      where: {
        ...this.integrationScope(s),
        disabled: false,
        inBetweenSteps: false,
      },
      select: {
        id: true,
        name: true,
        internalId: true,
        picture: true,
        providerIdentifier: true,
      },
    });
  }
  async integration(s: FlowScope, id: string) {
    const row = await this.db.integration.findFirst({
      where: {
        ...this.integrationScope(s),
        id,
        disabled: false,
        inBetweenSteps: false,
      },
    });
    if (!row) zernioFail('CHANNEL_NOT_FOUND', 404);
    return row;
  }
  list(s: FlowScope, integrationId?: string) {
    const where: Prisma.FlowWhereInput = {
      ...this.flowScope(s),
      ...(integrationId ? { integrationId } : {}),
      status: { not: 'ARCHIVED' },
    };
    return this.db.flow.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });
  }
  async get(s: FlowScope, id: string) {
    const row = await this.db.flow.findFirst({
      where: { ...this.flowScope(s), id },
      include,
    });
    if (!row) zernioFail('FLOW_NOT_FOUND', 404);
    return row;
  }
  async create(s: FlowScope, c: AutomationConfiguration) {
    return this.db.flow.create({
      include,
      data: {
        ...this.scope(s),
        integrationId: c.integrationId,
        name: c.name,
        status: 'DRAFT',
        executionVersion: 3,
        definitionVersion: 1,
        definition: json({
          schemaVersion: 1,
          configuration: c,
          sync: { state: 'idle' },
        }),
      },
    });
  }
  async write(
    s: FlowScope,
    id: string,
    revision: number,
    definition: ZernioDefinition,
    status?: FlowStatus
  ) {
    if (!Number.isInteger(revision) || revision < 1)
      zernioFail('REVISION_REQUIRED');
    const result = await this.db.flow.updateMany({
      where: { ...this.flowScope(s), id, revision },
      data: {
        definition: json(definition),
        name: definition.configuration.name,
        revision: { increment: 1 },
        ...(status ? { status } : {}),
      },
    });
    if (result.count !== 1) zernioFail('REVISION_CONFLICT', 409);
    return this.get(s, id);
  }
}
