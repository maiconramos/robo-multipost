import { DiscordProvider } from './discord.provider';
describe('DiscordProvider.handleErrors', () => {
  it('token do bot recusado vira erro acionavel sem pedir reconexao', () => {
    expect(new DiscordProvider().handleErrors('401: Unauthorized')).toEqual({
      type: 'bad-body',
      value: expect.stringMatching(/bot token/i),
    });
  });
  it('mantem retentativa para limite de requisicoes', () => {
    expect(new DiscordProvider().handleErrors('20028')).toMatchObject({
      type: 'retry',
    });
  });
});

describe('DiscordProvider.post - canal preso ao servidor conectado', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  const post = (channel: unknown) => [
    { id: 'p1', message: 'oi', media: [], settings: { channel } } as any,
  ];

  it('recusa canal que nao e id numerico sem chamar a API', async () => {
    global.fetch = jest.fn() as any;
    await expect(
      new DiscordProvider().post('guild-1', 'tok', post('../users/@me'))
    ).rejects.toMatchObject({ type: 'bad_body' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('recusa canal de outro servidor (bot compartilhado entre orgs)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '222222', guild_id: '999999' }),
      text: async () => '',
      clone() { return this; },
    }) as any;
    await expect(
      new DiscordProvider().post('111111', 'tok', post('222222'))
    ).rejects.toMatchObject({ type: 'bad_body' });
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });
});
