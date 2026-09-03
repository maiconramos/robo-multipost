import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { WordpressDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/wordpress.dto';
import slugify from 'slugify';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { ssrfSafeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

export class WordpressProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'wordpress';
  name = 'WordPress';
  isBetweenSteps = false;
  editor = 'html' as const;
  scopes = [] as string[];
  override maxConcurrentJob = 5; // WordPress self-hosted typically has generous limits
  dto = WordpressDto;
  maxLength() {
    return 100000;
  }

  private decodeToken(token: string) {
    const credentials = JSON.parse(Buffer.from(token, 'base64').toString()) as {
      domain: string;
      username: string;
      password: string;
    };
    const domain = credentials.domain.trim().replace(/\/+$/, '');
    const auth = Buffer.from(
      `${credentials.username}:${credentials.password}`
    ).toString('base64');

    return { credentials, domain, auth };
  }

  private normalizeTermIds(values: unknown): number[] {
    if (!Array.isArray(values)) {
      return [];
    }

    return [
      ...new Set(
        values
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      ),
    ];
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
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
  override handleErrors(
    body: string
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (body.indexOf('rest_cannot_create') > -1) {
      return {
        type: 'bad-body',
        value: 'The connect user has insufficient permissions to create posts',
      };
    }
    return undefined;
  }

  async customFields() {
    return [
      {
        key: 'domain',
        label: 'Domain URL',
        validation: `/^https?:\\/\\/(?:www\\.)?[\\w\\-]+(\\.[\\w\\-]+)+([\\/?#][^\\s]*)?$/`,
        type: 'text' as const,
      },
      {
        key: 'username',
        label: 'Username',
        validation: `/.+/`,
        type: 'text' as const,
      },
      {
        key: 'password',
        label: 'Password',
        validation: `/.+/`,
        type: 'password' as const,
        hint: 'wordpress_application_password_hint',
      },
    ];
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const { credentials: body, domain, auth } = this.decodeToken(params.code);

    let response: Response;
    try {
      response = await ssrfSafeFetch(`${domain}/wp-json/wp/v2/users/me`, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });
    } catch {
      return 'Could not reach your WordPress site. Check the Domain URL and that the site is publicly accessible.';
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      let wpCode = '';

      try {
        const parsed = JSON.parse(errorBody) as { code?: string };
        wpCode = parsed.code || '';
      } catch {
        // HTML and other non-JSON error bodies are intentionally not logged.
      }

      let origin = 'invalid-domain';
      try {
        origin = new URL(domain).origin;
      } catch {
        // The connection screen validates the URL; keep API callers safe too.
      }

      console.warn('WordPress authentication failed', {
        origin,
        status: response.status,
        code: wpCode,
      });

      if (response.status === 401 || response.status === 403) {
        return 'WordPress rejected the login. A security plugin or server setting may be blocking the REST API or stripping the Authorization header, or the username / Application Password is incorrect.';
      }

      return `WordPress returned an unexpected error (HTTP ${response.status}). Make sure the REST API is enabled and Application Passwords are available.`;
    }

    let data: {
      id?: number | string;
      name?: string;
      avatar_urls?: Record<string, string>;
      code?: string;
    };

    try {
      data = await response.json();
    } catch {
      return 'WordPress did not return a valid response. The REST API may be disabled or blocked by a security plugin.';
    }

    const { id, name, avatar_urls, code } = data || {};

    if (code) {
      return 'Invalid credentials';
    }

    const biggestImage = Object.entries(avatar_urls || {}).reduce(
      (all, current) => {
        if (all > Number(current[0])) {
          return all;
        }
        return Number(current[0]);
      },
      0
    );

    return {
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      accessToken: params.code,
      id: body.domain + '_' + id,
      name,
      picture: avatar_urls?.[String(biggestImage)] || '',
      username: body.username,
    };
  }

  @Tool({
    description: 'Get list of post types',
    dataSchema: [],
  })
  async postTypes(token: string) {
    const postTypes = await this.wpGet(token, '/wp-json/wp/v2/types');

    return Object.entries<any>(postTypes).reduce((all, [key, value]) => {
      if (
        key.indexOf('wp_') > -1 ||
        key.indexOf('nav_') > -1 ||
        key === 'attachment'
      ) {
        return all;
      }

      all.push({
        id: value.rest_base,
        name: value.name,
      });

      return all;
    }, []);
  }

  private async wpGet(token: string, path: string) {
    const { domain, auth } = this.decodeToken(token);
    return (
      await this.fetch(`${domain}${path}`, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      })
    ).json();
  }

  @Tool({
    description: 'Get list of categories',
    dataSchema: [],
  })
  async categoriesList(token: string) {
    const categories = await this.wpGet(
      token,
      '/wp-json/wp/v2/categories?per_page=100'
    );

    return (Array.isArray(categories) ? categories : []).map((category) => ({
      id: category.id,
      name: category.name,
    }));
  }

  @Tool({
    description: 'Get list of tags',
    dataSchema: [],
  })
  async tagsList(token: string) {
    const tags = await this.wpGet(token, '/wp-json/wp/v2/tags?per_page=100');

    return (Array.isArray(tags) ? tags : []).map((tag) => ({
      id: tag.id,
      name: tag.name,
    }));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<WordpressDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { domain, auth } = this.decodeToken(accessToken);

    let mediaId = '';
    if (postDetails?.[0]?.settings?.main_image?.path) {
      console.log(
        'Uploading image to WordPress',
        postDetails[0].settings.main_image.path
      );

      const blob = await this.fetch(
        postDetails[0].settings.main_image.path
      ).then((r) => r.blob());

      const mediaResponse = await (
        await this.fetch(`${domain}/wp-json/wp/v2/media`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Disposition': `attachment; filename="${postDetails[0].settings.main_image.path
              .split('/')
              .pop()}"`,
            'Content-Type': blob.type,
          },
          body: blob,
        })
      ).json();

      mediaId = mediaResponse.id;
    }

    const categories = this.normalizeTermIds(
      postDetails?.[0]?.settings?.categories
    );
    const tags = this.normalizeTermIds(postDetails?.[0]?.settings?.tags);

    const submit = await (
      await this.fetch(
        `${domain}/wp-json/wp/v2/${postDetails?.[0]?.settings?.type}`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({
            title: postDetails?.[0]?.settings?.title,
            content: postDetails?.[0]?.message,
            slug: slugify(postDetails?.[0]?.settings?.title, {
              lower: true,
              strict: true,
              trim: true,
            }),
            status: postDetails?.[0]?.settings?.status || 'publish',
            ...(categories.length ? { categories } : {}),
            ...(tags.length ? { tags } : {}),
            ...(mediaId ? { featured_media: mediaId } : {}),
          }),
        }
      )
    ).json();

    return [
      {
        id: postDetails?.[0].id,
        status: 'completed',
        postId: String(submit.id),
        releaseURL: submit.link,
      },
    ];
  }
}
