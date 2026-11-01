import {
  CreateAnonymousCommentDto,
  GuestReviewCommentDto,
} from '@gitroom/nestjs-libraries/dtos/comments/add.comment.dto';
import { isAnonymousPreviewCommentEnabled } from '@gitroom/nestjs-libraries/database/prisma/posts/preview.comments';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { RealIP } from 'nestjs-real-ip';
import { UserAgent } from '@gitroom/nestjs-libraries/user/user.agent';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { Request, Response } from 'express';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { timingSafeEqual } from 'crypto';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { AgentGraphInsertService } from '@gitroom/nestjs-libraries/agent/agent.graph.insert.service';
import { Nowpayments } from '@gitroom/nestjs-libraries/crypto/nowpayments';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';
import { OnlyURL } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { ReviewLinksService } from '@gitroom/nestjs-libraries/database/prisma/review-links/review-links.service';
import { CommentKind } from '@prisma/client';
import { buildAgentSkillMarkdown } from '@gitroom/nestjs-libraries/agent/agent.skill.template';
import { SkipProfileAccess } from '@gitroom/nestjs-libraries/services/auth/profile-access/profile-access.decorators';

const pump = promisify(pipeline);

// Comparacao de segredo em tempo constante: `!==` curto-circuita no primeiro
// byte diferente e vaza o prefixo correto por timing.
const constantTimeEquals = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

@ApiTags('Public')
@SkipProfileAccess()
@Controller('/public')
export class PublicController {
  constructor(
    private _trackService: TrackService,
    private _agentGraphInsertService: AgentGraphInsertService,
    private _postsService: PostsService,
    private _nowpayments: Nowpayments,
    private _subscriptionService: SubscriptionService,
    private _reviewLinksService: ReviewLinksService
  ) {}

  // Guia/skill de agente em markdown, com a URL do backend já injetada.
  // Público (sem auth) — o conteúdo é instrução, não segredo; as chamadas reais
  // exigem a chave. Passe este link + a chave ao agente (Hermes/OpenClaw/etc.).
  @Get('/agent-skill')
  async agentSkill(@Res() res: Response) {
    const apiUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || process.env.FRONTEND_URL || '';
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(buildAgentSkillMarkdown(apiUrl));
  }

  @Post('/agent')
  async createAgent(@Body() body: { text: string; apiKey: string }) {
    if (
      !body.apiKey ||
      !process.env.AGENT_API_KEY ||
      !constantTimeEquals(String(body.apiKey), process.env.AGENT_API_KEY)
    ) {
      return;
    }
    return this._agentGraphInsertService.newPost(body.text);
  }

  @Get(`/posts/:id`)
  async getPreview(@Param('id') id: string) {
    // pagina sem auth: so campos de exibicao — nunca error (excecao crua do
    // provider), group (alvo de troca de grupo), organizationId, profileId,
    // settings ou childrenPost (mesma classe da CVE-2026-107761)
    return (await this._postsService.getPostsRecursively(id, true)).map(
      (p) => ({
        id: p.id,
        content: p.content,
        image: p.image,
        publishDate: p.publishDate,
        state: p.state,
        delay: p.delay,
        releaseURL: p.releaseURL,
        ...(p.integration
          ? {
              integration: {
                id: p.integration.id,
                name: p.integration.name,
                picture: p.integration.picture,
                providerIdentifier: p.integration.providerIdentifier,
                profile: p.integration.profile,
              },
            }
          : {}),
      })
    );
  }

  @Get(`/posts/:id/comments`)
  async getComments(@Param('id') postId: string) {
    return {
      comments: await this._postsService.getComments(postId),
      anonymousEnabled: isAnonymousPreviewCommentEnabled(),
      recaptchaSiteKey: isAnonymousPreviewCommentEnabled()
        ? process.env.RECAPTCHA_SITE_KEY
        : null,
    };
  }

