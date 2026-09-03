import { timer } from '@gitroom/helpers/utils/timer';
import { Integration } from '@prisma/client';
import { ApplicationFailure } from '@temporalio/activity';
import {
  getSsrfSafeAxios,
  ssrfSafeFetch,
} from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { AxiosInstance } from 'axios';
import { readFileSync } from 'fs';

// Temporal persiste ApplicationFailure inteira no historico e a transporta por
// gRPC. Respostas de provider podem conter HTML, stacks ou blobs enormes; os
// limites abaixo mantem o diagnostico util sem permitir que uma falha estoure o
// frame/historico. Os codigos Meta aparecem no inicio do JSON e sao preservados.
const MAX_FAILURE_MESSAGE = 2_000;
const MAX_FAILURE_FIELD = 4_000;

export function truncateForTemporal(value: unknown, max: number): string {
  if (value === null || value === undefined) {
    return '';
  }

  const serialized = typeof value === 'string' ? value : safeStringify(value);
  const text = typeof serialized === 'string' ? serialized : String(value);
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max)}… [truncated ${text.length - max} chars]`;
}

export class RefreshToken extends ApplicationFailure {
  constructor(identifier: string, json: string, body: BodyInit, message = '') {
    super(
      truncateForTemporal(message, MAX_FAILURE_MESSAGE),
      'refresh_token',
      true,
      [
        {
          identifier,
          json: truncateForTemporal(json, MAX_FAILURE_FIELD),
          body: truncateForTemporal(body, MAX_FAILURE_FIELD),
        },
      ]
    );
  }
}

export class BadBody extends ApplicationFailure {
  constructor(identifier: string, json: string, body: BodyInit, message = '') {
    super(truncateForTemporal(message, MAX_FAILURE_MESSAGE), 'bad_body', true, [
      {
        identifier,
        json: truncateForTemporal(json, MAX_FAILURE_FIELD),
        body: truncateForTemporal(body, MAX_FAILURE_FIELD),
      },
    ]);
  }
}

export class NotEnoughScopes {
  constructor(
    public message = 'Not enough scopes, when choosing a provider, please add all the scopes'
  ) {}
}

function safeStringify(obj: any) {
  const seen = new WeakSet();

  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

export abstract class SocialAbstract {
  abstract identifier: string;
  maxConcurrentJob = 1;
  hiddenFromList = false;

  protected getSsrfSafeAxios(): AxiosInstance {
    return getSsrfSafeAxios();
  }

  protected assetBoolean(value: boolean | string | undefined): boolean {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }

    return value || false;
  }

  protected async readOrFetch(path: string): Promise<Buffer> {
    if (path.indexOf('http') === 0) {
      const response = await this.getSsrfSafeAxios()({
        url: path,
        method: 'GET',
        responseType: 'arraybuffer',
      });
      return Buffer.from(response.data);
    }

    return readFileSync(path);
  }

  public handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    return undefined;
  }

  public async mention(
    token: string,
    d: { query: string },
    id: string,
    integration: Integration
  ): Promise<
    | { id: string; label: string; image: string; doNotCache?: boolean }[]
    | { none: true }
  > {
    return { none: true };
  }

  async runInConcurrent<T>(
    func: (...args: any[]) => Promise<T>,
    ignoreConcurrency?: boolean
  ) {
    let value: any;
    try {
      value = await func();
    } catch (err) {
      // Log cru do erro antes de passar por handleErrors — caso contrario
      // o wrapper do runInConcurrent joga fora o stack e a mensagem original
      // do provider (ex.: resposta da API do X/Twitter), dificultando
      // diagnosticar falhas no worker do Temporal. Divergencia documentada
      // em .claude/skills/sync-upstream/SKILL.md.
      console.error(
        '[runInConcurrent] provider error:',
        (err as any)?.data || (err as any)?.message || err,
        (err as any)?.stack || ''
      );
      const handle = this.handleErrors(safeStringify(err), 200);
      value = { err: true, value: 'Unknown Error', ...(handle || {}) };
    }

    if (value && value?.err && value?.value) {
      if (value.type === 'refresh-token') {
        throw new RefreshToken(
          '',
          safeStringify({}),
          {} as any,
          value.value || ''
        );
      }
      throw new BadBody('', safeStringify({}), {} as any, value.value || '');
    }

    return value;
  }

  async fetch(
    url: string,
    options: RequestInit = {},
    identifier = '',
    totalRetries = 0,
    ignoreConcurrency = false
  ): Promise<Response> {
    const request = await ssrfSafeFetch(url, options);

    if (request.status === 200 || request.status === 201) {
      return request;
    }

    if (totalRetries > 2) {
      throw new BadBody(identifier, '{}', options.body || '{}');
    }

    let json = '{}';
    try {
      json = await request.text();
    } catch (err) {
      json = '{}';
    }

    const handleError = this.handleErrors(json || '{}', request.status);

    if (
      request.status === 429 ||
      (request.status === 500 && !handleError) ||
      json.includes('rate_limit_exceeded') ||
      json.includes('Rate limit')
    ) {
      await timer(5000);
      return this.fetch(
        url,
        options,
        identifier,
        totalRetries + 1,
        ignoreConcurrency
      );
    }

    if (handleError?.type === 'retry') {
      await timer(5000);
      return this.fetch(
        url,
        options,
        identifier,
        totalRetries + 1,
        ignoreConcurrency
      );
    }

    if (
      (request.status === 401 &&
        (handleError?.type === 'refresh-token' || !handleError)) ||
      handleError?.type === 'refresh-token'
    ) {
      throw new RefreshToken(
        identifier,
        json,
        options.body!,
        handleError?.value
      );
    }

    throw new BadBody(
      identifier,
      json,
      options.body!,
      handleError?.value || ''
    );
  }

  // Analytics must not inherit posting retries/BadBody, but RefreshToken is
  // kept so the service layer can renew or self-heal the integration.
  protected async analyticsFetch(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const request = await ssrfSafeFetch(url, options);

    if (request.status === 200 || request.status === 201) {
      return request;
    }

    let body = '{}';
    try {
      body = await request.clone().text();
    } catch (err) {
      body = '{}';
    }

    const handleError = this.handleErrors(body, request.status);
    if (
      handleError?.type === 'refresh-token' ||
      (request.status === 401 && !handleError)
    ) {
      throw new RefreshToken(
        '',
        body,
        options.body || '{}',
        handleError?.value
      );
    }

    return request;
  }

  checkScopes(required: string[], got: string | string[]) {
    if (Array.isArray(got)) {
      if (!required.every((scope) => got.includes(scope))) {
        throw new NotEnoughScopes();
      }

      return true;
    }

    const newGot = decodeURIComponent(got);

    const splitType = newGot.indexOf(',') > -1 ? ',' : ' ';
    const gotArray = newGot.split(splitType);
    if (!required.every((scope) => gotArray.includes(scope))) {
      throw new NotEnoughScopes();
    }

    return true;
  }
}
