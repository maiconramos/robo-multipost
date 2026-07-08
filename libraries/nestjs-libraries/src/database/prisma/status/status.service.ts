import { Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { PostsRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository';
import { FlowsRepository } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.repository';
import {
  StatusAutomationProblem,
  StatusChannelProblem,
  StatusPostProblem,
  StatusProblemsResponse,
} from '@gitroom/nestjs-libraries/dtos/status/status.dto';

// Um canal caido gera muitos posts/execucoes com erro; capamos para nao estourar
// o payload. `summary.truncated` sinaliza o corte para a UI mostrar "+N".
const PROBLEM_LIMIT = 50;

/**
 * Agregacao read-only dos "problemas pendentes" do workspace para a tela de
 * Status (admin-only). Estado DERIVADO das fontes de verdade — some sozinho
 * quando o problema e resolvido. Compoe 3 repositories (sem tabela propria);
 * classifica a severidade aqui (regra de dominio unica, reusavel/testavel) e o
 * frontend so agrupa. Mantido desacoplado do DTO de UI para reuso futuro
 * (ex.: contagem no sino).
 */
@Injectable()
export class StatusService {
  constructor(
    private _integrationRepository: IntegrationRepository,
    private _postsRepository: PostsRepository,
    private _flowsRepository: FlowsRepository
  ) {}

  async getProblems(
    org: Organization,
    profileId?: string
  ): Promise<StatusProblemsResponse> {
    const [rawChannels, rawPosts, rawFlows] = await Promise.all([
      this._integrationRepository.getProblemChannels(org.id, profileId),
      this._postsRepository.getErrorPosts(org.id, profileId, PROBLEM_LIMIT),
      this._flowsRepository.getFailedExecutions(
        org.id,
        profileId,
        PROBLEM_LIMIT
      ),
    ]);

    const channels: StatusChannelProblem[] = rawChannels.map((c) => ({
      type: 'channel',
      // Token morto (refreshNeeded) para de publicar => critico; apenas desativado
      // (limite de plano/manual) => atencao, recuperavel.
      severity: c.refreshNeeded ? 'critical' : 'warning',
      id: c.id,
      identifier: c.providerIdentifier,
      internalId: c.internalId,
      name: c.name,
      picture: c.picture ?? null,
      refreshNeeded: c.refreshNeeded,
      disabled: c.disabled,
      reason: c.refreshError ?? null,
      reasonAt: c.refreshErrorAt ? c.refreshErrorAt.toISOString() : null,
      profile: c.clientProfile
        ? { id: c.clientProfile.id, name: c.clientProfile.name }
        : null,
    }));

    const posts: StatusPostProblem[] = rawPosts.map((p) => ({
      type: 'post',
      severity: 'critical',
      id: p.id,
      updatedAt: p.updatedAt.toISOString(),
      channel: p.integration
        ? {
            id: p.integration.id,
            identifier: p.integration.providerIdentifier,
            name: p.integration.name,
            picture: p.integration.picture ?? null,
          }
        : null,
      profile: p.profile ? { id: p.profile.id, name: p.profile.name } : null,
    }));

    const automations: StatusAutomationProblem[] = rawFlows.map((f) => ({
      type: 'automation',
      severity: 'warning',
      id: f.id,
      flowId: f.flow.id,
      flowName: f.flow.name,
      error: f.error ?? null,
      profile: f.flow.profile
        ? { id: f.flow.profile.id, name: f.flow.profile.name }
        : null,
    }));

    const critical =
      channels.filter((c) => c.severity === 'critical').length + posts.length;
    const warning =
      channels.filter((c) => c.severity === 'warning').length +
      automations.length;

    return {
      channels,
      posts,
      automations,
      summary: {
        critical,
        warning,
        total: critical + warning,
        truncated:
          posts.length >= PROBLEM_LIMIT || automations.length >= PROBLEM_LIMIT,
      },
    };
  }
}
