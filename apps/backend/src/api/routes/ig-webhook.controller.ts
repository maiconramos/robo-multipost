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
    if (!body || !body.entry) {
      this._logger.warn('IG webhook: no entries in body');
      return { status: 'ignored' };
    }

    await this.verifySignature(req, body);

    for (const entry of body.entry) {
      if (!entry.changes) {
        this._logger.warn(`IG webhook entry ${entry.id}: no changes`);
        continue;
      }

      for (const change of entry.changes) {
        this._logger.log(
          `IG webhook change: field=${change.field} entry.id=${entry.id}`
        );
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

        const igAccountId = entry.id;
        this._logger.log(
          `IG webhook dispatching comment ${igCommentId} on media ${igMediaId} by ${igCommenterId}`
        );
        await this.processComment({
          igAccountId,
          igCommentId,
          igCommenterId,
          igCommenterName,
          igMediaId,
          commentText,
        });
      }
    }

    return { status: 'ok' };
  }

  private async processComment(data: {
    igAccountId: string;
    igCommentId: string;
    igCommenterId: string;
    igCommenterName?: string;
    igMediaId: string;
    commentText: string;
  }) {
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

  private async verifySignature(
    req: RawBodyRequest<Request>,
    parsedBody: any
  ) {
    const signature = req.headers['x-hub-signature-256'] as string;
    const hasRawBody = !!req.rawBody;

    // Use raw Buffer directly for HMAC (avoid encoding issues with .toString)
    const rawBodyBuf: Buffer | null = req.rawBody || null;
    const rawBodyStr =
      rawBodyBuf?.toString('utf8') ??
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    // Collect candidate app secrets with source labels for debugging.
    // Order: env var FIRST (matches the app that actually hosts the webhook),
    // then per-workspace credentials.
    const candidates: Array<{ source: string; secret: string }> = [];
    if (process.env.FACEBOOK_APP_SECRET) {
      candidates.push({
        source: 'env:FACEBOOK_APP_SECRET',
        secret: process.env.FACEBOOK_APP_SECRET,
      });
    }
    const all = await this._credentialService.findAllDecrypted('facebook');
    for (const c of all) {
      if (c.data?.clientSecret) {
        candidates.push({
          source: `credential:${c.profileId || 'org'}`,
          secret: c.data.clientSecret,
        });
      }
    }

    // Debug: log raw body details for HMAC troubleshooting
    const rawBodyHash = crypto
      .createHash('sha256')
      .update(rawBodyBuf || rawBodyStr)
      .digest('hex')
      .slice(0, 16);
    this._logger.log(
      `IG webhook signature check: hasSignature=${!!signature} hasRawBody=${hasRawBody} rawBodyLen=${rawBodyStr.length} rawBodyHash=${rawBodyHash} rawBodyStart=${rawBodyStr.slice(0, 80)} candidates=${candidates.length} sources=[${candidates
        .map((c) => `${c.source}(len=${c.secret.length},${c.secret.slice(0, 6)}...)`)
        .join(', ')}]`
    );

    if (candidates.length === 0) {
      // No secret configured anywhere — skip validation (dev mode)
      this._logger.warn(
        'IG webhook: no app secret configured, skipping HMAC validation'
      );
      return;
    }

    if (!signature) {
      this._logger.warn('IG webhook: missing x-hub-signature-256 header');
      throw new ForbiddenException('Missing signature');
    }

    const sigBuf = Buffer.from(signature);
    const computed: string[] = [];
    for (const { source, secret } of candidates) {
      // Compute HMAC from raw Buffer when available (exact bytes Meta signed)
      const expected =
        'sha256=' +
        crypto
          .createHmac('sha256', secret)
          .update(rawBodyBuf || rawBodyStr)
          .digest('hex');
      computed.push(`${source}=${expected.slice(0, 20)}...`);
      const expBuf = Buffer.from(expected);
      if (
        sigBuf.length === expBuf.length &&
        crypto.timingSafeEqual(sigBuf, expBuf)
      ) {
        this._logger.log(`IG webhook: signature valid (source=${source})`);
        return;
      }
    }

    this._logger.warn(
      `IG webhook: signature mismatch. Received: ${signature.slice(0, 20)}... Computed: ${computed.join(' | ')}`
    );
    throw new ForbiddenException('Invalid signature');
  }
}
