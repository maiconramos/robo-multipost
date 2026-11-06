import { Logger } from '@nestjs/common';
import { instagramAudioError, isInstagramVideo } from './instagram.audio';
import { EncryptionService } from '../../crypto/encryption.service';
import { decryptIntegrationToken } from '../../crypto/integration-token.helper';
import { ssrfSafeFetch } from '../../dtos/webhooks/ssrf.safe.dispatcher';
import { Tool } from '../tool.decorator';
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
import { timer } from '@gitroom/helpers/utils/timer';
import dayjs from 'dayjs';
import {
  RefreshToken,
  SocialAbstract,
  BadBody,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  safeAudioPreviewUrl,
  safeInstagramAudioPreviewUrl,
} from '@gitroom/helpers/utils/instagram-audio-preview';
import type { InstagramAudioSearchResult } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/instagram.dto';
import { InstagramDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/instagram.dto';
import { Integration } from '@prisma/client';
import {
  META_FACEBOOK_GRAPH_URL,
  META_FACEBOOK_OAUTH_URL,
  metaGraphUrl,
} from '@gitroom/nestjs-libraries/integrations/social/meta-graph.constants';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { InstagramDmButton } from '@gitroom/nestjs-libraries/integrations/social/instagram-dm-button.type';

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

// Traduz o botao interno para o formato de botao da Meta Messenger API.
// Meta limita o title do botao a 20 chars; trimming garante envio valido.
function buildButton(button: InstagramDmButton) {
  if (button.kind === 'postback') {
    return {
      type: 'postback',
      title: button.title.slice(0, 20),
      payload: button.payload,
    };
  }
  return {
    type: 'web_url',
    url: button.url,
    title: button.title.slice(0, 20),
  };
}

@Rules(
  "Instagram should have at least one attachment, if it's a story, it can have only one picture"
)
export class InstagramProvider
  extends SocialAbstract
  implements SocialProvider
{
  private readonly originalAudioImages = new Map<
    string,
    { image: string; expiresAt: number }
  >();

  identifier = 'instagram';
  name = 'Instagram\n(Facebook Business)';
  isBetweenSteps = true;
  // refreshToken() abaixo e stub: Page Access Token nao se renova por
  // refresh_token. Ver noNativeRefresh na interface.
  noNativeRefresh = true;
  toolTip = 'Instagram must be business and connected to a Facebook page';
  scopes = [
    'instagram_basic',
    'pages_show_list',
    'pages_read_engagement',
    'business_management',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'instagram_manage_messages',
  ];
  override maxConcurrentJob = 400;
  editor = 'normal' as const;
  dto = InstagramDto;
  maxLength() {
    return 2200;
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

  public override handleErrors(
    body: string,
    status: number
  ):
    | {
        type: 'refresh-token' | 'bad-body' | 'retry';
        value: string;
      }
    | undefined {
    if (body.indexOf('An unknown error occurred') > -1) {
      return {
        type: 'retry' as const,
        value: 'An unknown error occurred, please try again later',
      };
    }
    if (body.indexOf('2207081') > -1) {
      return {
        type: 'bad-body' as const,
        value: "This account doesn't support Trial Reels",
      };
    }

    if (body.indexOf('REVOKED_ACCESS_TOKEN') > -1) {
      return {
        type: 'refresh-token' as const,
        value:
          'Something is wrong with your connected user, please re-authenticate',
      };
    }

    if (
      body.toLowerCase().indexOf('the user is not an instagram business') > -1
    ) {
      return {
        type: 'refresh-token' as const,
        value:
          'Your Instagram account is not a business account, please convert it to a business account',
      };
    }

    if (body.toLowerCase().indexOf('session has been invalidated') > -1) {
      return {
        type: 'refresh-token' as const,
        value:
          'You session has been invalidated, this can usually happen from frequent posting, please re-authenticate, and wait 1-2 days before posting again',
      };
    }

    // Checkpoint da Meta: ver metaCheckpointError (o Instagram Login sobrescreve).
    if (
      body.indexOf('You cannot access the app till you log in to') > -1 ||
      body.indexOf('Session key is malformed') > -1
    ) {
      return this.metaCheckpointError();
    }

    if (body.indexOf('2207050') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Instagram user is restricted',
      };
    }

    // Media download/upload errors
    if (body.indexOf('2207003') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Timeout downloading media, please try again',
      };
    }

    if (body.indexOf('2207020') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Media expired, please upload again',
      };
    }

    if (body.indexOf('2207032') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Failed to create media, please try again',
      };
    }

    if (body.indexOf('2207053') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          "Instagram failed to upload the video. If it exceeds Instagram's limits (300MB, 1920px width, 25Mbps bitrate), export a smaller version and try again",
      };
    }

    // Falha transitoria ao buscar a midia na origem: vale repetir.
    if (body.indexOf('2207052') > -1) {
      return {
        type: 'retry' as const,
        value: 'Media fetch failed, please try again',
      };
    }

    if (body.indexOf('2207085') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram could not process the video, please check the video format, duration and resolution and try again',
      };
    }

    if (body.indexOf('2207082') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram could not process this video. If you attached audio to a video that has no sound track, set the original video volume to 0 and try again',
      };
    }

    if (body.indexOf('2207078') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram Trial Reel publish limit reached for this account, please try again later or publish the post as a regular Reel',
      };
    }

    if (body.indexOf('2207018') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'One of the collaborators could not be tagged, please check the username is correct, the account is public, and that it allows collaborator invites',
      };
    }

    if (body.indexOf('1772107') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram did not add the comment, the post itself was published. Please try again with different comment text',
      };
    }

    if (body.indexOf('2207057') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Invalid thumbnail offset for video',
      };
    }

    if (body.indexOf('2207026') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Unsupported video format',
      };
    }

    if (body.indexOf('2207023') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Unknown media type',
      };
    }

    if (body.indexOf('2207006') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Media not found, please upload again',
      };
    }

    if (body.indexOf('2207008') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Media builder expired, please try again',
      };
    }

    // Content validation errors
    if (body.indexOf('2207028') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Carousel validation failed',
      };
    }

    if (body.indexOf('2207010') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Caption is too long',
      };
    }

    // Product tagging errors
    if (body.indexOf('2207035') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Product tag positions not supported for videos',
      };
    }

    if (body.indexOf('2207036') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Product tag positions required for photos',
      };
    }

    if (body.indexOf('2207037') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Product tag validation failed',
      };
    }

    if (body.indexOf('2207040') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Too many product tags',
      };
    }

    // Image format/size errors
    if (body.indexOf('2207004') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Image is too large',
      };
    }

    if (body.indexOf('2207005') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Unsupported image format',
      };
    }

    if (body.indexOf('2207009') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Aspect ratio not supported, must be between 4:5 to 1.91:1',
      };
    }

    if (body.indexOf('Page request limit reached') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Page posting for today is limited, please try again tomorrow',
      };
    }

    if (body.indexOf('2207042') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'You have reached the maximum of 25 posts per day, allowed for your account',
      };
    }

    if (body.indexOf('Not enough permissions to post') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Not enough permissions to post',
      };
    }

    if (body.indexOf('36003') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Aspect ratio not supported, must be between 4:5 to 1.91:1',
      };
    }

    const isInvalidMetaUserSession =
      /(?:"code"\s*:\s*190|\b190\b)/.test(body) &&
      /(?:"error_subcode"\s*:\s*(?:460|464)|\b190\s*\/\s*(?:460|464)\b)/.test(
        body
      );
    if (isInvalidMetaUserSession) {
      return {
        type: 'refresh-token' as const,
        value:
          'The connected Facebook user session is no longer valid, please reconnect the account',
      };
    }

    if (body.indexOf('(#200)') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Facebook rejected the post due to missing permissions. Make sure your Facebook account has full content access to the Page linked to this Instagram account, then reconnect the channel.',
      };
    }

    if (body.indexOf('190,') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'The account is missing some permissions to perform this action, please re-add the account and allow all permissions',
      };
    }

    if (body.indexOf('36001') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Invalid Instagram image resolution max: 1920x1080px',
      };
    }

    if (body.indexOf('2207051') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Instagram blocked your request',
      };
    }

    if (body.indexOf('2207001') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram detected that your post is spam, please try again with different content',
      };
    }

    if (body.indexOf('2207027') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Unknown error, please try again later or contact support',
      };
    }

    if (body.indexOf('param collaborators is not allowed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Collaborators are not allowed for carousel',
      };
    }

    return undefined;
  }

  async reConnect(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    const findPage = (await this.pages(accessToken)).find(
      (p) => p.id === requiredId
    );

    const information = await this.fetchPageInformation(accessToken, {
      id: requiredId,
      pageId: findPage?.pageId!,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
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
          `${process.env.FRONTEND_URL}/integrations/social/instagram`
        )}` +
        `&state=${state}` +
        `&scope=${encodeURIComponent(this.scopes.join(','))}`,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  async authenticate(
    params: {
      code: string;
      codeVerifier: string;
      refresh: string;
    },
    clientInformation?: ClientInformation
  ) {
    const clientId =
      clientInformation?.client_id || process.env.FACEBOOK_APP_ID;
    const clientSecret =
      clientInformation?.client_secret || process.env.FACEBOOK_APP_SECRET;

    // Log de quais credenciais estao sendo usadas (sem expor secret).
    // Ajuda a diagnosticar falhas de token-exchange por client_id divergente
    // entre Settings > Credentials (DB) e o App registrado no Meta.
    console.log('[Instagram.authenticate] credentials source:', {
      hasClientInfo: !!clientInformation,
      clientIdPrefix: String(clientId || '').slice(0, 6) + '...',
      hasSecret: !!clientSecret,
      redirectUri: `${process.env.FRONTEND_URL}/integrations/social/instagram${
        params.refresh ? `?refresh=${params.refresh}` : ''
      }`,
    });

    const getAccessToken = await (
      await fetchWithTimeout(
        `${META_FACEBOOK_GRAPH_URL}/oauth/access_token` +
          `?client_id=${clientId}` +
          `&redirect_uri=${encodeURIComponent(
            `${process.env.FRONTEND_URL}/integrations/social/instagram${
              params.refresh ? `?refresh=${params.refresh}` : ''
            }`
          )}` +
          `&client_secret=${clientSecret}` +
          `&code=${params.code}`
      )
    ).json();

    // Loga a resposta crua do token-exchange. Se vier {error: {...}}, conseguimos
    // ver o motivo exato (rate limit, code expirado, redirect_uri mismatch).
    if (!getAccessToken.access_token) {
      console.error(
        '[Instagram.authenticate] token exchange retornou erro:',
        getAccessToken
      );
      throw new Error(
        `Meta token exchange failed: ${JSON.stringify(
          getAccessToken.error || getAccessToken
        )}`
      );
    }

    const longLivedResponse = await (
      await fetchWithTimeout(
        `${META_FACEBOOK_GRAPH_URL}/oauth/access_token` +
          '?grant_type=fb_exchange_token' +
          `&client_id=${clientId}` +
          `&client_secret=${clientSecret}` +
          `&fb_exchange_token=${getAccessToken.access_token}`
      )
    ).json();

    if (!longLivedResponse.access_token) {
      console.error(
        '[Instagram.authenticate] long-lived token exchange retornou erro:',
        longLivedResponse
      );
      throw new Error(
        `Meta long-lived token exchange failed: ${JSON.stringify(
          longLivedResponse.error || longLivedResponse
        )}`
      );
    }
    const { access_token, expires_in, ...all } = longLivedResponse;

    const permsResponse = await (
      await fetchWithTimeout(
        `${META_FACEBOOK_GRAPH_URL}/me/permissions?access_token=${access_token}`
      )
    ).json();

    if (!permsResponse.data) {
      console.error(
        '[Instagram.authenticate] /me/permissions retornou erro:',
        permsResponse
      );
      throw new Error(
        `Meta /me/permissions failed: ${JSON.stringify(
          permsResponse.error || permsResponse
        )}`
      );
    }
    const { data } = permsResponse;

    const permissions = data
      .filter((d: any) => d.status === 'granted')
      .map((p: any) => p.permission);
    this.checkScopes(this.scopes, permissions);

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
    const seenPageIds = new Set<string>();
    const allFacebookPages: any[] = [];

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
            if (!seenPageIds.has(page.id)) {
              seenPageIds.add(page.id);
              allFacebookPages.push(page);
            }
          }
        }
        nextUrl = response.paging?.next;
      }
    };

    // Fetch pages the user explicitly shared during the OAuth dialog
    try {
      await fetchPaginated(
        `${META_FACEBOOK_GRAPH_URL}/me/accounts?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${accessToken}`
      );
    } catch (err) {
      console.warn(
        '[Instagram.pages] /me/accounts failed:',
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
                  `${META_FACEBOOK_GRAPH_URL}/${business.id}/owned_pages?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${accessToken}`
                );
              } catch {
                // Continue with other businesses
              }

              if (budgetExceeded()) break;
              try {
                await fetchPaginated(
                  `${META_FACEBOOK_GRAPH_URL}/${business.id}/client_pages?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${accessToken}`
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
        `[Instagram.pages] budget de 90s estourado — retornando ${allFacebookPages.length} paginas coletadas ate agora`
      );
    }

    const onlyConnectedAccounts = await Promise.all(
      allFacebookPages
        .filter((f: any) => f.instagram_business_account)
        .map(async (p: any) => {
          try {
            return {
              pageId: p.id,
              ...(await (
                await fetchWithTimeout(
                  `${META_FACEBOOK_GRAPH_URL}/${p.instagram_business_account.id}?fields=name,profile_picture_url&access_token=${accessToken}`
                )
              ).json()),
              id: p.instagram_business_account.id,
            };
          } catch (err) {
            // Pagina individual com timeout: ignora ao inves de quebrar tudo
            return null;
          }
        })
    );

    return onlyConnectedAccounts
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p: any) => ({
        pageId: p.pageId,
        id: p.id,
        name: p.name,
        picture: { data: { url: p.profile_picture_url } },
      }));
  }

  async fetchPageInformation(
    accessToken: string,
    data: { pageId: string; id: string }
  ) {
    const { access_token, ...all } = await (
      await fetch(
        `${META_FACEBOOK_GRAPH_URL}/${data.pageId}?fields=access_token,name,picture.type(large)&access_token=${accessToken}`
      )
    ).json();

    const { id, name, profile_picture_url, username } = await (
      await fetch(
        `${META_FACEBOOK_GRAPH_URL}/${data.id}?fields=username,name,profile_picture_url&access_token=${accessToken}`
      )
    ).json();

    return {
      id,
      name,
      picture: profile_picture_url,
      access_token,
      username,
    };
  }

  // Instagram rejeita handle com @ inicial (error_subcode 2207018) e o campo
  // de colaboradores guarda o que o usuario digitou.
  private stripHandle(handle: string) {
    return handle.replace(/^@+/, '');
  }

  // Checkpoint da Meta: o token continua valido, mas todo post falha ate o
  // usuario entrar no Instagram e cumprir as instrucoes. No upstream vira
  // `disconnect`; aqui passa pelo fluxo de refresh do fork, que tenta o
  // self-heal por Usuario do Sistema e, sem ele, desconecta com o aviso.
  // O Instagram Login (instagram.standalone.provider.ts) sobrescreve para
  // `bad-body`: nao tem self-heal e o refresh nao destrava a conta.
  protected metaCheckpointError(): {
    type: 'refresh-token' | 'bad-body';
    value: string;
  } {
    return {
      type: 'refresh-token',
      value:
        'Instagram requires you to log in at instagram.com and follow its instructions before posting can resume. After that, please reconnect this channel.',
    };
  }

  // Checagem unica do status de um container de midia. Em ERROR/EXPIRED o
  // detalhe (`status`) passa por handleErrors: codigo curado vira texto
  // acionavel; checkpoint da Meta vira RefreshToken (self-heal por Usuario do
  // Sistema ou desconexao com aviso); sem mapeamento, vale o texto do
  // Instagram ou a mensagem padrao. Antes, ERROR seguia para media_publish e
  // falhava com "Unknown Error".
  private async igContainerStatus(
    containerId: string,
    accessToken: string,
    type: string
  ): Promise<string> {
    const { status_code, status } = await (
      await this.fetch(
        `${metaGraphUrl(
          type
        )}/${containerId}?access_token=${accessToken}&fields=status_code,status`,
        undefined,
        '',
        0,
        true
      )
    ).json();

    if (status_code === 'ERROR' || status_code === 'EXPIRED') {
      const handled = this.handleErrors(status || '', 200);
      const payload = JSON.stringify({ status_code, status });
      if (handled?.type === 'refresh-token') {
        throw new RefreshToken(this.identifier, payload, '{}', handled.value);
      }
      throw new BadBody(
        this.identifier,
        payload,
        '{}',
        handled?.value ||
          (status && status !== status_code ? status : '') ||
          'Instagram could not process the media'
      );
    }

    return status_code;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<InstagramDto>[],
    integration: Integration,
    type = 'graph.facebook.com'
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const audioError = instagramAudioError(
      firstPost?.settings,
      firstPost?.media,
      type === 'graph.facebook.com'
    );
    if (audioError) throw new BadBody(this.identifier, '{}', '{}', audioError);
    if (firstPost.media?.some((media) => (media.alt?.length || 0) > 1000)) {
      throw new BadBody(
        this.identifier,
        '{}',
        Buffer.from('{}'),
        'Instagram alt text can be up to 1000 characters'
      );
    }
    console.log('in progress', id);
    const isStory = firstPost.settings.post_type === 'story';
    const isTrialReel = this.assetBoolean(firstPost.settings.is_trial_reel);
    // url-encoded porque o JSON leva aspas; em carrossel vai no container.
    const collaborators =
      firstPost?.settings?.collaborators?.length && !isStory
        ? `&collaborators=${encodeURIComponent(
            JSON.stringify(
              firstPost.settings.collaborators.map((p) =>
                this.stripHandle(p.label)
              )
            )
          )}`
        : ``;
    const medias = await Promise.all(
      firstPost?.media?.map(async (m) => {
        const caption =
          firstPost.media?.length === 1
            ? `&caption=${encodeURIComponent(firstPost.message)}`
            : ``;
        const altText =
          m.alt && !isStory && !isInstagramVideo(m.path)
            ? `&alt_text=${encodeURIComponent(m.alt)}`
            : '';
        const isCarousel =
          (firstPost?.media?.length || 0) > 1 && !isStory
            ? `&is_carousel_item=true`
            : ``;
        const isReel =
          isInstagramVideo(m.path) &&
          firstPost?.media?.length === 1 &&
          !isStory;

        const mediaType = isInstagramVideo(m.path)
          ? firstPost?.media?.length === 1
            ? isStory
              ? `video_url=${m.path}&media_type=STORIES`
              : `video_url=${m.path}&media_type=REELS&thumb_offset=${
                  m?.thumbnailTimestamp || 0
                }`
            : isStory
            ? `video_url=${m.path}&media_type=STORIES`
            : `video_url=${m.path}&media_type=VIDEO&thumb_offset=${
                m?.thumbnailTimestamp || 0
              }`
          : isStory
          ? `image_url=${m.path}&media_type=STORIES`
          : `image_url=${m.path}`;

        const trialParams = isTrialReel
          ? `&trial_params=${encodeURIComponent(
              JSON.stringify({
                graduation_strategy:
                  firstPost.settings.graduation_strategy || 'MANUAL',
              })
            )}`
          : ``;

        // Collaborators nao sao aceitos nos itens de carrossel: so no post
        // unico vao no proprio item.
        const itemCollaborators =
          firstPost?.media?.length === 1 ? collaborators : ``;

        // Capa do reel: a escolhida nas settings ou, na falta, a thumbnail da
        // propria midia (biblioteca).
        const coverPath = firstPost?.settings?.cover?.path || m?.thumbnail;
        const coverUrl =
          isReel && coverPath
            ? `&cover_url=${encodeURIComponent(coverPath)}`
            : ``;

        const audioConfiguration = firstPost.settings.audio?.id
          ? '&audio_configuration=' +
            encodeURIComponent(
              JSON.stringify({
                audio_id: firstPost.settings.audio.id,
                ...(firstPost.settings.audio.audio_volume !== undefined
                  ? { audio_volume: firstPost.settings.audio.audio_volume }
                  : {}),
                ...(firstPost.settings.audio.video_volume !== undefined
                  ? { video_volume: firstPost.settings.audio.video_volume }
                  : {}),
              })
            )
          : '';
        const { id: photoId } = await (
          await this.fetch(
            `${metaGraphUrl(
              type
            )}/${id}/media?${mediaType}${altText}${isCarousel}${itemCollaborators}${trialParams}${coverUrl}${audioConfiguration}&access_token=${accessToken}${caption}`,
            {
              method: 'POST',
            }
          )
        ).json();
        console.log('in progress2', id);

        let status = 'IN_PROGRESS';
        while (status === 'IN_PROGRESS') {
          status = await this.igContainerStatus(photoId, accessToken, type);
          // cadencia original do fork (tambem apos FINISHED): colchao contra
          // "media not ready" (2207027) no media_publish
          await timer(30000);
        }
        console.log('in progress3', id);

        return photoId;
      }) || []
    );

    if (isStory && medias.length > 1) {
      // Stories don't support carousels - publish each media as a separate story
      let lastMediaId = '';
      let lastPermalink = '';
      for (const mediaCreationId of medias) {
        const { id: mediaId } = await (
          await this.fetch(
            `${metaGraphUrl(
              type
            )}/${id}/media_publish?creation_id=${mediaCreationId}&access_token=${accessToken}&field=id`,
            {
              method: 'POST',
            }
          )
        ).json();
        lastMediaId = mediaId;

        const { permalink } = await (
          await this.fetch(
            `${metaGraphUrl(
              type
            )}/${mediaId}?fields=permalink&access_token=${accessToken}`
          )
        ).json();
        lastPermalink = permalink;
      }

      return [
        {
          id: firstPost.id,
          postId: lastMediaId,
          releaseURL: lastPermalink,
          status: 'success',
        },
      ];
    } else if (medias.length === 1) {
      const { id: mediaId } = await (
        await this.fetch(
          `${metaGraphUrl(type)}/${id}/media_publish?creation_id=${
            medias[0]
          }&access_token=${accessToken}&field=id`,
          {
            method: 'POST',
          }
        )
      ).json();

      const { permalink } = await (
        await this.fetch(
          `${metaGraphUrl(
            type
          )}/${mediaId}?fields=permalink&access_token=${accessToken}`
        )
      ).json();

      return [
        {
          id: firstPost.id,
          postId: mediaId,
          releaseURL: permalink,
          status: 'success',
        },
      ];
    } else {
      const { id: containerId, ...all3 } = await (
        await this.fetch(
          `${metaGraphUrl(type)}/${id}/media?caption=${encodeURIComponent(
            firstPost?.message
          )}&media_type=CAROUSEL&children=${encodeURIComponent(
            medias.join(',')
          )}${collaborators}&access_token=${accessToken}`,
          {
            method: 'POST',
          }
        )
      ).json();

      let status = 'IN_PROGRESS';
      while (status === 'IN_PROGRESS') {
        status = await this.igContainerStatus(containerId, accessToken, type);
        // mesma cadencia do loop dos itens: 30 s apos cada checagem
        await timer(30000);
      }

      const { id: mediaId, ...all4 } = await (
        await this.fetch(
          `${metaGraphUrl(
            type
          )}/${id}/media_publish?creation_id=${containerId}&access_token=${accessToken}&field=id`,
          {
            method: 'POST',
          }
        )
      ).json();

      const { permalink } = await (
        await this.fetch(
          `${metaGraphUrl(
            type
          )}/${mediaId}?fields=permalink&access_token=${accessToken}`
        )
      ).json();

      return [
        {
          id: firstPost.id,
          postId: mediaId,
          releaseURL: permalink,
          status: 'success',
        },
      ];
    }
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails<InstagramDto>[],
    integration: Integration,
    type = 'graph.facebook.com'
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;

    const { id: commentId } = await (
      await this.fetch(
        `${metaGraphUrl(type)}/${postId}/comments?message=${encodeURIComponent(
          commentPost.message
        )}&access_token=${accessToken}`,
        {
          method: 'POST',
        }
      )
    ).json();

    // Get the permalink from the parent post
    const { permalink } = await (
      await this.fetch(
        `${metaGraphUrl(
          type
        )}/${postId}?fields=permalink&access_token=${accessToken}`
      )
    ).json();

    return [
      {
        id: commentPost.id,
        postId: commentId,
        releaseURL: permalink,
        status: 'success',
      },
    ];
  }

  private setTitle(name: string) {
    switch (name) {
      case 'likes': {
        return 'Likes';
      }

      case 'followers': {
        return 'Followers';
      }

      case 'reach': {
        return 'Reach';
      }

      case 'follower_count': {
        return 'Follower Count';
      }

      case 'views': {
        return 'Views';
      }

      case 'comments': {
        return 'Comments';
      }

      case 'shares': {
        return 'Shares';
      }

      case 'saves': {
        return 'Saves';
      }

      case 'replies': {
        return 'Replies';
      }
    }

    return '';
  }

  private readonly analyticsLogger = new Logger(InstagramProvider.name);

  private async readAccountInsights(
    url: string,
    phase: 'daily' | 'totals',
    days: number
  ): Promise<any[]> {
    // Keep RefreshToken outside the parse guard so existing recovery still runs.
    const response = await this.analyticsFetch(url);
    let body: {
      data?: any[];
      error?: { code?: unknown; error_subcode?: unknown };
    };
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (response.status >= 400 || body?.error || !Array.isArray(body?.data)) {
      this.analyticsLogger.warn({
        event: 'instagram-analytics-unavailable',
        phase,
        days: Number.isFinite(days) ? days : undefined,
        status: Number.isInteger(response.status) ? response.status : undefined,
        code:
          typeof body?.error?.code === 'number' ? body.error.code : undefined,
        subcode:
          typeof body?.error?.error_subcode === 'number'
            ? body.error.error_subcode
            : undefined,
      });
      // Do not return [] here: the service caches successful provider results.
      throw new Error('INSTAGRAM_ANALYTICS_UNAVAILABLE');
    }
    return body.data;
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number,
    integration?: Integration,
    type = 'graph.facebook.com'
  ): Promise<AnalyticsData[]> {
    const until = dayjs().unix();
    const since = until - date * 86400;

    const data = await this.readAccountInsights(
      `${metaGraphUrl(
        type
      )}/${id}/insights?metric=follower_count,reach&access_token=${accessToken}&period=day&since=${since}&until=${until}`,
      'daily',
      date
    );
    const data2 = await this.readAccountInsights(
      `${metaGraphUrl(
        type
      )}/${id}/insights?metric_type=total_value&metric=likes,views,comments,shares,saves,replies&access_token=${accessToken}&period=day&since=${since}&until=${until}`,
      'totals',
      date
    );
    const analytics = [];

    analytics.push(
      ...(data?.map((d: any) => ({
        label: this.setTitle(d.name),
        data: d.values.map((v: any) => ({
          total: v.value,
          date: dayjs(v.end_time).format('YYYY-MM-DD'),
        })),
      })) || [])
    );

    analytics.push(
      ...data2.map((d: any) => ({
        label: this.setTitle(d.name),
        data: [
          {
            total: d.total_value.value,
            date: dayjs().format('YYYY-MM-DD'),
          },
        ],
      }))
    );

    return analytics;
  }

  music(accessToken: string, data: { q: string }) {
    return this.fetch(
      `${META_FACEBOOK_GRAPH_URL}/music/search?q=${encodeURIComponent(
        data.q
      )}&access_token=${accessToken}`
    );
  }

  @Tool({
    description:
      'Search music or original sounds to attach to an Instagram Reel using Facebook Login. Empty query returns trending audio.',
    dataSchema: [
      {
        key: 'q',
        type: 'string',
        description: 'Search query, empty for trending',
      },
      { key: 'type', type: 'string', description: 'music or original_sound' },
    ],
  })
  async audioSearch(
    _pageToken: string,
    data: { q?: string; type?: 'music' | 'original_sound' },
    _internalId?: string,
    integration?: Integration
  ) {
    const unavailable = () =>
      new BadBody(
        this.identifier,
        '{}',
        '{}',
        'Reconecte o Instagram pelo Facebook Login para pesquisar áudio. A publicação do canal não foi desconectada.'
      );
    if (
      integration?.providerIdentifier !== 'instagram' ||
      !integration.refreshToken
    )
      throw unavailable();
    let userToken: string;
    try {
      userToken = decryptIntegrationToken(
        new EncryptionService(),
        integration.refreshToken
      );
    } catch {
      throw unavailable();
    }
    if (!userToken || userToken === _pageToken) throw unavailable();
    if (
      (data?.q !== undefined &&
        (typeof data.q !== 'string' || data.q.length > 200)) ||
      (data?.type !== undefined &&
        !['music', 'original_sound'].includes(data.type))
    )
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'Busca de áudio inválida.'
      );
    const query = new URLSearchParams({
      audio_type: data?.type || 'music',
      user_id: integration.internalId || _internalId || '',
    });
    if (data?.q) query.set('search_query', data.q);
    let response: Response;
    try {
      response = await ssrfSafeFetch(
        `${META_FACEBOOK_GRAPH_URL}/ig_audio?${query}`,
        {
          headers: { Authorization: `Bearer ${userToken}` },
          signal: AbortSignal.timeout(20_000),
        }
      );
    } catch {
      throw unavailable();
    }
    let body: any;
    try {
      body = await response.json();
    } catch {
      throw unavailable();
    }
    if (!response.ok || body?.error || !Array.isArray(body?.audio))
      throw unavailable();
    const results: InstagramAudioSearchResult[] = body.audio
      .map(
        (audio: any): InstagramAudioSearchResult => ({
          id: String(audio.audio_id || ''),
          title: String(audio.title || ''),
          artist: String(audio.display_artist || audio.ig_username || ''),
          image:
            safeAudioPreviewUrl(audio.cover_artwork_thumbnail_uri) ||
            safeAudioPreviewUrl(audio.cover_artwork_thumbnail_url) ||
            safeAudioPreviewUrl(audio.profile_picture_url) ||
            '',
          duration: Number(audio.duration_in_ms) || 0,
          previewUrl: safeAudioPreviewUrl(audio.download_url) || '',
          platformPreviewUrl:
            safeInstagramAudioPreviewUrl(
              audio.on_platform_audio_preview_link
            ) || '',
        })
      )
      .filter((a: InstagramAudioSearchResult) => /^\d+$/.test(a.id));
    if (data?.type === 'original_sound') {
      await this.enrichOriginalAudioImages(results, userToken, integration);
    }
    return results;
  }

  // Search can omit the original creator image even when the audio detail has it.
  // This optional enrichment never changes channel authorization or search success.
  private async enrichOriginalAudioImages(
    results: InstagramAudioSearchResult[],
    userToken: string,
    integration: Integration
  ): Promise<void> {
    const groups = new Map<string, InstagramAudioSearchResult[]>();
    for (const audio of results) {
      if (audio.image) continue;
      const rows = groups.get(audio.id) || [];
      rows.push(audio);
      groups.set(audio.id, rows);
    }
    const pending: {
      id: string;
      key?: string;
      rows: InstagramAudioSearchResult[];
    }[] = [];
    for (const [id, rows] of groups) {
      const key = integration.id
        ? `${integration.id}:${integration.internalId}:${id}`
        : undefined;
      const cached = key ? this.originalAudioImages.get(key) : undefined;
      if (cached && cached.expiresAt > Date.now()) {
        for (const row of rows) row.image = cached.image;
        continue;
      }
      if (key) this.originalAudioImages.delete(key);
      if (pending.length < 10) pending.push({ id, key, rows });
    }
    if (!pending.length) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      AbortSignal.timeout(5000),
      controller.signal,
    ]);
    let next = 0;
    const worker = async () => {
      while (!signal.aborted && next < pending.length) {
        const item = pending[next++];
        try {
          const query = new URLSearchParams({
            user_id: integration.internalId,
          });
          const response = await ssrfSafeFetch(
            `${META_FACEBOOK_GRAPH_URL}/${item.id}?${query}`,
            {
              headers: { Authorization: `Bearer ${userToken}` },
              signal,
            }
          );
          if (response.status === 429) {
            controller.abort();
            return;
          }
          if (!response.ok) continue;
          const detail = await response.json();
          if (
            signal.aborted ||
            detail?.error ||
            String(detail?.audio_id) !== item.id
          )
            continue;
          const image = safeAudioPreviewUrl(detail.profile_picture_url) || '';
          if (detail.profile_picture_url && !image) continue;
          for (const row of item.rows) row.image = image;
          if (item.key) {
            if (this.originalAudioImages.size >= 200) {
              this.originalAudioImages.delete(
                this.originalAudioImages.keys().next().value!
              );
            }
            this.originalAudioImages.set(item.key, {
              image,
              expiresAt: Date.now() + (image ? 10 * 60_000 : 60_000),
            });
          }
        } catch {
          // Missing avatars, timeouts and provider failures keep the base list usable.
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(3, pending.length) }, worker)
    );
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number,
    integration?: Integration,
    type = 'graph.facebook.com'
  ): Promise<AnalyticsData[]> {
    const today = dayjs().format('YYYY-MM-DD');

    try {
      // Fetch media insights from Instagram Graph API
      const { data } = await (
        await this.analyticsFetch(
          `${metaGraphUrl(
            type
          )}/${postId}/insights?metric=views,reach,saved,likes,comments,shares&access_token=${accessToken}`
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

        switch (metric.name) {
          case 'views':
            label = 'Views';
            break;
          case 'reach':
            label = 'Reach';
            break;
          case 'engagement':
            label = 'Engagement';
            break;
          case 'saved':
            label = 'Saves';
            break;
          case 'likes':
            label = 'Likes';
            break;
          case 'comments':
            label = 'Comments';
            break;
          case 'shares':
            label = 'Shares';
            break;
        }

        if (label) {
          result.push({
            label,
            percentageChange: 0,
            data: [{ total: String(value), date: today }],
          });
        }
      }

      return result;
    } catch (err) {
      if (err instanceof RefreshToken) {
        throw err;
      }
      console.error('Error fetching Instagram post analytics:', err);
      return [];
    }
  }

  async sendDM(
    accessToken: string,
    igScopedUserId: string,
    message: string,
    type = 'graph.facebook.com'
  ): Promise<{ recipientId: string; messageId: string }> {
    // Instagram Login API (graph.instagram.com + IG User Token) uses /me/messages
    // directly — the IG User Token already scopes to the IG business account,
    // no Page ID resolution needed. Facebook Login (graph.facebook.com + Page
    // Access Token) needs the Page ID from /me.
    const url =
      type === 'graph.instagram.com'
        ? `${metaGraphUrl(type)}/me/messages?access_token=${accessToken}`
        : await this.resolvePageMessagesUrl(accessToken, type);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: igScopedUserId },
        message: { text: message },
      }),
    });

    const body = await response.json();
    if (!response.ok || body.error) {
      const errMsg =
        body?.error?.message || JSON.stringify(body?.error || body);
      throw new Error(`Instagram DM failed (${response.status}): ${errMsg}`);
    }

    return {
      recipientId: body.recipient_id,
      messageId: body.message_id,
    };
  }

  private async resolvePageMessagesUrl(
    accessToken: string,
    type = 'graph.facebook.com'
  ): Promise<string> {
    const meRes = await fetch(
      `${metaGraphUrl(type)}/me?access_token=${accessToken}`
    );
    const meBody = await meRes.json();
    if (!meRes.ok || meBody.error) {
      throw new Error(
        `Failed to resolve Facebook Page ID: ${
          meBody?.error?.message || JSON.stringify(meBody)
        }`
      );
    }
    return `${metaGraphUrl(type)}/${
      meBody.id
    }/messages?access_token=${accessToken}`;
  }

  // Send a private reply (DM) to someone who commented on your post.
  // This is the Meta "private_replies" API — the ONLY supported way to DM
  // a commenter without them having messaged you first. Valid for 7 days
  // after the comment was created.
  // Ref: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies
  async sendPrivateReply(
    accessToken: string,
    _igAccountId: string,
    commentId: string,
    message: string,
    button?: InstagramDmButton,
    type = 'graph.facebook.com'
  ): Promise<{ recipientId: string; messageId: string }> {
    // Instagram Login API (graph.instagram.com + IG User Token) hits /me/messages.
    // Facebook Login (graph.facebook.com + Page Access Token) needs the Page ID.
    // Must be sent within 7 days of the comment in both flows.
    const url =
      type === 'graph.instagram.com'
        ? `${metaGraphUrl(type)}/me/messages?access_token=${accessToken}`
        : await this.resolvePageMessagesUrl(accessToken, type);

    // When a CTA is provided, send as a button template (same schema as
    // regular DMs). Text <= 640 chars, title <= 20 chars.
    const messagePayload = button
      ? {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: message.slice(0, 640),
              buttons: [buildButton(button)],
            },
          },
        }
      : { text: message };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: messagePayload,
      }),
    });

    const body = await response.json();
    if (!response.ok || body.error) {
      const errMsg =
        body?.error?.message || JSON.stringify(body?.error || body);
      throw new Error(
        `Instagram private reply failed (${response.status}): ${errMsg}`
      );
    }

    return {
      recipientId: body.recipient_id,
      messageId: body.message_id,
    };
  }

  // Reply to an existing IG comment (threaded reply).
  // Ref: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies
  async replyToComment(
    accessToken: string,
    commentId: string,
    message: string,
    type = 'graph.facebook.com'
  ): Promise<{ id: string }> {
    // Both flows support threaded replies at /{comment-id}/replies — route
    // depends on which token the integration holds (Page Access vs IG User).
    const url = `${metaGraphUrl(
      type
    )}/${commentId}/replies?access_token=${accessToken}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const body = await response.json();
    if (!response.ok || body.error) {
      const err = body?.error || {};
      const parts = [
        err.message ? `msg=${err.message}` : null,
        err.code != null ? `code=${err.code}` : null,
        err.error_subcode != null ? `subcode=${err.error_subcode}` : null,
        err.type ? `type=${err.type}` : null,
        err.fbtrace_id ? `trace=${err.fbtrace_id}` : null,
      ].filter(Boolean);
      const detail = parts.length ? parts.join(' ') : JSON.stringify(body);
      throw new Error(
        `Instagram comment reply failed (${response.status}) [host=${type} commentId=${commentId}]: ${detail}`
      );
    }
    return { id: body.id };
  }

  async subscribeToWebhooks(
    igAccountId: string,
    pageAccessToken: string,
    type = 'graph.facebook.com'
  ): Promise<boolean> {
    // For Instagram webhooks (comments, messages), subscribe the IG Business
    // account directly with instagram-specific fields.
    const response = await this.fetch(
      `${metaGraphUrl(
        type
      )}/${igAccountId}/subscribed_apps?subscribed_fields=comments,messages&access_token=${pageAccessToken}`,
      { method: 'POST' }
    );

    const body = await response.json();
    if (body.error) {
      throw new Error(
        `Webhook subscription failed: ${
          body.error.message || JSON.stringify(body.error)
        }`
      );
    }

    return body.success === true;
  }

  async checkWebhookSubscription(
    igAccountId: string,
    pageAccessToken: string,
    type = 'graph.facebook.com'
  ): Promise<{ subscribed: boolean; fields: string[] }> {
    // Non-destructive check: reads the current subscription state for this
    // IG account and returns the subscribed fields. In the Meta Use Cases
    // model the subscription is configured in the Dashboard — this endpoint
    // reflects that state.
    const response = await this.fetch(
      `${metaGraphUrl(
        type
      )}/${igAccountId}/subscribed_apps?access_token=${pageAccessToken}`
    );
    const body = await response.json();
    if (body.error) {
      throw new Error(
        `Webhook check failed: ${
          body.error.message || JSON.stringify(body.error)
        }`
      );
    }
    const apps: Array<{ subscribed_fields?: string[] }> = Array.isArray(
      body.data
    )
      ? body.data
      : [];
    const fields = apps.flatMap((app) => app.subscribed_fields || []);
    return { subscribed: apps.length > 0, fields };
  }

  async getPageIdForIgAccount(
    pageAccessToken: string,
    igAccountId: string,
    type = 'graph.facebook.com'
  ): Promise<string | null> {
    try {
      // The page access token is scoped to a specific page.
      // We can get the page ID by calling /me with the page token.
      const response = await this.fetch(
        `${metaGraphUrl(type)}/me?fields=id&access_token=${pageAccessToken}`
      );
      const body = await response.json();
      if (body.id) {
        return body.id;
      }
      return null;
    } catch {
      return null;
    }
  }

  async ensureWebhookSubscription(
    pageAccessToken: string,
    igAccountId: string,
    type = 'graph.facebook.com'
  ): Promise<boolean> {
    // Instagram webhooks are subscribed directly on the IG account, not the Page.
    return this.subscribeToWebhooks(igAccountId, pageAccessToken, type);
  }

  async getMediaMetadata(
    mediaId: string,
    accessToken: string,
    type = 'graph.facebook.com'
  ): Promise<{
    id: string;
    permalink?: string;
    caption?: string;
    thumbnailUrl?: string;
    mediaType?: string;
    isAd?: boolean;
  }> {
    // boost_eligibility_info so existe em "Instagram API with Facebook Login"
    // (host graph.facebook.com). "Instagram API with Instagram Login"
    // (host graph.instagram.com / standalone) NAO expoe esse campo —
    // documentado em https://developers.facebook.com/docs/instagram-platform/reference/instagram-media
    // Quando sabemos pelo host que nao vai funcionar, pulamos o campo direto.
    // Caso o host nao seja reconhecido, o retry abaixo cobre como safety net.
    const baseFields =
      'id,caption,media_type,media_url,thumbnail_url,permalink';
    const supportsBoostField = type.includes('graph.facebook.com');
    const withBoost = `${baseFields},boost_eligibility_info`;
    const initialFields = supportsBoostField ? withBoost : baseFields;

    const tryFetch = async (fields: string) => {
      const response = await fetch(
        `${metaGraphUrl(
          type
        )}/${mediaId}?fields=${fields}&access_token=${accessToken}`
      );
      const body = await response.json();
      return { response, body };
    };

    let { response, body } = await tryFetch(initialFields);
    if (supportsBoostField && (!response.ok || body?.error)) {
      const message: string = body?.error?.message ?? '';
      const isNonexistingField =
        /nonexisting field/i.test(message) &&
        /boost_eligibility_info/i.test(message);
      if (isNonexistingField) {
        // Defensive: host eh facebook mas o app type nao suporta o campo.
        ({ response, body } = await tryFetch(baseFields));
      }
    }

    if (!response.ok || body?.error) {
      throw new Error(
        `IG getMediaMetadata failed (HTTP ${response.status}): ${
          body?.error?.message ?? JSON.stringify(body).slice(0, 200)
        }`
      );
    }

    const eligibleToBoost = body?.boost_eligibility_info?.eligible_to_boost;
    const isAd =
      typeof eligibleToBoost === 'boolean' ? !eligibleToBoost : undefined;

    return {
      id: body.id,
      permalink: body.permalink,
      caption: body.caption,
      thumbnailUrl: body.thumbnail_url ?? body.media_url,
      mediaType: body.media_type,
      isAd,
    };
  }

  async getRecentMedia(
    igAccountId: string,
    accessToken: string,
    type = 'graph.facebook.com',
    limit = 25,
    after?: string
  ): Promise<{
    posts: Array<{
      id: string;
      caption?: string;
      mediaType: string;
      mediaUrl?: string;
      thumbnailUrl?: string;
      permalink?: string;
      timestamp?: string;
    }>;
    nextCursor: string | null;
  }> {
    const fields =
      'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
    const cursor = after ? `&after=${after}` : '';
    const response = await fetch(
      `${metaGraphUrl(
        type
      )}/${igAccountId}/media?fields=${fields}&limit=${limit}&access_token=${accessToken}${cursor}`
    );
    const body = await response.json();
    if (!response.ok || !body.data) {
      return { posts: [], nextCursor: null };
    }
    return {
      posts: body.data.map((m: any) => ({
        id: m.id,
        caption: m.caption,
        mediaType: m.media_type,
        mediaUrl: m.media_url,
        thumbnailUrl: m.thumbnail_url,
        permalink: m.permalink,
        timestamp: m.timestamp,
      })),
      nextCursor: body.paging?.cursors?.after ?? null,
    };
  }

  async getRecentStories(
    igAccountId: string,
    accessToken: string,
    type = 'graph.facebook.com'
  ): Promise<{
    stories: Array<{
      id: string;
      caption?: string;
      mediaType: string;
      mediaUrl?: string;
      thumbnailUrl?: string;
      permalink?: string;
      timestamp?: string;
    }>;
  }> {
    // Instagram Graph API only exposes active stories (last 24h) via this edge.
    const fields =
      'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
    const response = await fetch(
      `${metaGraphUrl(
        type
      )}/${igAccountId}/stories?fields=${fields}&access_token=${accessToken}`
    );
    const body = await response.json();
    if (!response.ok || !body.data) {
      return { stories: [] };
    }
    return {
      stories: body.data.map((m: any) => ({
        id: m.id,
        caption: m.caption,
        mediaType: m.media_type,
        mediaUrl: m.media_url,
        thumbnailUrl: m.thumbnail_url,
        permalink: m.permalink,
        timestamp: m.timestamp,
      })),
    };
  }
}
