jest.mock('../dtos/webhooks/webhook.url.validator', () => ({
  ...jest.requireActual('../dtos/webhooks/webhook.url.validator'),
  isSafePublicHttpsUrl: jest.fn().mockResolvedValue(true),
}));
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { downloadPublicMedia, resolveDriveLink } from './public-media.download';
import { isSafePublicHttpsUrl } from '../dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '../dtos/webhooks/ssrf.safe.dispatcher';

const id = 'testFile_123-abc';
const link = `https://drive.google.com/file/d/${id}/view?usp=sharing&resourcekey=0-KEY`;
const form = (
  action = 'https://drive.usercontent.google.com/download',
  fields = ''
) =>
  `<form id="download-form" action="${action}" method="get"><input type="hidden" name="id" value="${id}"><input type="hidden" name="export" value="download"><input type="hidden" name="confirm" value="t"><input type="hidden" name="uuid" value="UUID">${fields}</form>`;
const html = (body: string) =>
  new Response(body, { headers: { 'content-type': 'text/html' } });
const binary = () =>
  new Response(new Uint8Array([1, 2, 3]), {
    headers: {
      'content-type': 'video/mp4',
      'content-disposition': 'attachment; filename="campanha.mp4"',
    },
  });

describe('importacao de midia publica do Drive', () => {
  const originalFetch = globalThis.fetch;
  let directory: string;
  let path: string;
  let fetchMock: jest.Mock;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'drive-download-spec-'));
    path = join(directory, 'source');
    fetchMock = jest.fn().mockImplementation(binary);
    globalThis.fetch = fetchMock;
    (isSafePublicHttpsUrl as jest.Mock).mockReset().mockResolvedValue(true);
  });
  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  });
  it.each([
    link,
    `https://drive.google.com/open?id=${id}&resourcekey=0-KEY`,
    `https://drive.google.com/uc?export=download&id=${id}&resourcekey=0-KEY`,
  ])('normaliza link individual e preserva resourcekey: %s', async (url) => {
    await expect(downloadPublicMedia(url, path)).resolves.toEqual({
      size: 3,
      filename: 'campanha.mp4',
    });
    const requested = new URL(fetchMock.mock.calls[0][0]);
    expect(requested.origin + requested.pathname).toBe(
      'https://drive.google.com/uc'
    );
    expect(requested.searchParams.get('id')).toBe(id);
    expect(requested.searchParams.get('resourcekey')).toBe('0-KEY');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      dispatcher: ssrfSafeDispatcher,
      redirect: 'manual',
    });
    expect(await readFile(path)).toEqual(Buffer.from([1, 2, 3]));
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
  it('resolve confirmacao GET uma vez com mesmo ID e prazo compartilhado', async () => {
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(html(form()))
      .mockImplementationOnce(binary);
    await downloadPublicMedia(link, path);
    const confirmed = new URL(fetchMock.mock.calls[1][0]);
    expect(confirmed.origin).toBe('https://drive.usercontent.google.com');
    expect(confirmed.searchParams.get('id')).toBe(id);
    expect(confirmed.searchParams.get('uuid')).toBe('UUID');
    expect(confirmed.searchParams.get('resourcekey')).toBe('0-KEY');
    expect(fetchMock.mock.calls[0][1].signal).toBe(
      fetchMock.mock.calls[1][1].signal
    );
    expect(fetchMock.mock.calls[1][1].headers).toBeUndefined();
  });
  it.each([
    form('https://evil.example/download'),
    form('http://drive.usercontent.google.com/download'),
    form('https://drive.usercontent.google.com.evil/download'),
    form('https://drive.usercontent.google.com:444/download'),
    form('https://user@drive.usercontent.google.com/download'),
    form('https://drive.usercontent.google.com/other'),
    form().replace(id, 'otherFile'),
    form().replace('method="get"', 'method="post"'),
    form(undefined, `<input type="hidden" name="id" value="${id}">`),
    '<script>location="https://evil.example"</script>',
    form().replace('value="t"', 'value=""'),
  ])(
    'recusa confirmacao inesperada sem seguir alvo arbitrario',
    async (body) => {
      fetchMock.mockResolvedValueOnce(html(body));
      await expect(downloadPublicMedia(link, path)).rejects.toMatchObject({
        code: 'DRIVE_CONFIRMATION_UNSUPPORTED',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );
  it.each([undefined, 'application/octet-stream', 'video/mp4'])(
    'interrompe HTML com cabecalho falso ou ausente: %s',
    async (type) => {
      let cancelled = false;
      let reads = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          reads++;
          controller.enqueue(Buffer.from('<html>' + 'x'.repeat(4096)));
        },
        cancel() {
          cancelled = true;
        },
      });
      fetchMock.mockResolvedValueOnce(
        new Response(body, { headers: type ? { 'content-type': type } : {} })
      );
      await expect(downloadPublicMedia(link, path)).rejects.toMatchObject({
        code: 'DRIVE_CONFIRMATION_UNSUPPORTED',
      });
      expect(cancelled).toBe(true);
      expect(reads).toBeLessThan(5);
    }
  );
  it('reconhece redirecionamento de login sem visitar o login', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://accounts.google.com/ServiceLogin?secret=VALUE',
        },
      })
    );
    await expect(downloadPublicMedia(link, path)).rejects.toMatchObject({
      code: 'DRIVE_ACCESS_DENIED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])(
    'identifica quota HTML do Google mesmo apos confirmacao: %s',
    async (afterConfirmation) => {
      fetchMock.mockReset();
      if (afterConfirmation) fetchMock.mockResolvedValueOnce(html(form()));
      fetchMock.mockResolvedValueOnce(
        html(
          '<html><head><title>Google Drive - Quota exceeded</title></head><body>PRIVATE_SECRET</body></html>'
        )
      );
      const error = await downloadPublicMedia(link, path).catch((e) => e);
      expect(error.code).toBe('DRIVE_DOWNLOAD_LIMIT');
      expect(error.message).not.toMatch(/PRIVATE_SECRET|0-KEY/);
      expect(fetchMock).toHaveBeenCalledTimes(afterConfirmation ? 2 : 1);
    }
  );
  it('nao repete confirmacao em loop', async () => {
    fetchMock.mockImplementation(() => html(form()));
    await expect(downloadPublicMedia(link, path)).rejects.toMatchObject({
      code: 'DRIVE_CONFIRMATION_UNSUPPORTED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('limita HTML real mesmo sem Content-Length', async () => {
    fetchMock.mockResolvedValueOnce(html('x'.repeat(256 * 1024 + 1)));
    await expect(downloadPublicMedia(link, path)).rejects.toMatchObject({
      code: 'DRIVE_CONFIRMATION_UNSUPPORTED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404, 429])(
    'distingue resposta HTTP %s do Google sem vazar link',
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response('PRIVATE_SECRET', { status })
      );
      const error = await downloadPublicMedia(link, path).catch((e) => e);
      expect(error.code).toBe(
        status === 429 ? 'DRIVE_DOWNLOAD_LIMIT' : 'DRIVE_ACCESS_DENIED'
      );
      expect(error.message).not.toMatch(/PRIVATE_SECRET|0-KEY/);
    }
  );
  it.each([
    'https://drive.google.com/drive/folders/folder123',
    'https://drive.google.com/file/d/a/view',
    `https://drive.google.com:444/file/d/${id}/view`,
    `https://user@drive.google.com/file/d/${id}/view`,
    `https://docs.google.com/document/d/${id}/edit`,
    `https://drive.google.com/open?id=${id}&id=other`,
  ])('recusa link Drive nao suportado antes de rede: %s', async (url) => {
    await expect(downloadPublicMedia(url, path)).rejects.toMatchObject({
      code: 'DRIVE_LINK_UNSUPPORTED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('nao confunde dominio parecido com Google', () => {
    expect(
      resolveDriveLink(`https://drive.google.com.evil/file/d/${id}/view`)
    ).toBeNull();
  });
  it('revalida redirect e bloqueia destino privado mesmo com opt-out global', async () => {
    const previous = process.env.DISABLE_SSRF_PROTECTION;
    process.env.DISABLE_SSRF_PROTECTION = 'true';
    (isSafePublicHttpsUrl as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://10.0.0.1/secret' },
      })
    );
    try {
      await expect(
        downloadPublicMedia('https://cdn.example/video', path)
      ).rejects.toMatchObject({ reason: 'unsafe' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.DISABLE_SSRF_PROTECTION;
      else process.env.DISABLE_SSRF_PROTECTION = previous;
    }
  });
  it('streaming usa limite real, cancela corpo e nao sobrescreve arquivo existente', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(11)));
    await expect(
      downloadPublicMedia('https://cdn.example/video', path, { maxBytes: 10 })
    ).rejects.toMatchObject({ reason: 'too-large' });
    await expect(
      downloadPublicMedia('https://cdn.example/video', path)
    ).rejects.toBeDefined();
  });
  it('recusa Content-Length excessivo antes de criar arquivo', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('x', { headers: { 'content-length': '11' } })
    );
    await expect(
      downloadPublicMedia('https://cdn.example/video', path, { maxBytes: 10 })
    ).rejects.toMatchObject({ reason: 'too-large' });
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('nao aceita destino externo na cadeia de redirect do Google', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/file' },
      })
    );
    await expect(downloadPublicMedia(link, path)).rejects.toMatchObject({
      reason: 'unsafe',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('grava varios chunks sem juntar o video inteiro e preserva bytes', async () => {
    let counter = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (counter === 80) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(64 * 1024).fill(counter++));
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(body));
    await expect(
      downloadPublicMedia('https://cdn.example/video', path)
    ).resolves.toMatchObject({ size: 80 * 64 * 1024 });
    const bytes = await readFile(path);
    for (let index = 0; index < 80; index++) {
      expect(
        bytes
          .subarray(index * 64 * 1024, (index + 1) * 64 * 1024)
          .equals(Buffer.alloc(64 * 1024, index))
      ).toBe(true);
    }
  });
  it('nao sobrescreve arquivo e preserva erro de interrupcao do corpo', async () => {
    await writeFile(path, 'original');
    await expect(downloadPublicMedia(link, path)).rejects.toBeDefined();
    expect(await readFile(path, 'utf8')).toBe('original');
    await rm(path);
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error('SECRET'));
          },
        })
      )
    );
    await expect(downloadPublicMedia(link, path)).rejects.toMatchObject({
      reason: 'network',
      message: 'Download interrupted',
    });
  });
  it('mantem URL binaria comum sem alterar o endereco', async () => {
    await downloadPublicMedia('https://cdn.example/video.mp4', path);
    expect(fetchMock.mock.calls[0][0]).toBe('https://cdn.example/video.mp4');
  });
});
