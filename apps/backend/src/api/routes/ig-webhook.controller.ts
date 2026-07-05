import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';
import * as crypto from 'crypto';

const DEFAULT_IG_WEBHOOK_VERIFY_TOKEN = 'multipost';

// Limite de entries processadas por requisicao. A Meta entrega lotes pequenos
// (tipicamente 1). O teto evita que uma requisicao NAO autenticada com um array
// `entry` gigante force uma consulta de banco por conta antes da validacao da
// assinatura (amplificacao pre-auth). Lotes legitimos nunca chegam perto disso.
const MAX_WEBHOOK_ENTRIES = 100;

// Escopo resultante da validacao da assinatura. `global` = casou com um segredo
// de ambiente (confiavel para qualquer conta) ou skip em dev. `orgs` = casou com
// a credencial de uma ou mais organizacoes especificas — o despacho so pode ir
// para integracoes dessas orgs (fecha a falsificacao cross-tenant, D1).
type SignatureScope =
  | { kind: 'global' }
  | { kind: 'orgs'; orgIds: Set<string> };

@ApiTags('Instagram Webhook')
@Controller('/public/ig-webhook')
export class IgWebhookController {
  private readonly _logger = new Logger(IgWebhookController.name);

  constructor(
    private _flowsService: FlowsService,
    private _integrationService: IntegrationService,
    private _credentialService: CredentialService
  ) {}

