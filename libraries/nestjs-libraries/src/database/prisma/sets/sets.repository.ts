import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SetsDto } from '@gitroom/nestjs-libraries/dtos/sets/sets.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SetsRepository {
  constructor(private _sets: PrismaRepository<'sets'>) {}

  getTotal(orgId: string, profileId?: string) {
    return this._sets.model.sets.count({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
    });
  }

  getSets(orgId: string, profileId?: string) {
    return this._sets.model.sets.findMany({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  deleteSet(orgId: string, id: string, profileId?: string) {
    return this._sets.model.sets.delete({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
    });
  }

  async createSet(orgId: string, body: SetsDto, profileId?: string) {
    // editar por id so dentro do proprio perfil
    if (body.id) {
      const existing = await this._sets.model.sets.findFirst({
        where: {
          id: body.id,
          organizationId: orgId,
          ...(profileId ? { profileId } : {}),
        },
        select: { id: true },
      });
      if (!existing) {
        throw new HttpException('Set not found', HttpStatus.NOT_FOUND);
      }
    }
    const { id } = await this._sets.model.sets.upsert({
      where: {
        id: body.id || uuidv4(),
        organizationId: orgId,
      },
      create: {
        id: body.id || uuidv4(),
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        name: body.name,
        content: body.content,
      },
      update: {
        name: body.name,
        content: body.content,
      },
    });

    return { id };
  }
}
