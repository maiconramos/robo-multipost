import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { Readable } from 'stream';
import { prepareMcpHttpBody } from './mcp.http.body';

describe('limite HTTP do MCP antes do processamento', () => {
  let server: Server;
  let base: string;
  const processed = jest.fn();
  beforeAll(async () => {
    const app = express();
    app.all('/mcp', async (req, res) => {
      if (req.headers.authorization !== 'Bearer authorized') {
        res.sendStatus(401);
        return;
      }
      if (!(await prepareMcpHttpBody(req, res))) return;
      processed(req.body);
      res.json({
        decodedBytes: req.body?.base64
          ? Buffer.from(req.body.base64, 'base64').length
          : 0,
      });
    });
    app.post('/other', express.json({ limit: '100kb' }), (_req, res) =>
      res.sendStatus(200)
    );
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  beforeEach(() => processed.mockClear());
  const headers = {
    Authorization: 'Bearer authorized',
    'Content-Type': 'application/json',
  };
  it('recebe 6 MiB em base64 sem alterar bytes', async () => {
    const bytes = Buffer.alloc(6 * 1024 ** 2, 7);
    const response = await fetch(base + '/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ base64: bytes.toString('base64') }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ decodedBytes: bytes.length });
    expect(
      Buffer.from(processed.mock.calls[0][0].base64, 'base64').equals(bytes)
    ).toBe(true);
  });
  it.each([false, true])(
    'rejeita corpo maior que 12 MiB antes do processamento, chunked=%s',
    async (chunked) => {
      const body = JSON.stringify({
        secret: 'SECRET',
        padding: 'x'.repeat(12 * 1024 ** 2),
      });
      const response = await fetch(base + '/mcp', {
        method: 'POST',
        headers,
        body: chunked
          ? Readable.from([body.slice(0, 4096), body.slice(4096)])
          : body,
        ...(chunked ? { duplex: 'half' } : {}),
      } as RequestInit);
      expect(response.status).toBe(413);
      expect(JSON.stringify(await response.json())).not.toContain('SECRET');
      expect(processed).not.toHaveBeenCalled();
    }
  );
  it.each([
    ['application/json', '{"secret":"SECRET",', 400],
    ['text/plain', '{"secret":"SECRET"}', 415],
    ['application/json', 'null', 400],
    ['application/json', '', 400],
  ])(
    'recusa JSON/cabecalho invalido sem expor corpo (%s)',
    async (type, body, status) => {
      const response = await fetch(base + '/mcp', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': String(type) },
        body: String(body),
      });
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('SECRET');
      expect(processed).not.toHaveBeenCalled();
    }
  );
  it('recusa codificacao de corpo nao suportada sem repassar erro externo', async () => {
    const response = await fetch(base + '/mcp', {
      method: 'POST',
      headers: { ...headers, 'Content-Encoding': 'gzip' },
      body: 'SECRET',
    });
    expect(response.status).toBe(415);
    expect(JSON.stringify(await response.json())).not.toContain('SECRET');
    expect(processed).not.toHaveBeenCalled();
  });
  it('aplica limite mesmo ao corpo interpretado por middleware anterior', async () => {
    const res: any = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    expect(
      await prepareMcpHttpBody(
        {
          method: 'POST',
          body: { secret: 'SECRET', padding: 'x'.repeat(12 * 1024 ** 2) },
        } as never,
        res
      )
    ).toBe(false);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('SECRET');
  });
  it('nega credencial invalida antes de interpretar o corpo', async () => {
    const response = await fetch(base + '/mcp', {
      method: 'POST',
      headers: { ...headers, Authorization: 'Bearer invalid' },
      body: 'not json',
    });
    expect(response.status).toBe(401);
    expect(processed).not.toHaveBeenCalled();
  });
  it('preserva requisicoes GET e o limite das demais rotas', async () => {
    expect(
      (
        await fetch(base + '/mcp', {
          headers: { Authorization: 'Bearer authorized' },
        })
      ).status
    ).toBe(200);
    const response = await fetch(base + '/other', {
      method: 'POST',
      headers,
      body: JSON.stringify({ padding: 'x'.repeat(200000) }),
    });
    expect(response.status).toBe(413);
  });
});