  @Post('/posts/:id/comments')
  async createAnonymousComment(
    @Param('id') id: string,
    @Body() body: CreateAnonymousCommentDto,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    return this._postsService.createAnonymousComment(
      id,
      body,
      ip || null,
      userAgent || null
    );
  }

  @Get(`/posts/:id/review`)
  async getReviewLinkInfo(
    @Param('id') postId: string,
    @Query('token') token?: string
  ) {
    const link = await this._reviewLinksService.resolveToken(postId, token);
    if (!link) {
      // Do not leak token validity differences
      return { valid: false };
    }
    return {
      valid: true,
      allowComment: link.allowComment,
      allowApprove: link.allowApprove,
      expiresAt: link.expiresAt,
    };
  }

  @Post(`/posts/:id/review/comment`)
  async guestReviewComment(
    @Param('id') postId: string,
    @RealIP() ip: string,
    @UserAgent() userAgent: string,
    @Body() body: GuestReviewCommentDto
  ) {
    return this._reviewLinksService.submitGuestAction({
      postId,
      rawToken: body?.token,
      ip: ip || null,
      userAgent: userAgent || null,
      guestName: body?.guestName,
      guestEmail: body?.guestEmail,
      content: body?.content,
      kind: CommentKind.COMMENT,
      placement: body,
    });
  }

  @Post(`/posts/:id/review/approve`)
  async guestReviewApprove(
    @Param('id') postId: string,
    @RealIP() ip: string,
    @UserAgent() userAgent: string,
    @Body()
    body: {
      token?: string;
      guestName?: string;
      guestEmail?: string;
      decision?: 'APPROVED' | 'CHANGE_REQUESTED';
      note?: string;
    }
  ) {
    const kind =
      body?.decision === 'CHANGE_REQUESTED'
        ? CommentKind.CHANGE_REQUEST
        : CommentKind.APPROVAL;
    return this._reviewLinksService.submitGuestAction({
      postId,
      rawToken: body?.token,
      ip: ip || null,
      userAgent: userAgent || null,
      guestName: body?.guestName,
      guestEmail: body?.guestEmail,
      content: body?.note,
      kind,
    });
  }

