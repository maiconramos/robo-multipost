import { open } from 'fs/promises';
import {
  parse,
  Element as DefaultTreeElement,
  Node as DefaultTreeNode,
} from 'parse5';
import { readResponseBodyWithLimit } from './bounded.response.reader';
import { PublicUrlFetchError, withPublicUrlResponse } from './public-url.fetch';

const HTML_LIMIT = 256 * 1024;
const DOWNLOAD_TIMEOUT = 5 * 60_000;
const validId = /^[a-zA-Z0-9_-]{10,200}$/;
type DriveLink = { id: string; url: string; resourceKey?: string };
type DriveErrorCode =
  | 'DRIVE_LINK_UNSUPPORTED'
  | 'DRIVE_ACCESS_DENIED'
  | 'DRIVE_DOWNLOAD_LIMIT'
  | 'DRIVE_CONFIRMATION_UNSUPPORTED';
export class DriveDownloadError extends Error {
  constructor(readonly code: DriveErrorCode) {
    super(code);
  }
}
const unsupported = (): never => {
  throw new DriveDownloadError('DRIVE_LINK_UNSUPPORTED');
};
const confirmationFailed = (): never => {
  throw new DriveDownloadError('DRIVE_CONFIRMATION_UNSUPPORTED');
};
const cleanGoogleUrl = (url: URL) =>
  url.protocol === 'https:' && !url.username && !url.password && !url.port;

/** Recognize exact Drive hosts only; unrelated HTTPS URLs keep their normal path. */
export function resolveDriveLink(value: string): DriveLink | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null; // The shared public URL guard reports malformed URLs.
  }
  if (
    ![
      'drive.google.com',
      'docs.google.com',
      'drive.usercontent.google.com',
    ].includes(url.hostname)
  )
    return null;
  if (!cleanGoogleUrl(url) || url.hash) unsupported();
  const pathId =
    /^\/file\/d\/([a-zA-Z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/.exec(
      url.pathname
    )?.[1];
  const queryPath =
    (url.hostname === 'drive.google.com' &&
      ['/open', '/uc'].includes(url.pathname)) ||
    (url.hostname === 'drive.usercontent.google.com' &&
      url.pathname === '/download');
  const ids = url.searchParams.getAll('id');
  const id = pathId || (queryPath && ids.length === 1 ? ids[0] : '');
  if (
    !validId.test(id) ||
    ids.length > 1 ||
    (pathId && ids.length && ids[0] !== pathId)
  )
    unsupported();
  const keys = url.searchParams.getAll('resourcekey');
  if (keys.length > 1 || (keys[0] && !/^[a-zA-Z0-9_-]{1,200}$/.test(keys[0])))
    unsupported();
  const download = new URL('https://drive.google.com/uc');
  download.searchParams.set('export', 'download');
  download.searchParams.set('id', id);
  if (keys[0]) download.searchParams.set('resourcekey', keys[0]);
  return { id, url: download.toString(), resourceKey: keys[0] };
}

const googleDownloadHost = (url: URL) =>
  cleanGoogleUrl(url) &&
  (url.hostname === 'drive.google.com' ||
    url.hostname === 'drive.usercontent.google.com' ||
    // The binary CDN can be an ephemeral subdomain. DNS remains pinned/validated.
    url.hostname.endsWith('.googleusercontent.com'));
function elements(root: DefaultTreeNode): DefaultTreeElement[] {
  const result: DefaultTreeElement[] = [];
  const pending = [root];
  while (pending.length) {
    const node = pending.pop()!;
    if ('tagName' in node) result.push(node as DefaultTreeElement);
    if ('childNodes' in node)
      for (const child of node.childNodes) pending.push(child);
  }
  return result;
}

const attr = (element: DefaultTreeElement, name: string) =>
  element.attrs.find((a) => a.name === name)?.value;

function confirmationUrl(
  html: string,
  drive: DriveLink,
  allowConfirmation: boolean
): string {
  const nodes = elements(parse(html));
  const title = nodes
    .filter((n) => n.tagName === 'title')
    .flatMap((n) => n.childNodes)
    .map((n) => ('value' in n ? n.value : ''))
    .join('')
    .trim()
    .toLowerCase();
  if (title === 'google drive - quota exceeded')
    throw new DriveDownloadError('DRIVE_DOWNLOAD_LIMIT');
  if (!allowConfirmation) confirmationFailed();
  const forms = nodes.filter(
    (n) => n.tagName === 'form' && attr(n, 'id') === 'download-form'
  );
  if (forms.length !== 1) confirmationFailed();
  const form = forms[0];
  if ((attr(form, 'method') || 'get').toLowerCase() !== 'get')
    confirmationFailed();
  let target: URL;
  try {
    target = new URL(attr(form, 'action') || '', drive.url);
  } catch {
    return confirmationFailed();
  }
  if (
    !cleanGoogleUrl(target) ||
    target.hash ||
    !(
      (target.hostname === 'drive.usercontent.google.com' &&
        target.pathname === '/download') ||
      (target.hostname === 'drive.google.com' && target.pathname === '/uc')
    )
  )
    confirmationFailed();
  const parameters = new URLSearchParams(target.search);
  for (const input of elements(form).filter((n) => n.tagName === 'input')) {
    if ((attr(input, 'type') || '').toLowerCase() !== 'hidden') continue;
    const name = attr(input, 'name');
    const value = attr(input, 'value');
    if (!name || value === undefined || parameters.has(name))
      confirmationFailed();
    parameters.append(name, value);
  }
  const allowed = new Set(['id', 'export', 'confirm', 'uuid', 'resourcekey']);
  for (const [name, value] of parameters) {
    if (
      !allowed.has(name) ||
      parameters.getAll(name).length !== 1 ||
      !/^[a-zA-Z0-9_-]{1,200}$/.test(value)
    )
      confirmationFailed();
  }
  if (
    parameters.get('id') !== drive.id ||
    parameters.get('export') !== 'download' ||
    !parameters.get('confirm')
  )
    confirmationFailed();
  if (drive.resourceKey) {
    if (
      parameters.has('resourcekey') &&
      parameters.get('resourcekey') !== drive.resourceKey
    )
      confirmationFailed();
    parameters.set('resourcekey', drive.resourceKey);
  }
  target.search = parameters.toString();
  return target.toString();
}

function filenameOf(response: Response): string {
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = /filename\*=UTF-8''([^;\r\n]+)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded).slice(0, 255);
    } catch {
      /* fallback below */
    }
  }
  return /filename="([^"\r\n]{1,255})"/i.exec(disposition)?.[1] || 'upload';
}

