import { Injectable, Logger } from '@nestjs/common';
import { StatusEventSeverity } from '@prisma/client';
import {
  RecordStatusEventInput,
  StatusEventRepository,
} from '@gitroom/nestjs-libraries/database/prisma/status/status-event.repository';
import { ProfileRepository } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.repository';
import { StatusHistoryQueryDto } from '@gitroom/nestjs-libraries/dtos/status/status-history.query.dto';
import {
  StatusHistoryItem,
  StatusHistoryResponse,
  StatusSeverity,
} from '@gitroom/nestjs-libraries/dtos/status/status.dto';

const DEFAULT_LIMIT = 50;
const MESSAGE_CAP = 500;

/**
 * Escrita e leitura do log de eventos de falha (`StatusEvent`) — aba Status >
 * Histórico. `record` é o ponto único de emissão, chamado pelos 3 choke points
 * de service (disconnectChannel / posts.changeState / flows.updateExecution).
 */
@Injectable()
export class StatusEventService {
  private readonly logger = new Logger(StatusEventService.name);

  constructor(
    private _statusEventRepository: StatusEventRepository,
    private _profileRepository: ProfileRepository
  ) {}

  /**
   * FAIL-SOFT: registrar um evento de status NUNCA pode derrubar a operação real
   * (publicação, refresh de token, execução de automação). Qualquer erro do
   * insert é apenas logado (name+message) e engolido. `message` é capado em 500
   * chars — os callers já passam string SANITIZADA (name+message), nunca o corpo
   * cru da exceção.
   */
  async record(input: RecordStatusEventInput): Promise<void> {
    try {
      await this._statusEventRepository.create({
        ...input,
        message: this.capMessage(input.message),
      });
    } catch (err) {
      this.logger.error(
        `Falha ao registrar StatusEvent (${input.type}): ${
          (err as Error)?.name
        }: ${(err as Error)?.message}`
      );
    }
  }

  async list(
    organizationId: string,
    query: StatusHistoryQueryDto
  ): Promise<StatusHistoryResponse> {
    const limit = query.limit ?? DEFAULT_LIMIT;

    const rows = await this._statusEventRepository.list({
      organizationId,
      type: query.type,
      severity: query.severity
        ? this.toPrismaSeverity(query.severity)
        : undefined,
      profileId: query.profileId,
      cursorId: query.cursor,
      limit,
    });

    // Pedimos limit+1 ao repo: o excedente sinaliza que há próxima página.
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const nameById = await this.resolveProfileNames(organizationId, page);

    const items: StatusHistoryItem[] = page.map((r) => ({
      id: r.id,
      type: r.type,
      severity: this.toDtoSeverity(r.severity),
      message: r.message ?? null,
      createdAt: r.createdAt.toISOString(),
      channel:
        r.channelName || r.channelPicture || r.providerIdentifier
          ? {
              name: r.channelName ?? null,
              picture: r.channelPicture ?? null,
              identifier: r.providerIdentifier ?? null,
            }
          : null,
      profile:
        r.profileId && nameById.has(r.profileId)
          ? { id: r.profileId, name: nameById.get(r.profileId)! }
          : null,
      entityId: r.entityId ?? null,
    }));

    return {
      items,
      nextCursor: hasMore && page.length ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  /**
   * Resolve o nome do perfil em batch (1 query escopada à org). O log guarda só
   * o `profileId` (snapshot leve); o nome atual vem daqui. Perfil apagado ou não
   * encontrado => ausente no mapa => o item cai para "Workspace" no frontend.
   */
  private async resolveProfileNames(
    organizationId: string,
    rows: { profileId: string | null }[]
  ): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.profileId).filter(Boolean))];
    const map = new Map<string, string>();
    if (!ids.length) {
      return map;
    }
    const profiles = await this._profileRepository.getProfilesByOrgId(
      organizationId
    );
    for (const p of profiles) {
      map.set(p.id, p.name);
    }
    return map;
  }

  private capMessage(message?: string | null): string | null {
    if (!message) {
      return null;
    }
    return message.length > MESSAGE_CAP
      ? message.slice(0, MESSAGE_CAP)
      : message;
  }

  private toPrismaSeverity(severity: StatusSeverity): StatusEventSeverity {
    return severity === 'critical' ? 'CRITICAL' : 'WARNING';
  }

  private toDtoSeverity(severity: StatusEventSeverity): StatusSeverity {
    return severity === 'CRITICAL' ? 'critical' : 'warning';
  }
}
