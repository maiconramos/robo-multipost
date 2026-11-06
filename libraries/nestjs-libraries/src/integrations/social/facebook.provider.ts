import {
  facebookStoryCommentError,
  facebookAllowsComments,
  FACEBOOK_STORY_COMMENTS_ERROR,
} from './facebook.story-comments';
import { facebookBackgroundPreset } from './facebook.background';
import { socialMutationOnce } from './mutation.once';
import { DashboardFunction } from '@gitroom/nestjs-libraries/integrations/dashboard.function.decorator';
import {
  AnalyticsData,
  AuthTokenDetails,
  ClientInformation,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import dayjs from 'dayjs';
import {
  BadBody,
  RefreshToken,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { FacebookDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/facebook.dto';
import { DribbbleDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/dribbble.dto';
import { Integration } from '@prisma/client';
import {
  META_FACEBOOK_GRAPH_URL,
  META_FACEBOOK_OAUTH_URL,
} from '@gitroom/nestjs-libraries/integrations/social/meta-graph.constants';
import { timer } from '@gitroom/helpers/utils/timer';
import { FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS } from '../automations/facebook-comment-automation.adapter';

// Aborta a chamada Graph API se passar de `timeoutMs` ms. Evita que uma
// chamada lenta a graph.facebook.com (comum em agencias com muitas pages
// via Business Manager) trave o OAuth callback inteiro e cause 504 do Nginx.
async function fetchWithTimeout(
  url: string,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'error' });
  } catch {
    // A network error can contain its URL (including an OAuth secret).
    throw new Error('Meta request failed');
  } finally {
    clearTimeout(timeout);
  }
}

export class FacebookProvider extends SocialAbstract implements SocialProvider {
  identifier = 'facebook';
  name = 'Facebook Page';
  isBetweenSteps = true;
  // refreshToken() abaixo e stub: Page Access Token nao se renova por
  // refresh_token. Ver noNativeRefresh na interface.
  noNativeRefresh = true;
  scopes = [
    'pages_show_list',
    'business_management',
    'pages_manage_posts',
    'pages_manage_engagement',
    'pages_read_engagement',
    'read_insights',
  ];
  override maxConcurrentJob = 100; // Facebook has reasonable rate limits
  editor = 'normal' as const;
  maxLength() {
    return 63206;
  }
  dto = FacebookDto;

  override handleErrors(
    body: string,
    status: number
  ):
    | {
        type: 'refresh-token' | 'bad-body' | 'retry';
        value: string;
      }
    | undefined {
    // Rejeicoes recorrentes do Graph que antes viravam "Unknown Error".
    // Checkpoint da Meta (190/459): como no Instagram, passa pelo fluxo de
    // refresh do fork (self-heal por Usuario do Sistema e, sem ele, desconexao
    // com o aviso) em vez de so falhar o post. Fica antes do mapeamento
    // generico de "Error validating access token" para manter a orientacao.
    if (/"error_subcode":\s*459\b/.test(body)) {
      return {
        type: 'refresh-token' as const,
        value:
          'Facebook is asking you to resolve a security check. Log in at facebook.com, complete it, then reconnect the channel',
      };
    }
    if (/"error_subcode":\s*492\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value:
          'Your Facebook user no longer has a role on this Page. Ask a Page admin to grant you a role, then reconnect the channel',
      };
    }
    if (body.indexOf('must be granted before impersonating') > -1) {
      return {
        type: 'refresh-token' as const,
        value:
          'Facebook Page permissions are missing, please reconnect the channel and allow all permissions',
      };
    }
    if (
      /"error_subcode":\s*33\b/.test(body) &&
      body.indexOf('does not exist') > -1
    ) {
      return {
        type: 'bad-body' as const,
        value:
          'The Facebook Page or post this was targeting no longer exists, please reconnect the channel and schedule again',
      };
    }
    // Token valido mas do usuario, nao da Pagina: so a reconexao resolve.
    if (
      body.indexOf(
        'Unpublished posts must be posted to a page as the page itself'
      ) > -1
    ) {
      return {
        type: 'refresh-token' as const,
        value:
          'This app is not authorized to publish as this page, please reconnect the channel',
      };
    }
    // Access token validation errors - require re-authentication
    if (body.indexOf('Error validating access token') > -1) {
      return {
        type: 'refresh-token' as const,
        value: 'Please re-authenticate your Facebook account',
      };
    }

    if (body.indexOf('490') > -1) {
      return {
        type: 'refresh-token' as const,
        value: 'Access token expired, please re-authenticate',
      };
    }

    if (body.indexOf('REVOKED_ACCESS_TOKEN') > -1) {
      return {
        type: 'refresh-token' as const,
        value: 'Access token has been revoked, please re-authenticate',
      };
    }

    if (body.indexOf('1366046') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Photos should be smaller than 4 MB and saved as JPG, PNG',
      };
    }

    // code 368 / subcode 1390008: a Meta documenta como bloqueio temporario
    // ("wait and retry the operation").
    if (body.indexOf('1390008') > -1) {
      return {
        type: 'retry' as const,
        value: 'You are posting too fast, please slow down',
      };
    }

    // Content policy violations
    if (body.indexOf('1346003') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Content flagged as abusive by Facebook',
      };
    }

    if (body.indexOf('1404006') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          "We couldn't post your comment, A security check in facebook required to proceed.",
      };
    }

    if (body.indexOf('1404102') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Content violates Facebook Community Standards',
      };
    }

    // Permission errors
    if (body.indexOf('1404078') > -1) {
      return {
        type: 'refresh-token' as const,
        value: 'Page publishing authorization required, please re-authenticate',
      };
    }

    if (body.indexOf('1609008') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Cannot post Facebook.com links',
      };
    }

    // Parameter validation errors
    if (body.indexOf('2061006') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Invalid URL format in post content',
      };
    }

    if (body.indexOf('1349125') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Invalid content format',
      };
    }

    if (body.indexOf('1404112') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'For security reasons, your account has limited access to the site for a few days',
      };
    }

    if (body.indexOf('Name parameter too long') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Post content is too long',
      };
    }

    // Service errors - checking specific subcodes first
    if (body.indexOf('1363047') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Facebook service temporarily unavailable',
      };
    }

    if (body.indexOf('1609010') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Facebook service temporarily unavailable',
      };
    }

    // Catch-alls genericos por ultimo, para nao sombrear subcodes especificos
    // (ex.: 1404078 tambem traz "(#200)" na mensagem).
    if (body.indexOf('Sorry, something went wrong') > -1) {
      return {
        type: 'retry' as const,
        value: 'Facebook is temporarily unavailable, please try again later',
      };
    }

    if (body.indexOf('(#200)') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Facebook rejected the post due to missing permissions. Make sure your Facebook account has full content access to the Page, then reconnect the channel.',
      };
    }

    if (status === 401) {
      return {
        type: 'bad-body' as const,
        value:
          'An unknown error occurred, please try again later or contact support',
      };
    }

    return undefined;
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl(clientInformation?: ClientInformation) {
    const clientId =
      clientInformation?.client_id || process.env.FACEBOOK_APP_ID;
    const state = makeSecureId(6);
    return {
      url:
        `${META_FACEBOOK_OAUTH_URL}/dialog/oauth` +
        `?client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(
          `${process.env.FRONTEND_URL}/integrations/social/facebook`
        )}` +
        `&state=${state}` +
        `&scope=${this.authorizationScopes(clientInformation).join(',')}` +
        (clientInformation?.facebookAutomation ? '&auth_type=rerequest' : ''),
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  private authorizationScopes(clientInformation?: ClientInformation) {
    return clientInformation?.facebookAutomation
      ? [
          ...new Set([
            ...this.scopes,
            ...FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS,
          ]),
        ]
      : this.scopes;
  }

  async reConnect(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    const information = await this.fetchPageInformation(accessToken, {
      page: requiredId,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  async authenticate(
    params: {
      code: string;
      codeVerifier: string;
      refresh?: string;
    },
    clientInformation?: ClientInformation
  ) {
    const clientId =
      clientInformation?.client_id || process.env.FACEBOOK_APP_ID;
    const clientSecret =
      clientInformation?.client_secret || process.env.FACEBOOK_APP_SECRET;

    const getAccessToken = await (
      await fetchWithTimeout(
        `${META_FACEBOOK_GRAPH_URL}/oauth/access_token` +
          `?client_id=${clientId}` +
          `&redirect_uri=${encodeURIComponent(
            `${process.env.FRONTEND_URL}/integrations/social/facebook${
              params.refresh ? `?refresh=${params.refresh}` : ''
            }`
          )}` +
          `&client_secret=${encodeURIComponent(clientSecret || '')}` +
          `&code=${encodeURIComponent(params.code)}`
      )
    ).json();

    if (!getAccessToken.access_token) {
      throw new Error('Meta token exchange failed');
    }

    const longLivedResponse = await (
      await fetchWithTimeout(
        `${META_FACEBOOK_GRAPH_URL}/oauth/access_token` +
          '?grant_type=fb_exchange_token' +
          `&client_id=${clientId}` +
          `&client_secret=${encodeURIComponent(clientSecret || '')}` +
          `&fb_exchange_token=${encodeURIComponent(
            getAccessToken.access_token
          )}&fields=access_token,expires_in`
      )
    ).json();

    if (!longLivedResponse.access_token) {
      throw new Error('Meta long-lived token exchange failed');
    }
    const { access_token } = longLivedResponse;

    const permsResponse = await (
      await fetchWithTimeout(
        `${META_FACEBOOK_GRAPH_URL}/me/permissions?access_token=${encodeURIComponent(
          access_token
        )}`
      )
    ).json();

    if (!permsResponse.data) {
      throw new Error('Meta permissions check failed');
    }
    const { data } = permsResponse;

    const permissions = data
      .filter((d: any) => d.status === 'granted')
      .map((p: any) => p.permission);
    this.checkScopes(this.authorizationScopes(clientInformation), permissions);

    const { id, name, picture } = await (
      await fetchWithTimeout(
        `${META_FACEBOOK_GRAPH_URL}/me?fields=id,name,picture&access_token=${access_token}`
      )
    ).json();

    return {
      id,
      name,
      accessToken: access_token,
      refreshToken: access_token,
      expiresIn: dayjs().add(59, 'days').unix() - dayjs().unix(),
      picture: picture?.data?.url || '',
      username: '',
    };
  }

  @DashboardFunction()
  async pages(accessToken: string) {
    const seenIds = new Set<string>();
    const allPages: any[] = [];

    // Orcamento total de 90s para o pages() inteiro. Se ultrapassar, retornamos
    // os resultados parciais ja coletados — evita 504 do Nginx em agencias com
    // muitas pages via Business Manager.
    const overallDeadline = Date.now() + 90000;
    const budgetExceeded = () => Date.now() > overallDeadline;

    const fetchPaginated = async (startUrl: string) => {
      let nextUrl: string | undefined = startUrl;
      while (nextUrl) {
        if (budgetExceeded()) return;
        const response = await (await fetchWithTimeout(nextUrl)).json();
        if (response.data) {
          for (const page of response.data) {
            if (!seenIds.has(page.id)) {
              seenIds.add(page.id);
              allPages.push(page);
            }
          }
        }
        nextUrl = response.paging?.next;
      }
    };

    // Fetch pages the user explicitly shared during the OAuth dialog
    try {
      await fetchPaginated(
        `${META_FACEBOOK_GRAPH_URL}/me/accounts?fields=id,username,name,access_token,picture.type(large)&limit=100&access_token=${accessToken}`
      );
    } catch (err) {
      console.warn(
        '[Facebook.pages] /me/accounts failed:',
        (err as Error)?.message
      );
    }

    // Also fetch pages via Business Manager API to discover pages not selected
    // during the OAuth page selection step. Atencao: o custo escala com o
    // numero de BMs selecionados no Meta App — apps com muitos BMs podem
    // estourar o rate limit (#4 "Application request limit reached"). Controle
    // no painel do Meta App selecionando apenas os BMs necessarios. O budget
    // de 90s + timeouts individuais garantem que nunca pendura indefinido.
    if (!budgetExceeded()) {
      try {
        let bizUrl:
          | string
          | undefined = `${META_FACEBOOK_GRAPH_URL}/me/businesses?access_token=${accessToken}`;

        while (bizUrl && !budgetExceeded()) {
          const bizResponse = await (await fetchWithTimeout(bizUrl)).json();
          if (bizResponse.data) {
            for (const business of bizResponse.data) {
              if (budgetExceeded()) break;
              try {
                await fetchPaginated(
                  `${META_FACEBOOK_GRAPH_URL}/${business.id}/owned_pages?fields=id,username,name,access_token,picture.type(large)&limit=100&access_token=${accessToken}`
                );
              } catch {
                // Continue with other businesses
              }

              if (budgetExceeded()) break;
              try {
                await fetchPaginated(
                  `${META_FACEBOOK_GRAPH_URL}/${business.id}/client_pages?fields=id,username,name,access_token,picture.type(large)&limit=100&access_token=${accessToken}`
                );
              } catch {
                // Continue with other businesses
              }
            }
          }
          bizUrl = bizResponse.paging?.next;
        }
      } catch {
        // Business Manager API not available for all users
      }
    }

    if (budgetExceeded()) {
      console.warn(
        `[Facebook.pages] budget de 90s estourado — retornando ${allPages.length} paginas coletadas ate agora`
      );
    }

    return allPages;
  }

  async fetchPageInformation(accessToken: string, data: { page: string }) {
    const pageId = data.page;
    const fields = 'id,username,name,access_token,picture.type(large)';

    // Pagina listada por um negocio em que o usuario nao tem papel vem sem
    // page token: seguimos procurando uma listagem que tenha o token.
    let foundWithoutToken = false;

    const searchPaginated = async (startUrl: string) => {
      let url: string | undefined = startUrl;
      while (url) {
        const response = await (await fetchWithTimeout(url)).json();
        if (response.data) {
          const page = response.data.find(
            (p: any) => String(p.id) === String(pageId)
          );
          if (page && !page.access_token) {
            foundWithoutToken = true;
          } else if (page) {
            return {
              id: page.id,
              name: page.name,
              access_token: page.access_token,
              picture: page.picture?.data?.url || '',
              username: page.username,
            };
          }
        }
        url = response.paging?.next;
      }
      return null;
    };

    // 1. Check /me/accounts
    const fromAccounts = await searchPaginated(
      `${META_FACEBOOK_GRAPH_URL}/me/accounts?fields=${fields}&limit=100&access_token=${accessToken}`
    );
    if (fromAccounts) return fromAccounts;

    // 2. Check Business Manager owned_pages and client_pages.
    // Custo escala com o numero de BMs no Meta App — controle a quantidade
    // de BMs selecionados no painel do App para evitar estourar rate limit.
    try {
      let bizUrl:
        | string
        | undefined = `${META_FACEBOOK_GRAPH_URL}/me/businesses?access_token=${accessToken}`;

      while (bizUrl) {
        const bizResponse = await (await fetchWithTimeout(bizUrl)).json();
        if (bizResponse.data) {
          for (const business of bizResponse.data) {
            try {
              const fromOwned = await searchPaginated(
                `${META_FACEBOOK_GRAPH_URL}/${business.id}/owned_pages?fields=${fields}&limit=100&access_token=${accessToken}`
              );
              if (fromOwned) return fromOwned;
            } catch {
              // Continue with other businesses
            }

            try {
              const fromClient = await searchPaginated(
                `${META_FACEBOOK_GRAPH_URL}/${business.id}/client_pages?fields=${fields}&limit=100&access_token=${accessToken}`
              );
              if (fromClient) return fromClient;
            } catch {
              // Continue with other businesses
            }
          }
        }
        bizUrl = bizResponse.paging?.next;
      }
    } catch {
      // Business Manager API not available for all users
    }

    if (foundWithoutToken) {
      throw new Error(
        'Your Facebook user has no permission to manage this page. Ask a page admin for full content access, then reconnect the channel'
      );
    }

    throw new Error('Page not found in your accounts');
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<FacebookDto>[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;

    const preset = facebookBackgroundPreset(firstPost);
    if (preset) {
      const url = `${META_FACEBOOK_GRAPH_URL}/${id}/feed?fields=id,permalink_url`;
      const payload = {
        message: firstPost.message,
        published: true,
        text_format_preset_id: preset,
      };
      const send = (body: any) =>
        socialMutationOnce(this.identifier, url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      let result = await send(payload);
      if (
        !result.ok &&
        result.status === 400 &&
        result.body?.error?.code === 100 &&
        /text_format_preset_id/i.test(result.body.error.message || '')
      ) {
        const { text_format_preset_id, ...plain } = payload;
        result = await send(plain);
      }
      if (!result.ok || result.body?.error || !result.body?.id) {
        if (result.body?.error?.code === 190)
          throw new RefreshToken(
            this.identifier,
            '{}',
            '{}',
            'Reconecte o canal do Facebook.'
          );
        throw new BadBody(
          this.identifier,
          '{}',
          '{}',
          'Facebook não confirmou a publicação com fundo.'
        );
      }
      return [
        {
          id: firstPost.id,
          postId: String(result.body.id),
          releaseURL:
            result.body.permalink_url ||
            `https://www.facebook.com/${encodeURIComponent(
              String(result.body.id)
            )}`,
          status: 'success',
        },
      ];
    }

    // Facebook Page Stories: publica via /photo_stories e /video_stories.
    // Story nao tem carrossel — cada midia vira um story separado, igual ao IG.
    if (firstPost?.settings?.post_type === 'story') {
      const error = facebookStoryCommentError(
        firstPost.settings,
        postDetails.length
      );
      if (error) throw new BadBody(this.identifier, '{}', '{}', error);
      return this.postStory(id, accessToken, firstPost);
    }

    let finalId = '';
    let finalUrl = '';
    if ((firstPost?.media?.[0]?.path?.indexOf('mp4') || -2) > -1) {
      const {
        id: videoId,
        permalink_url,
        ...all
      } = await (
        await this.fetch(
          `${META_FACEBOOK_GRAPH_URL}/${id}/videos?access_token=${accessToken}&fields=id,permalink_url`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              file_url: firstPost?.media?.[0]?.path!,
              description: firstPost.message,
              published: true,
              ...(firstPost?.settings?.title
                ? { title: firstPost.settings.title }
                : {}),
            }),
          },
          'upload mp4'
        )
      ).json();

      finalUrl = 'https://www.facebook.com/reel/' + videoId;
      finalId = videoId;
    } else {
      const uploadPhotos = !firstPost?.media?.length
        ? []
        : await Promise.all(
            firstPost.media.map(async (media) => {
              const { id: photoId } = await (
                await this.fetch(
                  `${META_FACEBOOK_GRAPH_URL}/${id}/photos?access_token=${accessToken}`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      url: media.path,
                      published: false,
                    }),
                  },
                  'upload images slides'
                )
              ).json();

              return { media_fbid: photoId };
            })
          );

      const {
        id: postId,
        permalink_url,
        ...all
      } = await (
        await this.fetch(
          `${META_FACEBOOK_GRAPH_URL}/${id}/feed?access_token=${accessToken}&fields=id,permalink_url`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...(uploadPhotos?.length ? { attached_media: uploadPhotos } : {}),
              ...(firstPost?.settings?.url
                ? { link: firstPost.settings.url }
                : {}),
              message: firstPost.message,
              published: true,
            }),
          },
          'finalize upload'
        )
      ).json();

      finalUrl = permalink_url;
      finalId = postId;
    }

    return [
      {
        id: firstPost.id,
        postId: finalId,
        releaseURL: finalUrl,
        status: 'success',
      },
    ];
  }

  // Publica uma ou mais midias como Facebook Page Stories. Story nao suporta
  // carrossel, entao cada midia e publicada como um story independente —
  // mesmo comportamento do InstagramProvider para stories com multiplas midias.
  private async postStory(
    id: string,
    accessToken: string,
    firstPost: PostDetails<FacebookDto>
  ): Promise<PostResponse[]> {
    const medias = firstPost?.media || [];
    if (!medias.length) {
      // A validacao do frontend (checkValidity) ja impede isso; guarda defensiva.
      throw new BadBody(
        'facebook-story',
        '{}',
        '{}',
        'Facebook Stories require at least one media'
      );
    }

    let lastPostId = '';
    for (const media of medias) {
      const isVideo = (media?.path?.indexOf('mp4') || -2) > -1;
      lastPostId = isVideo
        ? await this.uploadVideoStory(id, accessToken, media.path)
        : await this.uploadPhotoStory(id, accessToken, media.path);
    }

    return [
      {
        id: firstPost.id,
        postId: lastPostId,
        releaseURL: `https://www.facebook.com/${lastPostId}`,
        status: 'success',
      },
    ];
  }

  // Story de foto: faz upload da imagem como nao-publicada para obter o photo_id
  // e em seguida publica via /photo_stories. Retorna o post_id do story.
  private async uploadPhotoStory(
    id: string,
    accessToken: string,
    url: string
  ): Promise<string> {
    const { id: photoId } = await (
      await this.fetch(
        `${META_FACEBOOK_GRAPH_URL}/${id}/photos?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, published: false }),
        },
        'upload story photo'
      )
    ).json();

    const { post_id } = await (
      await this.fetch(
        `${META_FACEBOOK_GRAPH_URL}/${id}/photo_stories?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_id: photoId }),
        },
        'publish photo story'
      )
    ).json();

    return String(post_id || photoId);
  }

  // Story de video: upload resumavel em 3 fases (start -> upload -> finish).
  // No upload usamos o header `file_url` para a Meta buscar o arquivo do nosso
  // storage hospedado (R2/local com URL publica), evitando streamar bytes.
  private async uploadVideoStory(
    id: string,
    accessToken: string,
    fileUrl: string
  ): Promise<string> {
    // Fase 1 — start: cria a sessao e devolve video_id + upload_url (rupload).
    const { video_id, upload_url } = await (
      await this.fetch(
        `${META_FACEBOOK_GRAPH_URL}/${id}/video_stories?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upload_phase: 'start' }),
        },
        'start video story'
      )
    ).json();

    // Fase 2 — upload hospedado: Meta busca o arquivo pela URL.
    await this.fetch(
      upload_url,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${accessToken}`,
          file_url: fileUrl,
        },
      },
      'upload video story'
    );

    await this.waitForVideoStoryUpload(video_id, accessToken);

    // Fase 3 — finish: publica o story.
    const { post_id } = await (
      await this.fetch(
        `${META_FACEBOOK_GRAPH_URL}/${id}/video_stories?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upload_phase: 'finish', video_id }),
        },
        'finish video story'
      )
    ).json();

    return String(post_id || video_id);
  }

  private async waitForVideoStoryUpload(
    videoId: string,
    accessToken: string
  ): Promise<void> {
    // O activity de publicacao tem timeout de 10 minutos. Limitamos o polling
    // a menos de 8 minutos para falhar de forma explicita antes de o Temporal
    // interromper a activity e correr o risco de um retry cego.
    const maxAttempts = 48;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { status } = await (
        await this.fetch(
          `${META_FACEBOOK_GRAPH_URL}/${videoId}?fields=status&access_token=${accessToken}`,
          undefined,
          'check video story upload',
          0,
          true
        )
      ).json();
      const videoStatus = status?.video_status || 'in_progress';

      if (videoStatus === 'upload_complete' || videoStatus === 'ready') {
        return;
      }
      if (videoStatus === 'error') {
        throw new BadBody(
          'facebook-story',
          JSON.stringify({ status }),
          '{}',
          'Facebook could not process the Story video'
        );
      }

      if (attempt < maxAttempts - 1) {
        await timer(10000);
      }
    }

    throw new BadBody(
      'facebook-story',
      '{}',
      '{}',
      'Facebook Story video processing timed out'
    );
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails<FacebookDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    if (!facebookAllowsComments(commentPost?.settings)) {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        FACEBOOK_STORY_COMMENTS_ERROR
      );
    }
    const replyToId = lastCommentId || postId;

    const data = await (
      await this.fetch(
        `${META_FACEBOOK_GRAPH_URL}/${replyToId}/comments?access_token=${accessToken}&fields=id,permalink_url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...(commentPost.media?.length
              ? { attachment_url: commentPost.media[0].path }
              : {}),
            message: commentPost.message,
          }),
        },
        'add comment'
      )
    ).json();

    return [
      {
        id: commentPost.id,
        postId: data.id,
        releaseURL: data.permalink_url,
        status: 'success',
      },
    ];
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const until = dayjs().endOf('day').unix();
    const since = dayjs().subtract(date, 'day').unix();

    const { data, error } = await (
      await this.analyticsFetch(
        `${META_FACEBOOK_GRAPH_URL}/${id}/insights?metric=page_total_media_view_unique,page_media_view,page_post_engagements,page_daily_follows&access_token=${accessToken}&period=day&since=${since}&until=${until}`
      )
    ).json();

    // Lancar para checkAnalytics nao cachear um resultado vazio por uma hora.
    if (error) {
      console.warn('Facebook page insights returned an error:', { id, error });
      throw new Error(error.message || 'Facebook page insights error');
    }

    const metricTotal = (value: unknown): string => {
      if (value && typeof value === 'object') {
        const numericValues = Object.values(
          value as Record<string, unknown>
        ).filter((current): current is number => typeof current === 'number');
        const total = numericValues.reduce((sum, current) => sum + current, 0);
        return String(total);
      }
      return String(value ?? 0);
    };

    return (
      data?.map((d: any) => ({
        label:
          d.name === 'page_total_media_view_unique'
            ? 'Page Impressions'
            : d.name === 'page_post_engagements'
            ? 'Posts Engagement'
            : d.name === 'page_daily_follows'
            ? 'Page followers'
            : 'Media views',
        data: d?.values?.map((v: any) => ({
          total: metricTotal(v.value),
          date: dayjs(v.end_time).format('YYYY-MM-DD'),
        })),
      })) || []
    );
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const today = dayjs().format('YYYY-MM-DD');

    // O releaseId guardado depende do tipo: feed -> `{pageid}_{postid}` (tem
    // `insights`); reel/video -> id numerico puro, SEM `insights` (so
    // `video_insights`); story -> id puro sem insights utilizavel. Nao ha tipo
    // guardado, entao a forma do id e o discriminador — pedir `/insights` num
    // video responde "(#100) Tried accessing nonexisting field (insights)".
    if (!postId.includes('_')) {
      return this.videoPostAnalytics(accessToken, postId, today);
    }

    try {
      // Fetch post insights from Facebook Graph API
      const { data } = await (
        await this.analyticsFetch(
          `${META_FACEBOOK_GRAPH_URL}/${postId}/insights?metric=post_total_media_view_unique,post_reactions_by_type_total,post_clicks,post_clicks_by_type&access_token=${accessToken}`
        )
      ).json();

      if (!data || data.length === 0) {
        return [];
      }

      const result: AnalyticsData[] = [];

      for (const metric of data) {
        const value = metric.values?.[0]?.value;
        if (value === undefined) continue;

        let label = '';
        let total = '';

        switch (metric.name) {
          case 'post_total_media_view_unique':
            label = 'Impressions';
            total = String(value);
            break;
          case 'post_clicks':
            label = 'Clicks';
            total = String(value);
            break;
          case 'post_clicks_by_type':
            // This returns an object with click types
            if (typeof value === 'object') {
              const totalClicks = Object.values(
                value as Record<string, number>
              ).reduce((sum: number, v: number) => sum + v, 0);
              label = 'Clicks by Type';
              total = String(totalClicks);
            }
            break;
          case 'post_reactions_by_type_total':
            // This returns an object with reaction types
            if (typeof value === 'object') {
              const totalReactions = Object.values(
                value as Record<string, number>
              ).reduce((sum: number, v: number) => sum + v, 0);
              label = 'Reactions';
              total = String(totalReactions);
            }
            break;
        }

        if (label) {
          result.push({
            label,
            percentageChange: 0,
            data: [{ total, date: today }],
          });
        }
      }

      return result;
    } catch (err) {
      if (err instanceof RefreshToken) {
        throw err;
      }
      console.error('Error fetching Facebook post analytics:', err);
      return [];
    }
  }

  // Videos/reels guardam id puro cujo no nao tem `insights`; as metricas vivem
  // em `/{videoId}/video_insights`. Stories tambem guardam id puro mas nao tem
  // insights por aqui: a chamada volta com `error`/vazio e devolvemos [] em
  // silencio para uma story nao quebrar a pagina de estatisticas.
  // `total_video_impressions` nao e mais aceito pelo Graph (falha a chamada
  // inteira); reels so respondem as metricas `fb_reels_*`/`post_video_*`, por
  // isso os dois conjuntos sao pedidos juntos e o Graph omite o que nao se
  // aplica. Continua no transporte SSRF-safe do fork (analyticsFetch).
  private async videoPostAnalytics(
    accessToken: string,
    videoId: string,
    today: string
  ): Promise<AnalyticsData[]> {
    try {
      const { data, error } = await (
        await this.analyticsFetch(
          `${META_FACEBOOK_GRAPH_URL}/${videoId}/video_insights?metric=total_video_views,total_video_reactions_by_type_total,fb_reels_total_plays,post_video_likes_by_reaction_type,post_video_social_actions&access_token=${accessToken}`
        )
      ).json();

      if (error || !data || data.length === 0) {
        if (error && !/nonexisting field/i.test(error.message || '')) {
          console.warn('Facebook video_insights returned an error:', {
            videoId,
            error,
          });
        }
        return [];
      }

      const sumValues = (value: unknown) =>
        String(
          Object.values(value as Record<string, number>).reduce(
            (sum: number, v: number) => sum + v,
            0
          )
        );

      const result: AnalyticsData[] = [];
      for (const metric of data) {
        const value = metric.values?.[0]?.value;
        if (value === undefined) continue;

        let label = '';
        let total = '';
        switch (metric.name) {
          case 'total_video_views':
            label = 'Views';
            total = String(value);
            break;
          case 'fb_reels_total_plays':
            label = 'Plays';
            total = String(value);
            break;
          case 'total_video_reactions_by_type_total':
          case 'post_video_likes_by_reaction_type':
            if (typeof value === 'object') {
              label = 'Reactions';
              total = sumValues(value);
            }
            break;
          case 'post_video_social_actions':
            if (typeof value === 'object') {
              label = 'Engagement';
              total = sumValues(value);
            }
            break;
        }

        if (label) {
          result.push({
            label,
            percentageChange: 0,
            data: [{ total, date: today }],
          });
        }
      }

      return result;
    } catch (err) {
      if (err instanceof RefreshToken) {
        throw err;
      }
      console.warn('Error fetching Facebook video analytics:', err);
      return [];
    }
  }
}
