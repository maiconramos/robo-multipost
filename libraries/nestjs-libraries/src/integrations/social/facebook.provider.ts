import {
  AnalyticsData,
  AuthTokenDetails,
  ClientInformation,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import dayjs from 'dayjs';
import { BadBody, SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { FacebookDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/facebook.dto';
import { DribbbleDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/dribbble.dto';
import { Integration } from '@prisma/client';

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
    return await fetch(url, { signal: controller.signal });
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
        type: 'refresh-token' | 'bad-body';
        value: string;
      }
    | undefined {
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

    if (body.indexOf('1390008') > -1) {
      return {
        type: 'bad-body' as const,
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
    const clientId = clientInformation?.client_id || process.env.FACEBOOK_APP_ID;
    const state = makeId(6);
    return {
      url:
        'https://www.facebook.com/v20.0/dialog/oauth' +
        `?client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(
          `${process.env.FRONTEND_URL}/integrations/social/facebook`
        )}` +
        `&state=${state}` +
        `&scope=${this.scopes.join(',')}`,
      codeVerifier: makeId(10),
      state,
    };
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

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }, clientInformation?: ClientInformation) {
    const clientId = clientInformation?.client_id || process.env.FACEBOOK_APP_ID;
    const clientSecret = clientInformation?.client_secret || process.env.FACEBOOK_APP_SECRET;

    console.log('[Facebook.authenticate] credentials source:', {
      hasClientInfo: !!clientInformation,
      clientIdPrefix: String(clientId || '').slice(0, 6) + '...',
      hasSecret: !!clientSecret,
      redirectUri: `${process.env.FRONTEND_URL}/integrations/social/facebook${
        params.refresh ? `?refresh=${params.refresh}` : ''
      }`,
    });

    const getAccessToken = await (
      await fetchWithTimeout(
        'https://graph.facebook.com/v20.0/oauth/access_token' +
          `?client_id=${clientId}` +
          `&redirect_uri=${encodeURIComponent(
            `${process.env.FRONTEND_URL}/integrations/social/facebook${
              params.refresh ? `?refresh=${params.refresh}` : ''
            }`
          )}` +
          `&client_secret=${clientSecret}` +
          `&code=${params.code}`
      )
    ).json();

    if (!getAccessToken.access_token) {
      console.error('[Facebook.authenticate] token exchange retornou erro:', getAccessToken);
      throw new Error(
        `Meta token exchange failed: ${JSON.stringify(getAccessToken.error || getAccessToken)}`
      );
    }

    const longLivedResponse = await (
      await fetchWithTimeout(
        'https://graph.facebook.com/v20.0/oauth/access_token' +
          '?grant_type=fb_exchange_token' +
          `&client_id=${clientId}` +
          `&client_secret=${clientSecret}` +
          `&fb_exchange_token=${getAccessToken.access_token}&fields=access_token,expires_in`
      )
    ).json();

    if (!longLivedResponse.access_token) {
      console.error('[Facebook.authenticate] long-lived token exchange retornou erro:', longLivedResponse);
      throw new Error(
        `Meta long-lived token exchange failed: ${JSON.stringify(longLivedResponse.error || longLivedResponse)}`
      );
    }
    const { access_token } = longLivedResponse;

    const permsResponse = await (
      await fetchWithTimeout(
        `https://graph.facebook.com/v20.0/me/permissions?access_token=${access_token}`
      )
    ).json();

    if (!permsResponse.data) {
      console.error('[Facebook.authenticate] /me/permissions retornou erro:', permsResponse);
      throw new Error(
        `Meta /me/permissions failed: ${JSON.stringify(permsResponse.error || permsResponse)}`
      );
    }
    const { data } = permsResponse;

    const permissions = data
      .filter((d: any) => d.status === 'granted')
      .map((p: any) => p.permission);
    this.checkScopes(this.scopes, permissions);

    const { id, name, picture } = await (
      await fetchWithTimeout(
        `https://graph.facebook.com/v20.0/me?fields=id,name,picture&access_token=${access_token}`
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
        `https://graph.facebook.com/v20.0/me/accounts?fields=id,username,name,access_token,picture.type(large)&limit=100&access_token=${accessToken}`
      );
    } catch (err) {
      console.warn('[Facebook.pages] /me/accounts failed:', (err as Error)?.message);
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
          | undefined = `https://graph.facebook.com/v20.0/me/businesses?access_token=${accessToken}`;

        while (bizUrl && !budgetExceeded()) {
          const bizResponse = await (await fetchWithTimeout(bizUrl)).json();
          if (bizResponse.data) {
            for (const business of bizResponse.data) {
              if (budgetExceeded()) break;
              try {
                await fetchPaginated(
                  `https://graph.facebook.com/v20.0/${business.id}/owned_pages?fields=id,username,name,access_token,picture.type(large)&limit=100&access_token=${accessToken}`
                );
              } catch {
                // Continue with other businesses
              }

              if (budgetExceeded()) break;
              try {
                await fetchPaginated(
                  `https://graph.facebook.com/v20.0/${business.id}/client_pages?fields=id,username,name,access_token,picture.type(large)&limit=100&access_token=${accessToken}`
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

    const searchPaginated = async (startUrl: string) => {
      let url: string | undefined = startUrl;
      while (url) {
        const response = await (await fetchWithTimeout(url)).json();
        if (response.data) {
          const page = response.data.find(
            (p: any) => String(p.id) === String(pageId)
          );
          if (page) {
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
      `https://graph.facebook.com/v20.0/me/accounts?fields=${fields}&limit=100&access_token=${accessToken}`
    );
    if (fromAccounts) return fromAccounts;

    // 2. Check Business Manager owned_pages and client_pages.
    // Custo escala com o numero de BMs no Meta App — controle a quantidade
    // de BMs selecionados no painel do App para evitar estourar rate limit.
    try {
      let bizUrl:
        | string
        | undefined = `https://graph.facebook.com/v20.0/me/businesses?access_token=${accessToken}`;

      while (bizUrl) {
        const bizResponse = await (await fetchWithTimeout(bizUrl)).json();
        if (bizResponse.data) {
          for (const business of bizResponse.data) {
            try {
              const fromOwned = await searchPaginated(
                `https://graph.facebook.com/v20.0/${business.id}/owned_pages?fields=${fields}&limit=100&access_token=${accessToken}`
              );
              if (fromOwned) return fromOwned;
            } catch {
              // Continue with other businesses
            }

            try {
              const fromClient = await searchPaginated(
                `https://graph.facebook.com/v20.0/${business.id}/client_pages?fields=${fields}&limit=100&access_token=${accessToken}`
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

    throw new Error('Page not found in your accounts');
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<FacebookDto>[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;

    // Facebook Page Stories: publica via /photo_stories e /video_stories.
    // Story nao tem carrossel — cada midia vira um story separado, igual ao IG.
    if (firstPost?.settings?.post_type === 'story') {
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
          `https://graph.facebook.com/v20.0/${id}/videos?access_token=${accessToken}&fields=id,permalink_url`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              file_url: firstPost?.media?.[0]?.path!,
              description: firstPost.message,
              published: true,
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
                  `https://graph.facebook.com/v20.0/${id}/photos?access_token=${accessToken}`,
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
          `https://graph.facebook.com/v20.0/${id}/feed?access_token=${accessToken}&fields=id,permalink_url`,
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
        `https://graph.facebook.com/v20.0/${id}/photos?access_token=${accessToken}`,
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
        `https://graph.facebook.com/v20.0/${id}/photo_stories?access_token=${accessToken}`,
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
        `https://graph.facebook.com/v20.0/${id}/video_stories?access_token=${accessToken}`,
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

    // Fase 3 — finish: publica o story.
    const { post_id } = await (
      await this.fetch(
        `https://graph.facebook.com/v20.0/${id}/video_stories?access_token=${accessToken}`,
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

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails<FacebookDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const replyToId = lastCommentId || postId;

    const data = await (
      await this.fetch(
        `https://graph.facebook.com/v20.0/${replyToId}/comments?access_token=${accessToken}&fields=id,permalink_url`,
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

    const { data } = await (
      await fetch(
        `https://graph.facebook.com/v20.0/${id}/insights?metric=page_impressions_unique,page_posts_impressions_unique,page_post_engagements,page_daily_follows,page_video_views&access_token=${accessToken}&period=day&since=${since}&until=${until}`
      )
    ).json();

    return (
      data?.map((d: any) => ({
        label:
          d.name === 'page_impressions_unique'
            ? 'Page Impressions'
            : d.name === 'page_post_engagements'
            ? 'Posts Engagement'
            : d.name === 'page_daily_follows'
            ? 'Page followers'
            : d.name === 'page_video_views'
            ? 'Videos views'
            : 'Posts Impressions',
        percentageChange: 5,
        data: d?.values?.map((v: any) => ({
          total: v.value,
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

    try {
      // Fetch post insights from Facebook Graph API
      const { data } = await (
        await this.fetch(
          `https://graph.facebook.com/v20.0/${postId}/insights?metric=post_impressions_unique,post_reactions_by_type_total,post_clicks,post_clicks_by_type&access_token=${accessToken}`
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
          case 'post_impressions_unique':
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
      console.error('Error fetching Facebook post analytics:', err);
      return [];
    }
  }
}
