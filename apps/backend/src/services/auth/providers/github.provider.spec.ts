import { GithubProvider } from './github.provider';

const mockFetch = (userJson: any, emailsJson: any) => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({ json: async () => userJson })
    .mockResolvedValueOnce({ json: async () => emailsJson });
  (global as any).fetch = fetchMock;
  return fetchMock;
};

describe('GithubProvider.getUser', () => {
  let provider: GithubProvider;
  const originalFetch = global.fetch;

  beforeEach(() => {
    provider = new GithubProvider();
  });

  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  it('seleciona o email primario e verificado, ignorando secundarios', async () => {
    mockFetch({ id: 123 }, [
      { email: 'secondary@x.com', primary: false, verified: true },
      { email: 'unverified@x.com', primary: true, verified: false },
      { email: 'primary@x.com', primary: true, verified: true },
    ]);

    const result = await provider.getUser('token');

    expect(result).toEqual({ email: 'primary@x.com', id: '123' });
  });

  it('lanca quando nao ha email primario verificado', async () => {
    mockFetch({ id: 123 }, [
      { email: 'victim@company.com', primary: true, verified: false },
      { email: 'other@x.com', primary: false, verified: true },
    ]);

    await expect(provider.getUser('token')).rejects.toThrow();
  });

  it('lanca quando a lista de emails vem vazia', async () => {
    mockFetch({ id: 123 }, []);

    await expect(provider.getUser('token')).rejects.toThrow();
  });
});
