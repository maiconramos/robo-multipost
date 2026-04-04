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
  async handleWebhook(@Req() req: Request) {
    const body = req.body;
    if (!body || !body.entry) {
      return { status: 'ignored' };
    }

    // Resolve app secret per-entry (via integration lookup) to verify HMAC
    // We verify signature using any app secret that successfully matches —
    // since pageId can be inferred from the body after parsing.
    await this.verifySignature(req, body);

    for (const entry of body.entry) {
      if (!entry.changes) continue;

      for (const change of entry.changes) {
        if (change.field !== 'comments' && change.field !== 'feed') continue;

        const value = change.value;
        if (!value || value.item !== 'comment') continue;

        const igCommentId = value.comment_id || value.id;
        const igCommenterId = value.from?.id;
        const igCommenterName = value.from?.username;
        const igMediaId = value.media?.id || value.post_id;
        const commentText = value.message || value.text || '';

        if (!igCommentId || !igCommenterId || !igMediaId) continue;

        const pageId = entry.id;
        await this.processComment({
          pageId,
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
    pageId: string;
    igCommentId: string;
    igCommenterId: string;
    igCommenterName?: string;
    igMediaId: string;
    commentText: string;
  }) {
    const integrations =
      await this._integrationService.getIntegrationsByInternalId(data.pageId);

    for (const integration of integrations) {
      if (
        integration.providerIdentifier !== 'instagram' ||
        integration.disabled ||
        integration.deletedAt
      ) {
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

  private async verifySignature(req: Request, parsedBody: any) {
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawBody =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    // Collect candidate app secrets: per-workspace credentials first, then env var
    const candidates: string[] = [];
    const all = await this._credentialService.findAllDecrypted('facebook');
    for (const c of all) {
      if (c.data?.clientSecret) candidates.push(c.data.clientSecret);
    }
    if (process.env.FACEBOOK_APP_SECRET) {
      candidates.push(process.env.FACEBOOK_APP_SECRET);
    }

    if (candidates.length === 0) {
      // No secret configured anywhere — skip validation (dev mode)
      return;
    }

    if (!signature) {
      throw new ForbiddenException('Missing signature');
    }

    const sigBuf = Buffer.from(signature);
    for (const secret of candidates) {
      const expected =
        'sha256=' +
        crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const expBuf = Buffer.from(expected);
      if (
        sigBuf.length === expBuf.length &&
        crypto.timingSafeEqual(sigBuf, expBuf)
      ) {
        return; // valid
      }
    }

    throw new ForbiddenException('Invalid signature');
  }
}
