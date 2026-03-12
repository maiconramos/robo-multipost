import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AutopostDto } from '@gitroom/nestjs-libraries/dtos/autopost/autopost.dto';

@Injectable()
export class AutopostRepository {
  constructor(private _autoPost: PrismaRepository<'autoPost'>) {}

  getTotal(orgId: string, profileId?: string) {
    return this._autoPost.model.autoPost.count({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
      },
    });
  }

  getAutoposts(orgId: string, profileId?: string) {
    return this._autoPost.model.autoPost.findMany({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
      },
    });
  }

  deleteAutopost(orgId: string, id: string, profileId?: string) {
    return this._autoPost.model.autoPost.update({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  getAutopost(id: string) {
    return this._autoPost.model.autoPost.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        profile: {
          select: { id: true },
        },
      },
    });
  }

  updateUrl(id: string, url: string) {
    return this._autoPost.model.autoPost.update({
      where: {
        id,
      },
      data: {
        lastUrl: url,
      },
    });
  }

  changeActive(orgId: string, id: string, active: boolean, profileId?: string) {
    return this._autoPost.model.autoPost.update({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
      data: {
        active,
      },
    });
  }

  async createAutopost(orgId: string, body: AutopostDto, id?: string, profileId?: string) {
    const { id: newId, active } = await this._autoPost.model.autoPost.upsert({
      where: {
        id: id || uuidv4(),
        organizationId: orgId,
      },
      create: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        url: body.url,
        title: body.title,
        integrations: JSON.stringify(body.integrations),
        active: body.active,
        content: body.content,
        generateContent: body.generateContent,
        addPicture: body.addPicture,
        syncLast: body.syncLast,
        onSlot: body.onSlot,
        lastUrl: body.lastUrl,
      },
      update: {
        url: body.url,
        title: body.title,
        integrations: JSON.stringify(body.integrations),
        active: body.active,
        content: body.content,
        generateContent: body.generateContent,
        addPicture: body.addPicture,
        syncLast: body.syncLast,
        onSlot: body.onSlot,
        lastUrl: body.lastUrl,
      },
    });

    return { id: newId, active };
  }
}
