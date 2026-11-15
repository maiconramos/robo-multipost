import { HttpException, Injectable } from '@nestjs/common';
import { ssrfSafeFetch } from '../../dtos/webhooks/ssrf.safe.dispatcher';
import { readResponseBodyWithLimit } from '../../upload/bounded.response.reader';
import { object } from './zernio-automation.contract';
export class ZernioAutomationError extends HttpException {
  constructor(code: string, status: number, readonly uncertain = false) {
    super(code, status);
  }
}
@Injectable()
export class ZernioAutomationClient {
  async request(
    key: string,
    path: string,
    method: 'GET' | 'POST' | 'PATCH' = 'GET',
    body?: Record<string, unknown>,
    query?: Record<string, string>
  ): Promise<Record<string, any>> {
    if (
      !/^\/(?:accounts|comment-automations)(?:\/[a-zA-Z0-9-]+)*(?:\/posts|\/logs)?$/.test(
        path
      )
    )
      throw new ZernioAutomationError('ZERNIO_INVALID_ENDPOINT', 400);
    const url = new URL(`https://zernio.com/api/v1${path}`);
    for (const [k, v] of Object.entries(query || {}))
      url.searchParams.set(k, v);
    let response: Response;
    try {
      response = await ssrfSafeFetch(url.toString(), {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ZernioAutomationError(
        method === 'GET' ? 'ZERNIO_UNAVAILABLE' : 'ZERNIO_OUTCOME_UNKNOWN',
        502,
        method !== 'GET'
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const status = response.status;
      const code =
        status === 401 || status === 403
          ? 'ZERNIO_AUTHORIZATION_REQUIRED'
          : status === 409
          ? 'ZERNIO_RULE_CONFLICT'
          : status === 429
          ? 'ZERNIO_RATE_LIMITED'
          : status === 404
          ? 'ZERNIO_RESOURCE_NOT_FOUND'
          : status >= 500
          ? 'ZERNIO_UNAVAILABLE'
          : 'ZERNIO_CONFIGURATION_REJECTED';
      throw new ZernioAutomationError(
        code,
        status >= 500 ? 502 : status === 401 || status === 403 ? 412 : status,
        method !== 'GET' && status >= 500
      );
    }
    try {
      const data = object(
        JSON.parse(
          (await readResponseBodyWithLimit(response, 1024 * 1024)).toString(
            'utf8'
          )
        )
      );
      if (!Object.keys(data).length || data.success === false || data.error)
        throw new Error();
      return data;
    } catch {
      throw new ZernioAutomationError(
        method === 'GET' ? 'ZERNIO_INVALID_RESPONSE' : 'ZERNIO_OUTCOME_UNKNOWN',
        502,
        method !== 'GET'
      );
    }
  }
}
