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

  list(params: ListStatusEventsParams) {
    const { organizationId, type, severity, profileId, cursorId, limit } =
      params;
    return this._statusEvent.model.statusEvent.findMany({
      where: {
        organizationId,
        ...(type ? { type } : {}),
        ...(severity ? { severity } : {}),
        ...(profileId ? { profileId } : {}),
      },
      // Empate por id garante ordem estável quando dois eventos compartilham o
      // mesmo `createdAt` (ms) — essencial para a paginação por cursor não pular
      // nem repetir linhas.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
  }
}