async function streamToFile(
  response: Response,
  path: string,
  maxBytes: number,
  drive: boolean
) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes)
    throw new PublicUrlFetchError('too-large', 'File is too large');
  const file = await open(path, 'wx', 0o600);
  let size = 0;
  let probing = drive;
  let prefix = Buffer.alloc(0);
  const reader = response.body?.getReader();
  try {
    if (!reader) return 0;
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw new PublicUrlFetchError('network', 'Download interrupted');
      }
      if (chunk.done) break;
      if (probing) {
        prefix = Buffer.concat([
          prefix,
          Buffer.from(chunk.value.subarray(0, 512 - prefix.length)),
        ]);
        const text = prefix
          .toString('utf8')
          .replace(/^\uFEFF/, '')
          .trimStart();
        if (text.startsWith('<') || (!text && prefix.length >= 512))
          confirmationFailed();
        if (text && !(prefix.length < 3 && prefix[0] === 0xef)) probing = false;
      }
      size += chunk.value.byteLength;
      if (size > maxBytes)
        throw new PublicUrlFetchError('too-large', 'File is too large');
      let offset = 0;
      while (offset < chunk.value.byteLength) {
        const { bytesWritten } = await file.write(
          chunk.value,
          offset,
          chunk.value.byteLength - offset
        );
        if (!bytesWritten) throw new Error('Temporary file write failed');
        offset += bytesWritten;
      }
    }
    return size;
  } finally {
    try {
      await reader?.cancel();
    } catch {
      /* Keep original failure. */
    }
    reader?.releaseLock();
    await file.close();
  }
}

/** Caller owns the private temporary directory and removes it in finally. */
export async function downloadPublicMedia(
  url: string,
  path: string,
  options: { maxBytes?: number } = {}
): Promise<{ size: number; filename: string }> {
  const drive = resolveDriveLink(url);
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT);
  const requestOptions = {
    maxBytes: options.maxBytes ?? 1024 ** 3,
    signal,
    allowHttp: false,
    honorSsrfOptOut: false,
    ...(drive
      ? {
          allowedUrl: (target: URL) => {
            if (
              cleanGoogleUrl(target) &&
              target.hostname === 'accounts.google.com'
            )
              throw new DriveDownloadError('DRIVE_ACCESS_DENIED');
            return googleDownloadHost(target);
          },
        }
      : {}),
  };
  let current = drive?.url || url;
  for (let step = 0; step < 2; step++) {
    try {
      const result = await withPublicUrlResponse(
        current,
        requestOptions,
        async (response) => {
          const type = (
            response.headers.get('content-type') || ''
          ).toLowerCase();
          if (
            drive &&
            (type.includes('text/html') ||
              type.includes('application/xhtml+xml'))
          ) {
            let body: Buffer;
            try {
              body = await readResponseBodyWithLimit(response, HTML_LIMIT);
            } catch (error) {
              if (
                error instanceof Error &&
                error.name === 'ResponseBodyTooLargeError'
              )
                confirmationFailed();
              throw new PublicUrlFetchError('network', 'Download interrupted');
            }
            return {
              next: confirmationUrl(body.toString('utf8'), drive, step === 0),
            };
          }
          return {
            size: await streamToFile(
              response,
              path,
              requestOptions.maxBytes,
              Boolean(drive)
            ),
            filename: filenameOf(response),
          };
        }
      );
      if ('next' in result) {
        current = result.next;
        continue;
      }
      return result;
    } catch (error) {
      if (
        drive &&
        error instanceof PublicUrlFetchError &&
        error.reason === 'http'
      ) {
        if (error.status === 429)
          throw new DriveDownloadError('DRIVE_DOWNLOAD_LIMIT');
        if ([401, 403, 404].includes(error.status))
          throw new DriveDownloadError('DRIVE_ACCESS_DENIED');
      }
      throw error;
    }
  }
  return confirmationFailed();
}
