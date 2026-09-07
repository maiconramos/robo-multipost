import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma, State } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';

// Estados de post que ainda vão consumir o arquivo no bucket: QUEUE espera o
// horário, DRAFT ainda vai ser agendado e ERROR pode ser republicado. Um post
// PUBLISHED já subiu a mídia para a rede social e não depende mais do arquivo.
export const PENDING_POST_STATES: State[] = [
  State.QUEUE,
  State.DRAFT,
  State.ERROR,
];

export interface MediaUsageCandidate {
  id: string;
  name: string;
  path: string;
  thumbnail: string | null;
  usedAsAvatar: boolean;
}

@Injectable()
export class MediaRepository {
  constructor(
    private _media: PrismaRepository<'media'>,
    private _post: PrismaRepository<'post'>
  ) {}

  saveFile(org: string, fileName: string, filePath: string, originalName?: string, profileId?: string) {
    return this._media.model.media.create({
      data: {
        organization: {
          connect: {
            id: org,
          },
        },
        ...(profileId ? { profile: { connect: { id: profileId } } } : {}),
        name: fileName,
        path: filePath,
        originalName: originalName || null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
      },
    });
  }

  getMediaById(id: string) {
    return this._media.model.media.findUnique({
      where: {
        id,
      },
    });
  }

  private profileFilter(profileId?: string) {
    // Mesmo escopo do getMedia: o perfil ativo enxerga (e portanto pode
    // apagar) a própria mídia e a mídia sem perfil.
    return profileId ? { OR: [{ profileId }, { profileId: null }] } : {};
  }

  /**
   * Carrega as mídias alvo da exclusão já com o sinal de "usada como avatar":
   * `userPicture`/`agencies`/`oauthApps` apontam para o arquivo por FK, então
   * remover o objeto do bucket quebraria a foto de perfil, o logo da agência
   * ou o ícone do app OAuth.
   */
  getMediaForDeletion(
    org: string,
    ids: string[],
    profileId?: string
  ): Promise<MediaUsageCandidate[]> {
    return this._media.model.media
      .findMany({
        where: {
          id: { in: ids },
          organizationId: org,
          deletedAt: null,
          ...this.profileFilter(profileId),
        },
        select: {
          id: true,
          name: true,
          path: true,
          thumbnail: true,
          _count: {
            select: {
              userPicture: true,
              agencies: true,
              oauthApps: true,
            },
          },
        },
      })
      .then((rows) =>
        rows.map(({ _count, ...media }) => ({
          ...media,
          usedAsAvatar:
            _count.userPicture + _count.agencies + _count.oauthApps > 0,
        }))
      );
  }

  /**
   * Posts que ainda vão publicar e referenciam alguma das mídias. A mídia
   * aparece em `image` (JSON `[{id,path}]`) e também em `settings` — a
   * thumbnail do YouTube é uma mídia da biblioteca gravada ali.
   */
  findPendingPostsUsingMedia(org: string, ids: string[]) {
    if (!ids.length) {
      return Promise.resolve([]);
    }

    return this._post.model.post.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        state: { in: PENDING_POST_STATES },
        OR: ids.flatMap((id) => [
          { image: { contains: id } },
          { settings: { contains: id } },
        ]),
      },
      select: {
        id: true,
        state: true,
        publishDate: true,
        image: true,
        settings: true,
      },
    });
  }

  /**
   * Outras mídias vivas que apontam para os mesmos arquivos — `path` igual
   * (duplicata criada por `/media/save-media` com o mesmo nome) ou
   * `thumbnail` igual. Serve para não apagar do bucket um arquivo que continua
   * sendo exibido por outra mídia.
   *
   * De propósito SEM filtro de organização: o bucket é compartilhado entre
   * todas as orgs, então um arquivo referenciado por outra org também não pode
   * ser apagado. Só os ids (nada de conteúdo de outra org) saem daqui, e o
   * resultado apenas impede a remoção.
   */
  findMediaReferencingPaths(paths: string[], excludeIds: string[]) {
    if (!paths.length) {
      return Promise.resolve([]);
    }

    return this._media.model.media.findMany({
      where: {
        deletedAt: null,
        id: { notIn: excludeIds },
        OR: [{ path: { in: paths } }, { thumbnail: { in: paths } }],
      },
      select: {
        id: true,
        path: true,
        thumbnail: true,
      },
    });
  }

  deleteMediaBulk(org: string, ids: string[], profileId?: string) {
    return this._media.model.media.updateMany({
      where: {
        id: { in: ids },
        organizationId: org,
        deletedAt: null,
        ...this.profileFilter(profileId),
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  async getMedia(org: string, page: number, profileId?: string) {
    const pageNum = (page || 1) - 1;
    // Show media for the active profile + unscoped media (profileId is null)
    const profileFilter = this.profileFilter(profileId);
    const query: Prisma.MediaCountArgs = {
      where: {
        organization: {
          id: org,
        },
        // Sem este filtro a contagem inclui mídia já excluída e a paginação
        // passa a exibir páginas vazias depois de uma exclusão em massa.
        deletedAt: null,
        ...profileFilter,
      },
    };
    const pages = Math.ceil((await this._media.model.media.count(query)) / 18);
    const results = await this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        ...profileFilter,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
        // Alimenta o cadeado da grade: mídia que é foto de perfil, logo de
        // agência ou ícone de app OAuth não pode sair do bucket.
        _count: {
          select: {
            userPicture: true,
            agencies: true,
            oauthApps: true,
          },
        },
      },
      skip: pageNum * 18,
      take: 18,
    });

    return {
      pages,
      results: results.map(({ _count, ...media }) => ({
        ...media,
        usedAsAvatar:
          _count.userPicture + _count.agencies + _count.oauthApps > 0,
      })),
    };
  }
}
