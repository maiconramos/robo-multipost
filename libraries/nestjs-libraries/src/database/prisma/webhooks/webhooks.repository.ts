import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { WebhooksDto } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WebhooksRepository {
  constructor(
    private _webhooks: PrismaRepository<'webhooks'>,
    private _integration: PrismaRepository<'integration'>
  ) {}

  getTotal(orgId: string, profileId?: string) {
    return this._webhooks.model.webhooks.count({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
        organization: { deletedAt: null },
      },
    });
  }

  getWebhooks(orgId: string, profileId?: string) {
    return this._webhooks.model.webhooks.findMany({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
        organization: { deletedAt: null },
      },
      include: {
        integrations: {
          select: {
            integration: {
              select: {
                id: true,
                picture: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  deleteWebhook(orgId: string, id: string, profileId?: string) {
    return this._webhooks.model.webhooks.update({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async createWebhook(orgId: string, body: WebhooksDto, profileId?: string) {
    // Canais vinculados precisam ser da org e visiveis ao perfil (proprio ou
    // org-wide); editar por id so dentro do proprio perfil.
    const integrationIds = [
      ...new Set((body.integrations || []).map((integration) => integration.id)),
    ];
    if (integrationIds.length) {
      const allowed = await this._integration.model.integration.count({
        where: {
          id: { in: integrationIds },
          organizationId: orgId,
          deletedAt: null,
          ...(profileId ? { OR: [{ profileId }, { profileId: null }] } : {}),
        },
      });
      if (allowed !== integrationIds.length) {
        throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
      }
    }

    if (body.id) {
      const existing = await this._webhooks.model.webhooks.findFirst({
        where: {
          id: body.id,
          organizationId: orgId,
          deletedAt: null,
          ...(profileId ? { profileId } : {}),
        },
        select: { id: true },
      });
      if (!existing) {
        throw new HttpException('Webhook not found', HttpStatus.NOT_FOUND);
      }
    }

    const { id } = await this._webhooks.model.webhooks.upsert({
      where: {
        id: body.id || uuidv4(),
        organizationId: orgId,
      },
      create: {
        organizationId: orgId,
        url: body.url,
        name: body.name,
        ...(profileId ? { profileId } : {}),
      },
      update: {
        url: body.url,
        name: body.name,
      },
    });

    await this._webhooks.model.webhooks.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        integrations: {
          deleteMany: {},
          create: body.integrations.map((integration) => ({
            integrationId: integration.id,
          })),
        },
      },
    });

    return { id };
  }
}
