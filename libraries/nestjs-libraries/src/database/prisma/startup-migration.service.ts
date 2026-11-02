import { PostWorkflowMigrationService } from './posts/post-workflow-migration.service';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RepostService } from './repost/repost.service';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

@Injectable()
export class StartupMigrationService
  implements OnModuleInit, OnApplicationBootstrap
{
  private readonly logger = new Logger(StartupMigrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repostService: RepostService,
    private readonly refreshIntegrationService: RefreshIntegrationService,
    private readonly postWorkflowMigration: PostWorkflowMigrationService
  ) {}

  async onModuleInit() {
    await this.migrateProfileScope();
    await this.migrateLateToZernio();
    await this.migrateSkoolExtensionCookies();
    await this.backfillRepostDestinations();
    await this.cleanupExpiredUnmatchedComments();
    await this.cleanupExpiredStatusEvents();
    await this.cleanupExpiredScheduledAutomationEvents();
    await this.backfillFlowsToDefaultProfile();
  }

  // Passos que iniciam workflows no Temporal: o cliente do nestjs-temporal-core
  // so fica pronto no onModuleInit dele, que corre em paralelo com o nosso
  // ("Temporal Service is not initialized"). O bootstrap roda depois de todos
  // os onModuleInit.
  async onApplicationBootstrap() {
    await this.reconcileRepostWorkflows();
    await this.reconcileRefreshTokensCron();
    try {
      await this.postWorkflowMigration.ensureMigrationWorkflow();
    } catch (error) {
      this.logger.warn(
        `reconcilePostWorkflowsV112 falhou: ${summarizeError(error)}`
      );
    }
  }

  private async cleanupExpiredScheduledAutomationEvents() {
    try {
      const where = { expiresAt: { lt: new Date(Date.now() - 7 * 86400000) } };
      if (!(await this.prisma.scheduledAutomationEvent.count({ where })))
        return;
      await this.prisma.scheduledAutomationEvent.deleteMany({ where });
    } catch {
      this.logger.warn('Scheduled automation capture cleanup unavailable.');
    }
  }

  /**
   * Autoprune do log de eventos de status (aba Status > Histórico): remove
   * StatusEvent com mais de 90 dias. Idempotente via count guard; swallow-and-log
   * como os demais passos. Roda em backend e orchestrator (DatabaseModule é
   * @Global) — a 2ª execução vira no-op via count guard.
   */
  private async cleanupExpiredStatusEvents() {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);

      const count = await this.prisma.statusEvent.count({
        where: { createdAt: { lt: cutoff } },
      });
      if (count === 0) {
        return;
      }

      const result = await this.prisma.statusEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      this.logger.log(
        `cleanupExpiredStatusEvents: ${result.count} evento(s) > 90d removidos`
      );
    } catch (error) {
      this.logger.error('cleanupExpiredStatusEvents falhou:', error);
    }
  }

  /**
   * Self-heal: garante o workflow SINGLETON de refresh proativo em lote
   * (`refresh-tokens-cron`) rodando. Idempotente via USE_EXISTING (no-op quando
   * ja roda). Roda em backend e orchestrator (DatabaseModule eh @Global); a 2a
   * execucao vira no-op. Sem isto, providers sem `refreshCron` por-canal
   * (linkedin, instagram-facebook...) nunca tem o token renovado antes de expirar.
   */
  private async reconcileRefreshTokensCron() {
    try {
      await this.refreshIntegrationService.ensureRefreshTokensCronWorkflow();
    } catch (error) {
      this.logger.error('reconcileRefreshTokensCron falhou:', error);
    }
  }

  /**
   * Self-heal: para cada RepostRule habilitada garante que o workflow
   * repost-rule-<id> esteja rodando. Idempotente via workflowIdConflictPolicy
   * USE_EXISTING (no-op quando ja roda). Roda em backend e orchestrator
   * (DatabaseModule eh @Global); a 2a execucao vira no-op.
   */
  private async reconcileRepostWorkflows() {
    try {
      const result = await this.repostService.reconcileWorkflows();
      if (result.total === 0) {
        return;
      }
      this.logger.log(
        `reconcileRepostWorkflows: ${result.reconciled}/${result.total} repost workflow(s) reconciliados`
      );
    } catch (error) {
      this.logger.error('reconcileRepostWorkflows falhou:', error);
    }
  }

  /**
   * Atribui flows orfaos (profileId null — criados via chave de API de org
   * antes da resolucao automatica de perfil) ao perfil Default da org. Sem
   * isso eles ficam invisiveis na UI por-perfil (a listagem filtra por
   * profileId exato). Idempotente via count guard; SQL estatico (sem
   * interpolacao de input — sem risco de injection).
   */
  private async backfillFlowsToDefaultProfile() {
    try {
      const count = await this.prisma.flow.count({
        where: { profileId: null },
      });
      if (count === 0) {
        return;
      }

      this.logger.log(
        `backfillFlowsToDefaultProfile: ${count} flow(s) sem perfil. Atribuindo ao perfil Default...`
      );

      await this.prisma.$executeRawUnsafe(`
        UPDATE "Flow" f
        SET "profileId" = p.id
        FROM "Profile" p
        WHERE p."organizationId" = f."organizationId"
        AND p."isDefault" = true AND p."deletedAt" IS NULL
        AND f."profileId" IS NULL
      `);

      this.logger.log('backfillFlowsToDefaultProfile: concluido.');
    } catch (error) {
      this.logger.error('backfillFlowsToDefaultProfile falhou:', error);
    }
  }

  /**
   * Remove UnmatchedComment PENDING com mais de 30 dias. Mantem registros
   * BOUND/IGNORED como audit trail. Idempotente via count guard.
   *
   * Roda em backend e orchestrator (DatabaseModule eh @Global). Como eh
   * idempotente, a 2a execucao apenas vira no-op via count guard.
   */
  private async cleanupExpiredUnmatchedComments() {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const count = await this.prisma.unmatchedComment.count({
        where: { status: 'PENDING', createdAt: { lt: cutoff } },
      });
      if (count === 0) {
        return;
      }

      const result = await this.prisma.unmatchedComment.deleteMany({
        where: { status: 'PENDING', createdAt: { lt: cutoff } },
      });
      this.logger.log(
        `cleanupExpiredUnmatchedComments: ${result.count} comentarios PENDING > 30d removidos`
      );
    } catch (error) {
      this.logger.error('cleanupExpiredUnmatchedComments falhou:', error);
    }
  }

  /**
   * Migrates existing data to be scoped by profile (Fase 3).
   * Idempotent — only updates records where profileId IS NULL.
   * Runs automatically on every startup; no-op if already migrated.
   */
  private async migrateProfileScope() {
    try {
      const needsMigration = await this.prisma.providerCredential.count({
        where: { profileId: null },
      });

      if (needsMigration === 0) {
        return;
      }

      this.logger.log(
        `Found ${needsMigration} credentials without profile. Running profile scope migration...`
      );

      await this.prisma.$transaction(async (tx) => {
        // 1. ProviderCredential → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "ProviderCredential" pc
          SET "profileId" = p.id
          FROM "Profile" p
          WHERE p."organizationId" = pc."organizationId"
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND pc."profileId" IS NULL
        `);

        // 2. Webhooks → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "Webhooks" w
          SET "profileId" = p.id
          FROM "Profile" p
          WHERE p."organizationId" = w."organizationId"
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND w."profileId" IS NULL
        `);

        // 3. AutoPost → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "AutoPost" ap
          SET "profileId" = p.id
          FROM "Profile" p
          WHERE p."organizationId" = ap."organizationId"
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND ap."profileId" IS NULL
        `);

        // 4. Sets → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "Sets" s
          SET "profileId" = p.id
          FROM "Profile" p
          WHERE p."organizationId" = s."organizationId"
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND s."profileId" IS NULL
        `);

        // 5. Late API key: org → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "Profile" p
          SET "lateApiKey" = o."lateApiKey"
          FROM "Organization" o
          WHERE p."organizationId" = o.id
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND o."lateApiKey" IS NOT NULL
          AND p."lateApiKey" IS NULL
        `);

        // 6. Shortlink preference: org → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "Profile" p
          SET "shortlink" = o."shortlink"
          FROM "Organization" o
          WHERE p."organizationId" = o.id
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND p."shortlink" = 'ASK'
        `);
      });

      this.logger.log('Profile scope migration completed successfully.');
    } catch (error) {
      this.logger.error('Profile scope migration failed:', error);
    }
  }

  /**
   * Copia chaves de API Late para as colunas Zernio e reescreve
   * providerIdentifier de integrations existentes (late-X -> zernio-X).
   * Idempotente: cada UPDATE filtra linhas ja migradas.
   */
  private async migrateLateToZernio() {
    try {
      const pendingIntegrations = await this.prisma.integration.count({
        where: { providerIdentifier: { startsWith: 'late-' } },
      });

      const pendingOrgKeys = await this.prisma.organization.count({
        where: {
          lateApiKey: { not: null },
          zernioApiKey: null,
        },
      });

      const pendingProfileKeys = await this.prisma.profile.count({
        where: {
          lateApiKey: { not: null },
          zernioApiKey: null,
        },
      });

      // Sobra da migracao antiga: a coluna Late ficava preenchida e, quando o
      // admin removia a chave Zernio (ou desligava o compartilhamento), o
      // proximo boot copiava tudo de volta. A copia agora consome a coluna Late.
      const leftoverLate =
        (await this.prisma.organization.count({
          where: {
            OR: [{ lateApiKey: { not: null } }, { shareLateWithProfiles: true }],
          },
        })) +
        (await this.prisma.profile.count({
          where: { lateApiKey: { not: null } },
        }));

      if (
        pendingIntegrations === 0 &&
        pendingOrgKeys === 0 &&
        pendingProfileKeys === 0 &&
        leftoverLate === 0
      ) {
        return;
      }

      this.logger.log(
        `Late->Zernio migration pending: ${pendingIntegrations} integrations, ${pendingOrgKeys} org keys, ${pendingProfileKeys} profile keys.`
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`
          UPDATE "Organization"
          SET "zernioApiKey" = "lateApiKey"
          WHERE "lateApiKey" IS NOT NULL AND "zernioApiKey" IS NULL
        `);

        await tx.$executeRawUnsafe(`
          UPDATE "Organization"
          SET "shareZernioWithProfiles" = "shareLateWithProfiles"
          WHERE "shareLateWithProfiles" = true AND "shareZernioWithProfiles" = false
        `);

        await tx.$executeRawUnsafe(`
          UPDATE "Profile"
          SET "zernioApiKey" = "lateApiKey"
          WHERE "lateApiKey" IS NOT NULL AND "zernioApiKey" IS NULL
        `);

        // copia feita uma vez: a origem Late e apagada (senao volta no boot)
        await tx.$executeRawUnsafe(`
          UPDATE "Organization"
          SET "lateApiKey" = NULL, "shareLateWithProfiles" = false
          WHERE "lateApiKey" IS NOT NULL OR "shareLateWithProfiles" = true
        `);

        await tx.$executeRawUnsafe(`
          UPDATE "Profile"
          SET "lateApiKey" = NULL
          WHERE "lateApiKey" IS NOT NULL
        `);

        await tx.$executeRawUnsafe(`
          UPDATE "Integration"
          SET "providerIdentifier" = 'zernio-' || SUBSTRING("providerIdentifier" FROM 6)
          WHERE "providerIdentifier" LIKE 'late-%'
        `);
      });

      this.logger.log('Late->Zernio migration completed successfully.');
    } catch (error) {
      this.logger.error('Late->Zernio migration failed:', error);
    }
  }

  /**
   * Converte `customInstanceDetails` de canais Skool gravados no formato
   * legado (JWT assinado com JWT_SECRET) para o formato atual (JSON cifrado
   * em AES, so com os cookies que o provider declara). Ate 23/10/2026 o
   * `extension-refresh` ASSINAVA o JSON enviado pelo cliente, entao uma linha
   * legada pode carregar claims arbitrarias (ex.: `id` de outro usuario) —
   * um JWT valido para forjar sessao/enterprise/billing. Reescrever a linha
   * descarta essas claims; a conversao e registrada com `warn` quando houve
   * claims extras (sinal de adulteracao). Sem os dois cookies obrigatorios a
   * linha e marcada para reconexao em vez de convertida.
   *
   * Idempotente: so JWT (prefixo `eyJ`); o AES e hex e nunca casa o guard.
   */
  private async migrateSkoolExtensionCookies() {
    const where = {
      providerIdentifier: 'skool',
      customInstanceDetails: { startsWith: 'eyJ' },
    };
    try {
      const pending = await this.prisma.integration.count({ where });
      if (pending === 0) {
        return;
      }

      this.logger.log(
        `Skool legacy cookies migration pending: ${pending} integrations.`
      );

      const rows = await this.prisma.integration.findMany({
        where,
        select: { id: true, organizationId: true, customInstanceDetails: true },
      });

      let converted = 0;
      let flagged = 0;
      for (const row of rows) {
        let payload: Record<string, unknown> | null = null;
        try {
          const verified = AuthService.verifyJWT(row.customInstanceDetails!);
          payload =
            verified && typeof verified === 'object' && !Array.isArray(verified)
              ? (verified as Record<string, unknown>)
              : null;
        } catch {
          payload = null;
        }

        const cookies =
          payload &&
          typeof payload.client_id === 'string' &&
          typeof payload.auth_token === 'string'
            ? { client_id: payload.client_id, auth_token: payload.auth_token }
            : null;

        if (!cookies) {
          await this.prisma.integration.update({
            where: { id: row.id },
            data: { refreshNeeded: true },
          });
          flagged += 1;
          continue;
        }

        const extraClaims = Object.keys(payload!).filter(
          (key) => !['client_id', 'auth_token', 'iat'].includes(key)
        );
        if (extraClaims.length) {
          this.logger.warn(
            `Skool integration ${row.id} (org ${
              row.organizationId
            }) carried unexpected claims in legacy JWT cookies: ${extraClaims.join(
              ', '
            )} — possible tampering; claims dropped on conversion.`
          );
        }

        await this.prisma.integration.update({
          where: { id: row.id },
          data: {
            customInstanceDetails: AuthService.fixedEncryption(
              JSON.stringify(cookies)
            ),
          },
        });
        converted += 1;
      }

      this.logger.log(
        `Skool legacy cookies migration completed: ${converted} converted, ${flagged} flagged for reconnection.`
      );
    } catch (error) {
      this.logger.error('Skool legacy cookies migration failed:', error);
    }
  }

  /**
   * Backfill de RepostRuleDestination a partir do array
   * destinationIntegrationIds (V1). Infere o formato de repost a partir
   * do providerIdentifier da integration. Idempotente: so cria linhas
   * que ainda nao existam.
   */
  private async backfillRepostDestinations() {
    try {
      const rulesWithLegacy = await this.prisma.repostRule.count({
        where: {
          destinationIntegrationIds: { isEmpty: false },
          destinations: { none: {} },
        },
      });

      if (rulesWithLegacy === 0) {
        return;
      }

      this.logger.log(
        `Backfilling RepostRuleDestination para ${rulesWithLegacy} regras (V1 -> V2)...`
      );

      // Mapeia providerIdentifier para o formato correspondente no V2.
      const formatByProvider: Record<string, string> = {
        instagram: 'INSTAGRAM_POST',
        'instagram-standalone': 'INSTAGRAM_POST',
        facebook: 'FACEBOOK_REEL',
        tiktok: 'TIKTOK_FEED',
        'zernio-tiktok': 'TIKTOK_FEED',
        youtube: 'YOUTUBE_SHORT',
        'zernio-youtube': 'YOUTUBE_SHORT',
      };

      const rules = await this.prisma.repostRule.findMany({
        where: {
          destinationIntegrationIds: { isEmpty: false },
          destinations: { none: {} },
        },
        select: { id: true, destinationIntegrationIds: true },
      });

      for (const rule of rules) {
        const integrations = await this.prisma.integration.findMany({
          where: { id: { in: rule.destinationIntegrationIds } },
          select: { id: true, providerIdentifier: true },
        });

        for (const integration of integrations) {
          const format = formatByProvider[integration.providerIdentifier];
          if (!format) continue;

          await this.prisma.repostRuleDestination
            .upsert({
              where: {
                ruleId_integrationId_format: {
                  ruleId: rule.id,
                  integrationId: integration.id,
                  format: format as any,
                },
              },
              create: {
                ruleId: rule.id,
                integrationId: integration.id,
                format: format as any,
              },
              update: {},
            })
            .catch(() => undefined);
        }
      }

      this.logger.log('Backfill RepostRuleDestination concluido.');
    } catch (error) {
      this.logger.error('Backfill RepostRuleDestination falhou:', error);
    }
  }
}
