import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { StatusEventSeverity, StatusEventType } from '@prisma/client';

export interface RecordStatusEventInput {
  organizationId: string;
  type: StatusEventType;
  severity: StatusEventSeverity;
  message?: string | null;
  profileId?: string | null;
  integrationId?: string | null;
  channelName?: string | null;
  channelPicture?: string | null;
  providerIdentifier?: string | null;
  entityId?: string | null;
}

export interface ListStatusEventsParams {
  organizationId: string;
  type?: StatusEventType;
  severity?: StatusEventSeverity;
  profileId?: string;
  cursorId?: string;
  limit: number;
}

/**
 * Repositório do log append-only `StatusEvent` (aba Status > Histórico).
 * Escrita denormalizada (snapshot no `create`); leitura paginada por cursor
 * (`take: limit + 1` para descobrir `hasMore` sem uma segunda query de count).
 */
@Injectable()
export class StatusEventRepository {
  constructor(private _statusEvent: PrismaRepository<'statusEvent'>) {}

  create(data: RecordStatusEventInput) {
    return this._statusEvent.model.statusEvent.create({
      data: {
        organizationId: data.organizationId,
        type: data.type,
        severity: data.severity,
        message: data.message ?? null,
        profileId: data.profileId ?? null,
        integrationId: data.integrationId ?? null,
        channelName: data.channelName ?? null,
        channelPicture: data.channelPicture ?? null,
        providerIdentifier: data.providerIdentifier ?? null,
        entityId: data.entityId ?? null,
      },
    });
  }

  async list(params: ListStatusEventsParams) {
    const { organizationId, type, severity, profileId, cursorId, limit } =
      params;

    // Âncora do cursor resolvida com lookup ESCOPADO À ORG: um cursor de outra
    // org (ou inexistente/já podado pelo autoprune) não é encontrado e a busca
    // volta para a 1ª página — fecha o oracle de existência e é robusto a
    // cursores obsoletos (não usa o `cursor` do Prisma, que exige a linha existir).
    let anchor: { createdAt: Date; id: string } | null = null;
    if (cursorId) {
      anchor = await this._statusEvent.model.statusEvent.findFirst({
        where: { id: cursorId, organizationId },
        select: { createdAt: true, id: true },
      });
    }

    return this._statusEvent.model.statusEvent.findMany({
      where: {
        organizationId,
        ...(type ? { type } : {}),
        ...(severity ? { severity } : {}),
        ...(profileId ? { profileId } : {}),
        // Linhas estritamente "após" a âncora na ordem (createdAt desc, id desc).
        // O empate por id garante ordem estável quando dois eventos compartilham
        // o mesmo createdAt (ms) — sem pular nem repetir linhas.
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }
}
