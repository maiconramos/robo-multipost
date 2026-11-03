import { DashboardFunction } from '@gitroom/nestjs-libraries/integrations/dashboard.function.decorator';
import { timer } from '@gitroom/helpers/utils/timer';
import { Integration } from '@prisma/client';
import { ApplicationFailure } from '@temporalio/activity';
import {
  getSsrfSafeAxios,
  ssrfSafeFetch,
} from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { AxiosInstance } from 'axios';
import { readFileSync } from 'fs';
import { resolve, sep } from 'path';
import { setHeartbeatDetails } from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import { Logger } from '@nestjs/common';

// Temporal persiste ApplicationFailure inteira no historico e a transporta por
// gRPC. Respostas de provider podem conter HTML, stacks ou blobs enormes; os
// limites abaixo mantem o diagnostico util sem permitir que uma falha estoure o
// frame/historico. Os codigos Meta aparecem no inicio do JSON e sao preservados.
const MAX_FAILURE_MESSAGE = 2_000;
const MAX_FAILURE_FIELD = 4_000;

// Leitura de midia responde os headers em menos de 1s e termina em poucos
// segundos (a mais lenta saudavel medida pelo upstream levou ~11s): 2 minutos
// so e atingido por uma transferencia travada depois dos headers (upstream
// #2193).
export const MEDIA_READ_TIMEOUT = 120_000;
// teto do download de midia em memoria (o mesmo do upload de video): sem ele
// uma URL de midia podia encher a memoria do worker
export const MEDIA_READ_MAX_BYTES = 1024 * 1024 * 1024;

// AbortSignal.timeout rejeita com TimeoutError; o axios reporta o abort como
// requisicao cancelada (ERR_CANCELED) e o undici pode embrulhar o TimeoutError
// no `cause`.
const isReadTimeout = (err: any) =>
  err?.code === 'ERR_CANCELED' ||
  err?.name === 'TimeoutError' ||
  err?.cause?.name === 'TimeoutError';

export function heartbeatEndpoint(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'unsupported-url';
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

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

// A plataforma ja aceitou o post (esta no ar), mas um passo seguinte falhou
// (ex.: o YouTube recusou a miniatura depois do upload): o post termina em
// ERROR, mas o id/URL na plataforma ficam salvos para o usuario abrir o post em
// vez de publicar de novo. A activity grava o link e relanca como BadBody
// (upstream 23beddcd).
export class PublishedWithError extends ApplicationFailure {
  constructor(
    identifier: string,
    public readonly postDbId: string,
    public readonly releaseId: string,
    public readonly releaseURL: string,
    message = ''
  ) {
    super(
      truncateForTemporal(message, MAX_FAILURE_MESSAGE),
      'published_with_error',
      true,
      [{ identifier, postDbId, releaseId, releaseURL }]
    );
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
  protected static readonly logger = new Logger('SocialAbstract');
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

  // Le a midia inteira em memoria (imagens que os providers passam ao sharp).
  protected async readOrFetch(path: string, retried = false): Promise<Buffer> {
    if (path.indexOf('http') !== 0) {
      return readFileSync(this.localMediaPath(path));
    }

    try {
      const response = await this.getSsrfSafeAxios()({
        url: path,
        method: 'GET',
        responseType: 'arraybuffer',
        maxContentLength: MEDIA_READ_MAX_BYTES,
        // O servidor responde os headers e o corpo para no meio: sem prazo a
        // leitura nunca termina e segura o slot da activity no worker (o
        // startToCloseTimeout falha a activity no servidor, mas nao para a
        // funcao). Imagens tem poucos MB e chegam em ~1s.
        signal: AbortSignal.timeout(MEDIA_READ_TIMEOUT),
      });
      return Buffer.from(response.data);
    } catch (err) {
      if (!isReadTimeout(err)) {
        throw err;
      }

      // travamento e transitorio e nada foi enviado a plataforma ainda: le de
      // novo uma vez antes de desistir
      if (!retried) {
        return this.readOrFetch(path, true);
      }

      // BadBody (sem retry da activity): repetir a publicacao leria a mesma
      // midia de novo segurando a fila do provider. A mensagem e o que o
      // usuario ve no post.
      throw new BadBody(
        this.identifier,
        JSON.stringify({
          timeoutMs: MEDIA_READ_TIMEOUT,
          path: heartbeatEndpoint(path),
        }),
        Buffer.from('{}'),
        'Não foi possível ler a mídia deste post, por isso ele não foi publicado'
      );
    }
  }

  // Midia que nao e URL remota e lida do disco do worker. O path gravado e
  // influenciado pelo usuario (DTO do post, tool MCP, settings de provider),
  // entao so um arquivo DENTRO de UPLOAD_DIRECTORY e aberto — mesma checagem
  // que PostsService.updateMedia faz antes, repetida aqui no sink para cobrir
  // qualquer caminho que chegue ao provider sem passar por la
  // (CVE-2026-115932). `resolve()` normaliza `..` antes da comparacao.
  protected localMediaPath(path: string, identifier = ''): string {
    const base = process.env.UPLOAD_DIRECTORY
      ? resolve(process.env.UPLOAD_DIRECTORY)
      : '';
    const filePath = resolve(path);
    if (!base || !filePath.startsWith(base + sep)) {
      throw new BadBody(
        identifier || this.identifier,
        JSON.stringify({ path }),
        Buffer.from('{}'),
        'A mídia deste post não está no diretório de uploads, por isso não foi publicada'
      );
    }

    return filePath;
  }

  public handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    return undefined;
  }

  @DashboardFunction()
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
      // Ja classificado pelo provider dentro do callback: mantem o tipo e a
      // mensagem em vez de virar 'Unknown Error' (upstream 0c9d3940)
      if (
        err instanceof BadBody ||
        err instanceof RefreshToken ||
        err instanceof PublishedWithError
      ) {
        throw err;
      }
      // Resumo do erro antes de passar por handleErrors — o wrapper joga fora
      // a mensagem original do provider. Resumido: o objeto cru levava o corpo
      // da resposta (tokens, URLs assinadas) ao log. Divergencia documentada
      // em .claude/skills/sync-upstream/SKILL.md.
      SocialAbstract.logger.error(
        `[runInConcurrent] ${this.identifier} provider error: ${summarizeError(err)}`
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
    // Query strings may contain access tokens. Persist only the endpoint path
    // as Temporal heartbeat diagnostic data.
    setHeartbeatDetails(`fetch ${heartbeatEndpoint(url)}`);
    const request = await ssrfSafeFetch(url, options);

    if (request.status === 200 || request.status === 201) {
      return request;
    }

    let json = '{}';
    try {
      json = await request.text();
    } catch (err) {
      json = '{}';
    }

    const handleError = this.handleErrors(json || '{}', request.status);

    // Retentativas esgotadas: leva a mensagem curada do provider (ex.: "Media
    // fetch failed", "posting too fast") em vez de um BadBody vazio.
    if (totalRetries > 2) {
      throw new BadBody(
        identifier,
        json,
        options.body || '{}',
        handleError?.value || ''
      );
    }

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