  @Get('/')
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response
  ) {
    if (mode !== 'subscribe' || !token) {
      return res.status(403).send('Forbidden');
    }

    // 1) Accept platform default token (zero-config)
    if (token === DEFAULT_IG_WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    // 2) Accept custom token from any per-workspace credential
    const all = await this._credentialService.findAllDecrypted('facebook');
    const match = all.some((c) => c.data?.webhookVerifyToken === token);
    if (match) {
      return res.status(200).send(challenge);
    }

    // 3) Fallback to global env var
    const envToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
    if (envToken && token === envToken) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send('Forbidden');
  }

  @Post('/')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const body = req.body;
    this._logger.log(
      `IG webhook received: object=${body?.object} entries=${
        body?.entry?.length ?? 0
      }`
    );
    if (!body || !body.entry || !Array.isArray(body.entry)) {
      this._logger.warn('IG webhook: no entries in body');
      return { status: 'ignored' };
    }

    // Limita o numero de entries processadas (protege contra fan-out de banco
    // pre-auth via `entry` array gigante — ver MAX_WEBHOOK_ENTRIES).
    let entries = body.entry;
    if (entries.length > MAX_WEBHOOK_ENTRIES) {
      this._logger.warn(
        `IG webhook: entry array too large (${entries.length}), truncating to ${MAX_WEBHOOK_ENTRIES}`
      );
      entries = entries.slice(0, MAX_WEBHOOK_ENTRIES);
    }

    // Resolve as orgs donas de cada conta ANTES de validar, para escopar a
    // assinatura aos segredos da(s) org(s) dona(s) da conta recebida (D1).
    const ownersByEntryId = await this.resolveEntryOwners(entries);
    const scope = await this.verifySignature(req, ownersByEntryId);

    for (const entry of entries) {
      const igAccountId = entry.id;

      // Instagram DM webhooks come via entry.messaging (not entry.changes).
      // Story replies and reactions are the only DMs we handle right now.
      if (Array.isArray(entry.messaging)) {
        if (this.isEntryAllowed(scope, ownersByEntryId, igAccountId)) {
          for (const event of entry.messaging) {
            await this.processMessagingEvent(igAccountId, event, scope);
          }
        } else {
          this._logger.warn(
            `IG webhook: skipping messaging for account ${igAccountId} outside signature scope`
          );
        }
      }

      if (!entry.changes) {
        continue;
      }

      for (const change of entry.changes) {
        this._logger.log(
          `IG webhook change: field=${change.field} entry.id=${entry.id}`
        );

        // Some Meta apps deliver messages via `changes` as well. Route them
        // through the same messaging handler when that happens.
        if (change.field === 'messages') {
          if (
            change.value &&
            this.isEntryAllowed(scope, ownersByEntryId, igAccountId)
          ) {
            await this.processMessagingEvent(igAccountId, change.value, scope);
          }
          continue;
        }

        // Instagram uses field='comments'; Facebook Page uses 'feed' with
        // value.item='comment'. Support both but only filter Facebook Page
        // events by item — Instagram comment payloads don't have `item`.
        if (change.field === 'feed') {
          if (!change.value || change.value.item !== 'comment') continue;
        } else if (change.field !== 'comments') {
          continue;
        }

        const value = change.value;
        if (!value) continue;

        const igCommentId = value.id || value.comment_id;
        const igCommenterId = value.from?.id;
        const igCommenterName = value.from?.username;
        const igMediaId = value.media?.id || value.post_id;
        const commentText = value.text || value.message || '';

        if (!igCommentId || !igCommenterId || !igMediaId) {
          this._logger.warn(
            `IG webhook: missing fields commentId=${igCommentId} commenter=${igCommenterId} media=${igMediaId} payload=${JSON.stringify(
              value
            )}`
          );
          continue;
        }

        // Skip self-comments (bot's own replies) to prevent infinite loops
        if (igCommenterId === igAccountId) {
          this._logger.log(
            `IG webhook: skipping self-comment ${igCommentId} (bot's own reply)`
          );
          continue;
        }

        this._logger.log(
          `IG webhook dispatching comment ${igCommentId} on media ${igMediaId} by ${igCommenterId}`
        );
        await this.processComment(
          {
            igAccountId,
            igCommentId,
            igCommenterId,
            igCommenterName,
            igMediaId,
            commentText,
          },
          scope
        );
      }
    }

    return { status: 'ok' };
  }

  private async processMessagingEvent(
    igAccountId: string,
    event: any,
    scope: SignatureScope
  ) {
    // Only story_mention / story_reply / reaction are handled here. Plain
    // DMs without a story context are ignored (future feature).
    const senderId = event?.sender?.id;
    const recipientId = event?.recipient?.id;
    if (!senderId || !recipientId) return;

    // Skip echoes of the bot's own outgoing messages.
    if (senderId === igAccountId || event?.message?.is_echo) {
      return;
    }

    // Postback clicks (botao do template de DM) vem antes das checagens de
    // story reply: nao ha reply_to story nem attachment; tudo esta em
    // event.postback.{payload,mid}. Usado pelo follow-gate em 2 etapas.
    if (event?.postback?.payload) {
      const payload: string = event.postback.payload;
      if (typeof payload === 'string' && payload.startsWith('pb_')) {
        const metaMid: string | undefined =
          event?.postback?.mid || event?.mid;
        this._logger.log(
          `IG webhook postback received sender=${senderId} payload=${payload}`
        );
        // Gate deste caminho = isEntryAllowed no handleWebhook (por igAccountId).
        // Alem disso, handlePostbackClick tem autorizacao INDEPENDENTE: valida
        // o HMAC do proprio payload (pb_...) e usa o organizationId da linha
        // PendingPostback no banco, nunca campos do webhook. Nao "corrigir" isso
        // para um loop por integracao — a protecao ja e suficiente.
        await this._flowsService.handlePostbackClick({
          payload,
          metaMid,
          senderIgsid: senderId,
          igAccountId,
        });
      }
      return;
    }

    const message = event?.message;
    const reactionEvent = event?.reaction;

    // Case 1: message reply to a story (text, emoji, or story_mention attachment)
    let igStoryId: string | undefined =
      message?.reply_to?.story?.id || message?.reply_to?.story_id;
    if (!igStoryId && Array.isArray(message?.attachments)) {
      const storyMention = message.attachments.find(
        (a: any) => a?.type === 'story_mention'
      );
      igStoryId = storyMention?.payload?.story?.id || storyMention?.payload?.url;
    }

    // Case 2: reaction event directly targeting a story
    if (!igStoryId && reactionEvent) {
      igStoryId = reactionEvent.story_id || reactionEvent.story?.id;
    }

    if (!igStoryId) {
      // Not story-related — ignore silently.
      return;
    }

    const igMessageId: string | undefined =
      message?.mid || reactionEvent?.mid || event?.timestamp?.toString();
    if (!igMessageId) {
      this._logger.warn(
        `IG webhook: story reply missing message id payload=${JSON.stringify(event)}`
      );
      return;
    }

    const messageText: string = message?.text || '';
    const reaction: string | undefined =
      reactionEvent?.emoji ||
      reactionEvent?.reaction ||
      message?.reactions?.[0]?.emoji;

    this._logger.log(
      `IG webhook dispatching story reply ${igMessageId} on story ${igStoryId} by ${senderId}`
    );
    await this.processStoryReply(
      {
        igAccountId,
        igThreadId: recipientId,
        igMessageId,
        igSenderId: senderId,
        igStoryId,
        messageText,
        reaction,
      },
      scope
    );
  }

  private async processStoryReply(
    data: {
      igAccountId: string;
      igThreadId?: string;
      igMessageId: string;
      igSenderId: string;
      igSenderName?: string;
      igStoryId: string;
      messageText: string;
      reaction?: string;
    },
    scope: SignatureScope
  ) {
    const integrations =
      await this._integrationService.getIntegrationsByInternalId(
        data.igAccountId
      );
    this._logger.log(
      `IG webhook: found ${integrations.length} integration(s) for IG account ${data.igAccountId} (story reply)`
    );

    for (const integration of integrations) {
      if (
        integration.providerIdentifier !== 'instagram' ||
        integration.disabled ||
        integration.deletedAt
      ) {
        continue;
      }

      if (!this.isOrgAllowed(scope, integration.organizationId)) {
        this._logger.warn(
          `IG webhook: skipping story reply dispatch to org ${integration.organizationId} outside signature scope`
        );
        continue;
      }

      await this._flowsService.handleIncomingStoryReply({
        integrationId: integration.id,
        organizationId: integration.organizationId,
        igThreadId: data.igThreadId,
        igMessageId: data.igMessageId,
        igSenderId: data.igSenderId,
        igSenderName: data.igSenderName,
        igStoryId: data.igStoryId,
        messageText: data.messageText,
        reaction: data.reaction,
      });
    }
  }

  private async processComment(
    data: {
      igAccountId: string;
      igCommentId: string;
      igCommenterId: string;
      igCommenterName?: string;
      igMediaId: string;
      commentText: string;
    },
    scope: SignatureScope
  ) {
    const integrations =
      await this._integrationService.getIntegrationsByInternalId(
        data.igAccountId
      );
    this._logger.log(
      `IG webhook: found ${integrations.length} integration(s) for IG account ${data.igAccountId}`
    );

    for (const integration of integrations) {
      if (
        integration.providerIdentifier !== 'instagram' ||
        integration.disabled ||
        integration.deletedAt
      ) {
        this._logger.log(
          `IG webhook: skipping integration ${integration.id} (provider=${integration.providerIdentifier} disabled=${integration.disabled} deleted=${!!integration.deletedAt})`
        );
        continue;
      }

      if (!this.isOrgAllowed(scope, integration.organizationId)) {
        this._logger.warn(
          `IG webhook: skipping comment dispatch to org ${integration.organizationId} outside signature scope`
        );
        continue;
      }

      await this._flowsService.handleIncomingComment({
        integrationId: integration.id,
        igCommentId: data.igCommentId,
        igCommenterId: data.igCommenterId,
        igCommenterName: data.igCommenterName,
        igMediaId: data.igMediaId,
        commentText: data.commentText,
        organizationId: integration.organizationId,
      });
    }
  }

  // Resolve, para cada entry.id (igAccountId) do corpo, o conjunto de orgs que
  // possuem uma integracao Instagram ativa daquela conta. Deduplica os ids para
  // evitar consultas repetidas quando a Meta agrupa varias mudancas por conta.
  private async resolveEntryOwners(
    entries: any[]
  ): Promise<Map<string, Set<string>>> {
    const owners = new Map<string, Set<string>>();
    const uniqueIds = [
      ...new Set(
        (entries || [])
          .map((e) => e?.id)
          .filter((id) => id !== undefined && id !== null)
          .map((id) => String(id))
      ),
    ];

    for (const id of uniqueIds) {
      const integrations =
        await this._integrationService.getIntegrationsByInternalId(id);
      const orgIds = new Set<string>();
      for (const integration of integrations) {
        if (integration.providerIdentifier === 'instagram') {
          orgIds.add(integration.organizationId);
        }
      }
      owners.set(id, orgIds);
    }

    return owners;
  }

  private isOrgAllowed(
    scope: SignatureScope,
    organizationId: string
  ): boolean {
    return scope.kind === 'global' || scope.orgIds.has(organizationId);
  }

  private isEntryAllowed(
    scope: SignatureScope,
    ownersByEntryId: Map<string, Set<string>>,
    igAccountId: string
  ): boolean {
    if (scope.kind === 'global') return true;
    const owners = ownersByEntryId.get(String(igAccountId));
    if (!owners) return false;
    for (const org of owners) {
      if (scope.orgIds.has(org)) return true;
    }
    return false;
  }

  private async verifySignature(
    req: RawBodyRequest<Request>,
    ownersByEntryId: Map<string, Set<string>>
  ): Promise<SignatureScope> {
    const signature = req.headers['x-hub-signature-256'] as string;
    const hasRawBody = !!req.rawBody;

    // Use raw Buffer directly for HMAC (avoid encoding issues with .toString)
    const rawBodyBuf: Buffer | null = req.rawBody || null;
    const rawBodyStr =
      rawBodyBuf?.toString('utf8') ??
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    // Uniao das orgs donas das contas recebidas neste webhook. Segredos de
    // credencial so entram como candidatos se pertencerem a uma dessas orgs
    // (D1: nao aceitar a assinatura de uma org para um evento de outra).
    const ownerOrgIds = new Set<string>();
    for (const orgs of ownersByEntryId.values()) {
      for (const org of orgs) ownerOrgIds.add(org);
    }

    // Segredos de ambiente sao GLOBAIS (Meta App operado pela plataforma —
    // confiavel para qualquer conta). Mantidos SEPARADOS dos segredos de
    // credencial para que um secret de tenant igual ao do ambiente nunca
    // escale para escopo global (fica restrito a org dona da credencial).
    const envSecrets: Array<{ value: string; source: string }> = [];
    if (process.env.INSTAGRAM_APP_SECRET) {
      envSecrets.push({
        value: process.env.INSTAGRAM_APP_SECRET,
        source: 'env:INSTAGRAM_APP_SECRET',
      });
    }
    if (process.env.FACEBOOK_APP_SECRET) {
      envSecrets.push({
        value: process.env.FACEBOOK_APP_SECRET,
        source: 'env:FACEBOOK_APP_SECRET',
      });
    }

    // Segredos de credencial das orgs donas, agrupados por VALOR (um secret
    // compartilhado por varias orgs autoriza todas elas — escopo `orgs`).
    const credGroups = new Map<
      string,
      { orgIds: Set<string>; sources: string[] }
    >();
    if (ownerOrgIds.size > 0) {
      const all = await this._credentialService.findAllDecrypted('facebook');
      for (const c of all) {
        if (!ownerOrgIds.has(c.organizationId)) continue;
        const fields: Array<[string, string | undefined]> = [
          ['instagramAppSecret', c.data?.instagramAppSecret],
          ['clientSecret', c.data?.clientSecret],
        ];
        for (const [field, secret] of fields) {
          if (!secret) continue;
          let group = credGroups.get(secret);
          if (!group) {
            group = { orgIds: new Set<string>(), sources: [] };
            credGroups.set(secret, group);
          }
          group.orgIds.add(c.organizationId);
          group.sources.push(`credential:${c.organizationId}:${field}`);
        }
      }
    }

    const totalSecrets = envSecrets.length + credGroups.size;
    const isProd = process.env.NODE_ENV === 'production';

    this._logger.log(
      `IG webhook signature check: hasSignature=${!!signature} hasRawBody=${hasRawBody} rawBodyLen=${rawBodyStr.length} envSecrets=${envSecrets.length} credSecrets=${credGroups.size} ownerOrgs=${ownerOrgIds.size}`
    );

    if (totalSecrets === 0) {
      // Nenhum segredo resolvido para a(s) conta(s) recebida(s).
      if (isProd) {
        this._logger.error(
          'IG webhook: no signing secret resolved for the incoming account(s) in production — rejecting (fail closed).'
        );
        throw new ForbiddenException('No signing secret configured');
      }
      this._logger.warn(
        'IG webhook: no app secret configured, skipping HMAC validation (dev only)'
      );
      return { kind: 'global' };
    }

    // Skip via env var — util quando o proxy re-serializa o corpo e quebra a
    // assinatura. NUNCA honrado em producao (fail closed, D2).
    if (process.env.SKIP_IG_WEBHOOK_HMAC === 'true') {
      if (isProd) {
        this._logger.warn(
          'IG webhook: SKIP_IG_WEBHOOK_HMAC=true is IGNORED in production — validating signature.'
        );
      } else {
        this._logger.warn(
          'IG webhook: HMAC validation skipped (SKIP_IG_WEBHOOK_HMAC=true, dev only)'
        );
        return { kind: 'global' };
      }
    }

    if (!signature) {
      this._logger.warn('IG webhook: missing x-hub-signature-256 header');
      throw new ForbiddenException('Missing signature');
    }

    const sigBuf = Buffer.from(signature);
    const matches = (secret: string): boolean => {
      // Compute HMAC from raw Buffer when available (exact bytes Meta signed)
      const expected =
        'sha256=' +
        crypto
          .createHmac('sha256', secret)
          .update(rawBodyBuf || rawBodyStr)
          .digest('hex');
      const expBuf = Buffer.from(expected);
      return (
        sigBuf.length === expBuf.length &&
        crypto.timingSafeEqual(sigBuf, expBuf)
      );
    };

    const triedSources: string[] = [];

    // Tenta os segredos de ambiente primeiro (escopo global).
    for (const { value, source } of envSecrets) {
      triedSources.push(source);
      if (matches(value)) {
        this._logger.log(`IG webhook: signature valid (source=${source})`);
        return { kind: 'global' };
      }
    }

    // Depois os segredos de credencial (escopo restrito as orgs donas).
    for (const [secret, group] of credGroups) {
      triedSources.push(...group.sources);
      if (matches(secret)) {
        this._logger.log(
          `IG webhook: signature valid (source=${group.sources.join('|')})`
        );
        return { kind: 'orgs', orgIds: group.orgIds };
      }
    }

    this._logger.warn(
      `IG webhook: signature mismatch. Tried ${triedSources.length} source(s): [${triedSources.join(', ')}]. Instagram API with Instagram Login uses a SEPARATE app secret from the Facebook App Secret — set INSTAGRAM_APP_SECRET or instagramAppSecret in the owning workspace credential.`
    );
    throw new ForbiddenException('Invalid signature');
  }
}
