import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { CommentKind } from '@prisma/client';

@Injectable()
export class ReviewLinksRepository {
  constructor(
    private _reviewLink: PrismaRepository<'reviewLink'>,
    private _comments: PrismaRepository<'comments'>,
    private _post: PrismaRepository<'post'>
  ) {}

  async assertPostOwnedByOrg(postId: string, orgId: string) {
    return this._post.model.post.findFirst({
      where: {
        id: postId,
        organizationId: orgId,
        deletedAt: null,
      },
      select: { id: true, organizationId: true },
    });
  }

  async createReviewLink(params: {
    postId: string;
    organizationId: string;
    createdById: string;
    tokenHash: string;
    expiresAt: Date | null;
    allowComment: boolean;
    allowApprove: boolean;
  }) {
    return this._reviewLink.model.reviewLink.create({
      data: {
        postId: params.postId,
        organizationId: params.organizationId,
        createdById: params.createdById,
        tokenHash: params.tokenHash,
        expiresAt: params.expiresAt,
        allowComment: params.allowComment,
        allowApprove: params.allowApprove,
      },
      select: {
        id: true,
        allowComment: true,
        allowApprove: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async listForPost(postId: string, orgId: string) {
    return this._reviewLink.model.reviewLink.findMany({
      where: {
        postId,
        organizationId: orgId,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        allowComment: true,
        allowApprove: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true } },
        comments: {
          where: {
            kind: { in: ['APPROVAL', 'CHANGE_REQUEST'] },
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            kind: true,
            createdAt: true,
            guestName: true,
          },
        },
      },
    });
  }

  async revoke(linkId: string, orgId: string) {
    return this._reviewLink.model.reviewLink.updateMany({
      where: {
        id: linkId,
        organizationId: orgId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async findActiveByHashAndPost(tokenHash: string, postId: string) {
    const now = new Date();
    return this._reviewLink.model.reviewLink.findFirst({
      where: {
        tokenHash,
        postId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        post: { deletedAt: null },
      },
      select: {
        id: true,
        postId: true,
        organizationId: true,
        allowComment: true,
        allowApprove: true,
        expiresAt: true,
      },
    });
  }

  async touchLastUsed(linkId: string) {
    return this._reviewLink.model.reviewLink.update({
      where: { id: linkId },
      data: { lastUsedAt: new Date() },
      select: { id: true },
    });
  }

  async createGuestComment(params: {
    organizationId: string;
    postId: string;
    reviewLinkId: string;
    content: string;
    guestName: string;
    guestEmail: string;
    guestIp: string | null;
    guestUserAgent: string | null;
    kind: CommentKind;
  }) {
    return this._comments.model.comments.create({
      data: {
        organizationId: params.organizationId,
        postId: params.postId,
        reviewLinkId: params.reviewLinkId,
        content: params.content,
        guestName: params.guestName,
        guestEmail: params.guestEmail,
        guestIp: params.guestIp,
        guestUserAgent: params.guestUserAgent,
        kind: params.kind,
      },
      select: {
        id: true,
        kind: true,
        createdAt: true,
      },
    });
  }
}
