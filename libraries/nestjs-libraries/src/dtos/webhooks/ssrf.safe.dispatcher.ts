import { Agent } from 'undici';
import axios, { AxiosInstance } from 'axios';
import dns from 'node:dns';
import net, { LookupFunction } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { isBlockedIp, isSsrfProtectionDisabled } from './webhook.url.validator';

// Pins DNS resolution: every resolved IP is checked with `isBlockedIp` and
// the caller (undici) connects to that same set. Closes the TOCTOU window
// `isSafePublicHttpsUrl` alone leaves open (see GHSA-f7jj-p389-4w45).
type SsrfLookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: any,
  family?: number
) => void;

/**
 * Lookup compartilhado por Undici e Axios. A verificacao acontece no momento
 * da conexao e o cliente usa exatamente o endereco aprovado, fechando a janela
 * de DNS rebinding entre uma validacao previa e o request real.
 */
export function ssrfSafeLookup(
  hostname: string,
  options: any,
  callback: SsrfLookupCallback
): void {
  if (net.isIP(hostname)) {
    const family = net.isIP(hostname);
    if (isBlockedIp(hostname)) {
      callback(new Error('Blocked IP'), '', 0);
      return;
    }

    if (options?.all) {
      callback(null, [{ address: hostname, family }], family);
      return;
    }

    callback(null, hostname, family);
    return;
  }

  dns.lookup(hostname, options, (error, address: any, family: any) => {
    if (error) {
      callback(error, '', 0);
      return;
    }

    if (Array.isArray(address)) {
      if (address.some((entry) => isBlockedIp(entry.address))) {
        callback(new Error('Blocked IP'), '', 0);
        return;
      }

      callback(null, address, 0);
      return;
    }

    if (isBlockedIp(address)) {
      callback(new Error('Blocked IP'), '', 0);
      return;
    }

    callback(null, address, family);
  });
}

export const ssrfSafeDispatcher = new Agent({
  connect: {
    lookup: ssrfSafeLookup,
  },
});

const ssrfSafeAxios = axios.create({
  // Axios otherwise honors HTTP(S)_PROXY and the agent would validate only
  // the proxy address while that proxy could still reach an internal target.
  proxy: false,
  httpAgent: new http.Agent({
    lookup: ssrfSafeLookup as LookupFunction,
  }),
  httpsAgent: new https.Agent({
    lookup: ssrfSafeLookup as LookupFunction,
  }),
});

/**
 * Opt-out reservado a instalacoes self-hosted que precisam alcancar providers
 * ou webhooks HTTPS dentro de uma rede privada confiavel.
 */
export function getSsrfSafeDispatcher(): Agent | undefined {
  return isSsrfProtectionDisabled() ? undefined : ssrfSafeDispatcher;
}

export function getSsrfSafeAxios(): AxiosInstance {
  return isSsrfProtectionDisabled() ? axios : ssrfSafeAxios;
}

type UndiciRequestInit = RequestInit & { dispatcher?: Agent };

export function ssrfSafeFetch(
  input: Parameters<typeof fetch>[0],
  init: UndiciRequestInit = {}
): Promise<Response> {
  return fetch(input, {
    ...init,
    dispatcher: init.dispatcher ?? getSsrfSafeDispatcher(),
  } as RequestInit);
}
