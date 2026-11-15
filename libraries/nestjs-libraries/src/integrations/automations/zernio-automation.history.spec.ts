import { zernioHistory } from './zernio-automation.history';
const scope = { organizationId: 'o', profileId: 'p' };
const base = {
  scope,
  flowId: 'f',
  integrationId: 'ig',
  accountName: 'Conta',
  query: {},
};
const log = (id: string, status = 'sent') => ({
  id,
  commenterName: 'Ana',
  commenterId: 'actor',
  commentText: 'LINK',
  status,
  createdAt: '2026-11-14T12:00:00Z',
});
describe('historico Zernio normalizado', () => {
  it('nao inventa texto enviado nem confirma leitura', async () => {
    const read = jest
      .fn()
      .mockResolvedValue({ logs: [log('1')], pagination: { hasMore: false } });
    const page: any = await zernioHistory({ ...base, read });
    const detail: any = await zernioHistory({
      ...base,
      read,
      executionId: page.items[0].id,
    });
    expect(detail.steps.find((s: any) => s.kind === 'SEND_DM')).toMatchObject({
      status: 'accepted',
      message: null,
      at: null,
    });
    expect(detail.technical).toMatchObject({
      engine: 'zernio',
      revision: null,
    });
  });
  it('filtra situacao e datas, sem usar texto de erro remoto', async () => {
    const page: any = await zernioHistory({
      ...base,
      query: { status: 'failed' },
      read: jest.fn().mockResolvedValue({
        logs: [log('1'), { ...log('2', 'failed'), error: 'secret' }],
        pagination: { hasMore: false },
      }),
    });
    expect(page.items).toHaveLength(1);
    expect(JSON.stringify(page)).not.toContain('secret');
  });
  it('vincula cursor ao perfil, regra e filtros', async () => {
    const read = jest.fn().mockResolvedValue({
      logs: [log('1'), log('2')],
      pagination: { hasMore: false },
    });
    const page: any = await zernioHistory({
      ...base,
      query: { limit: 1 },
      read,
    });
    await expect(
      zernioHistory({
        ...base,
        scope: { ...scope, profileId: 'other' },
        query: { cursor: page.nextCursor },
        read,
      })
    ).rejects.toThrow('INVALID_HISTORY_CURSOR');
  });
  it('recusa detalhe de outra regra sem consultar ids externos diretamente', async () => {
    const read = jest
      .fn()
      .mockResolvedValue({ logs: [log('1')], pagination: { hasMore: false } });
    await expect(
      zernioHistory({ ...base, read, executionId: 'foreign' })
    ).rejects.toThrow('INVALID_EXECUTION_ID');
  });
});

it('atravessa ancora no fim do lote e preserva todos os registros', async () => {
  const logs = Array.from({ length: 125 }, (_, i) => log(String(i)));
  const read = jest.fn(async (skip: number, limit: number) => ({
    logs: logs.slice(skip, skip + limit),
    pagination: { hasMore: skip + limit < logs.length },
  }));
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
    const page: any = await zernioHistory({
      ...base,
      query: { limit: 25, cursor },
      read,
    });
    ids.push(
      ...page.items.map(
        (i: any) => JSON.parse(Buffer.from(i.id, 'base64url').toString()).id
      )
    );
    cursor = page.nextCursor;
  }
  expect(ids).toEqual(logs.map((l) => l.id));
  expect(cursor).toBeNull();
});
it('reencontra ancora apos novos logs sem repetir execucoes e abre detalhe antigo', async () => {
  const logs = Array.from({ length: 1400 }, (_, i) => log(String(i)));
  const read = jest.fn(async (skip: number, limit: number) => ({
    logs: logs.slice(skip, skip + limit),
    pagination: { hasMore: skip + limit < logs.length },
  }));
  let cursor: string | undefined;
  let page: any;
  for (let i = 0; i < 45; i++) {
    page = await zernioHistory({ ...base, query: { limit: 25, cursor }, read });
    cursor = page.nextCursor;
  }
  logs.unshift(log('new'));
  const next: any = await zernioHistory({
    ...base,
    query: { limit: 25, cursor },
    read,
  });
  expect(
    JSON.parse(Buffer.from(next.items[0].id, 'base64url').toString()).id
  ).toBe('1125');
  const detail: any = await zernioHistory({
    ...base,
    read,
    executionId: page.items[0].id,
  });
  expect(detail.id).toBe(page.items[0].id);
});
