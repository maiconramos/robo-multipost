import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReviewLinksRepository } from '@gitroom/nestjs-libraries/database/prisma/review-links/review-links.repository';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { CommentKind } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const DEFAULT_EXPIRATION_DAYS = 30;
const MAX_EXPIRATION_DAYS = 365;
const TOKEN_BYTES = 32;

const RATE_LIMIT_WINDOW_SECONDS = 300;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

const MAX_CONTENT_LENGTH = 2000;
const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, '');
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return stripHtml(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeContent(value: unknown) {
  if (typeof value !== 'string') return '';
  return stripHtml(value).trim().slice(0, MAX_CONTENT_LENGTH);
}

function sanitizeEmail(value: unknown) {
  const cleaned = sanitizeText(value, MAX_EMAIL_LENGTH).toLowerCase();
  if (!EMAIL_REGEX.test(cleaned)) return '';
  return cleaned;
}

@Injectable()
export class ReviewLinksService {
  constructor(private _repository: ReviewLinksRepository) {}

  async createForPost(params: {
    postId: string;
    orgId: string;
    userId: string;
    expiresInDays?: number;
    allowComment?: boolean;
    allowApprove?: boolean;
  }) {
    const post = await this._repository.assertPostOwnedByOrg(
      params.postId,
      params.orgId
    );
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const requestedDays = Number.isFinite(params.expiresInDays as number)
      ? Math.floor(params.expiresInDays as number)
      : DEFAULT_EXPIRATION_DAYS;
    const days = Math.min(
      Math.max(requestedDays, 1),
      MAX_EXPIRATION_DAYS
    );
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = sha256Hex(rawToken);

    const record = await this._repository.createReviewLink({
      postId: params.postId,
      organizationId: params.orgId,
      createdById: params.userId,
      tokenHash,
      expiresAt,
      allowComment: params.allowComment !== false,
      allowApprove: params.allowApprove !== false,
    });

    return {
      id: record.id,
      token: rawToken,
      allowComment: record.allowComment,
      allowApprove: record.allowApprove,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  listForPost(postId: string, orgId: string) {
    return this._repository.listForPost(postId, orgId);
  }

  async revoke(linkId: string, orgId: string) {
    const result = await this._repository.revoke(linkId, orgId);
    if (!result.count) {
      throw new NotFoundException('Review link not found');
    }
    return { success: true };
  }

  async resolveToken(postId: string, rawToken: unknown) {
    if (typeof rawToken !== 'string' || rawToken.length < 16 || rawToken.length > 128) {
      return null;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(rawToken)) {
      return null;
    }
    const tokenHash = sha256Hex(rawToken);
    const link = await this._repository.findActiveByHashAndPost(tokenHash, postId);
    if (!link) return null;

    // Defense in depth: verify postId match with constant-time compare
    const a = Buffer.from(link.postId);
    const b = Buffer.from(postId);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
    return link;
  }

  private async enforceRateLimit(key: string) {
    try {
      const count = await ioRedis.incr(key);
      if (count === 1) {
        await ioRedis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
      }
      if (count > RATE_LIMIT_MAX_ATTEMPTS) {
        throw new HttpException('Too many requests', 429);
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // If Redis is unavailable, fail closed on write endpoints
      throw new HttpException('Rate limit unavailable', 503);
    }
  }

  async submitGuestAction(params: {
    postId: string;
    rawToken: unknown;
    ip: string | null;
    userAgent: string | null;
    guestName: unknown;
    guestEmail: unknown;
    content: unknown;
    kind: CommentKind;
  }) {
    const ipKey = (params.ip || 'unknown').slice(0, 64);
    await this.enforceRateLimit(
      `review-guest:${params.postId}:${ipKey}:${params.kind}`
    );

    const link = await this.resolveToken(params.postId, params.rawToken);
    if (!link) {
      throw new NotFoundException();
    }

    if (params.kind === CommentKind.COMMENT && !link.allowComment) {
      throw new ForbiddenException();
    }
    if (
      (params.kind === CommentKind.APPROVAL ||
        params.kind === CommentKind.CHANGE_REQUEST) &&
      !link.allowApprove
    ) {
      throw new ForbiddenException();
    }

    const guestName = sanitizeText(params.guestName, MAX_NAME_LENGTH);
    const guestEmail = sanitizeEmail(params.guestEmail);
    const content = sanitizeContent(params.content);

    if (!guestName || !guestEmail) {
      throw new BadRequestException('Name and email are required');
    }

    if (params.kind === CommentKind.COMMENT && !content) {
      throw new BadRequestException('Comment is required');
    }

    const stored = await this._repository.createGuestComment({
      organizationId: link.organizationId,
      postId: link.postId,
      reviewLinkId: link.id,
      content,
      guestName,
      guestEmail,
      guestIp: params.ip ? params.ip.slice(0, 64) : null,
      guestUserAgent: params.userAgent
        ? params.userAgent.slice(0, 500)
        : null,
      kind: params.kind,
    });

    // Do not block the response if touch fails
    this._repository.touchLastUsed(link.id).catch(() => undefined);

    return {
      id: stored.id,
      kind: stored.kind,
      createdAt: stored.createdAt,
    };
  }

}