  @Post('/t')
  async trackEvent(
    @Res() res: Response,
    @Req() req: Request,
    @RealIP() ip: string,
    @UserAgent() userAgent: string,
    @Body()
    body: { fbclid?: string; tt: TrackEnum; additional: Record<string, any> }
  ) {
    // Devolvido ao cliente sem autenticacao: makeId vazaria saidas do PRNG.
    const uniqueId = req?.cookies?.track || makeSecureId(10);
    const fbclid = req?.cookies?.fbclid || body.fbclid;
    await this._trackService.track(
      uniqueId,
      ip,
      userAgent,
      body.tt,
      body.additional,
      fbclid
    );
    if (!req.cookies.track) {
      res.cookie('track', uniqueId, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED
          ? {
              secure: true,
              httpOnly: true,
            }
          : {}),
        sameSite: 'none',
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });
    }

    if (body.fbclid && !req.cookies.fbclid) {
      res.cookie('fbclid', body.fbclid, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED
          ? {
              secure: true,
              httpOnly: true,
            }
          : {}),
        sameSite: 'none',
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });
    }

    res.status(200).json({
      track: uniqueId,
    });
  }

  @Post('/modify-subscription')
  async modifySubscription(@Body('params') params: string) {
    try {
      const load = AuthService.verifyJWT(params) as {
        orgId: string;
        billing: 'FREE' | 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE';
      };

      // Convite, login e reset usam o mesmo JWT_SECRET: rejeita os formatos
      // conhecidos e exige os tipos certos.
      if (
        !load ||
        typeof load.orgId !== 'string' ||
        !load.billing ||
        !pricing[load.billing] ||
        'timeLimit' in load ||
        'providerName' in load ||
        'expires' in load ||
        'integrationId' in load
      ) {
        return { success: false };
      }

      const totalChannels = pricing[load.billing].channel || 0;

      await this._subscriptionService.modifySubscriptionByOrg(
        load.orgId,
        totalChannels,
        load.billing
      );

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  @Post('/crypto/:path')
  async cryptoPost(@Body() body: any, @Param('path') path: string) {
    // `path` e o JWT portador do pedido: nunca logar.
    return this._nowpayments.processPayment(path, body);
  }

  @Get('/stream')
  async streamFile(
    @Query() query: OnlyURL,
    @Res() res: Response,
    @Req() req: Request
  ) {
    // The proxy is served under the application's origin, so an upstream
    // response must never become an active HTML/SVG document here.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; media-src 'self' blob:; sandbox"
    );
    const { url } = query;
    if (!url.endsWith('mp4')) {
      return res.status(400).send('Invalid video URL');
    }

    // Browsers seek by requesting a single byte interval. Do not forward
    // arbitrary request headers (especially cookies/authorization) upstream.
    const range = req.headers?.range;
    if (range !== undefined) {
      if (
        typeof range !== 'string' ||
        range.length > 128 ||
        !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)
      ) {
        return res.status(400).send('Invalid video Range');
      }
      const [start, end] = range.slice('bytes='.length).split('-');
      if (start && end && BigInt(end) < BigInt(start)) {
        return res.status(400).send('Invalid video Range');
      }
    }

    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on('aborted', onClose);
    res.on('close', onClose);

    // Manually follow redirects so every hop is re-validated against
    // the SSRF blocklist (see GHSA-34w8-5j2v-h6ww). `fetch` defaults to
    // `redirect: 'follow'`, which bypasses the DTO-level URL check.
    const MAX_REDIRECTS = 5;
    let currentUrl = url;
    let r: globalThis.Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await isSafePublicHttpsUrl(currentUrl))) {
        return res.status(400).send('Blocked URL');
      }

      try {
        r = await fetch(currentUrl, {
          signal: ac.signal,
          redirect: 'manual',
          headers: {
            'Accept-Encoding': 'identity',
            ...(range ? { Range: range } : {}),
          },
          // @ts-ignore — undici option, not in lib.dom fetch types
          dispatcher: ssrfSafeDispatcher,
        });
      } catch (err) {
        // o player fechou antes da resposta: nada a enviar nem a logar
        if (ac.signal.aborted) {
          return;
        }
        throw err;
      }

      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get('location');
        await r.body?.cancel().catch(() => undefined);
        if (!location) {
          return res.status(502).send('Redirect without Location');
        }
        try {
          currentUrl = new URL(location, currentUrl).toString();
        } catch {
          return res.status(400).send('Invalid redirect target');
        }
        continue;
      }

      break;
    }

    if (!r) {
      return res.status(502).send('No upstream response');
    }

    if (r.status >= 300 && r.status < 400) {
      return res.status(508).send('Too many redirects');
    }

    if (r.status === 416) {
      const contentRange = r.headers.get('content-range');
      if (contentRange && /^bytes \*\/\d+$/.test(contentRange)) {
        res.setHeader('Content-Range', contentRange);
      }
      await r.body?.cancel().catch(() => undefined);
      return res.status(416).end();
    }

    if (!r.ok && r.status !== 206) {
      res.status(r.status);
      throw new Error(`Upstream error: ${r.statusText}`);
    }

    const type = (r.headers.get('content-type') ?? 'application/octet-stream')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (
      !['video/mp4', 'application/mp4', 'application/octet-stream'].includes(
        type
      )
    ) {
      await r.body?.cancel().catch(() => undefined);
      return res.status(502).send('Invalid video content type');
    }
    res.setHeader('Content-Type', 'video/mp4');

    const contentRange = r.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const len = r.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    const acceptRanges = r.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    if (r.status === 206) res.status(206); // Partial Content for range responses

    try {
      await pump(Readable.fromWeb(r.body as any), res);
    } catch (err) {}
  }
}
