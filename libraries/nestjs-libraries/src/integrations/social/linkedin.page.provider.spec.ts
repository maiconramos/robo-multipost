import dayjs from 'dayjs';
import { LinkedinPageProvider } from './linkedin.page.provider';

describe('LinkedinPageProvider', () => {
  const originalFetch = global.fetch;
  let provider: LinkedinPageProvider;

  beforeEach(() => {
    provider = new LinkedinPageProvider();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('lista Super Admin e Content Admin e ignora ACL sem decoracao', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        elements: [
          {
            role: 'ADMINISTRATOR',
            organizationalTarget: 'urn:li:organization:1',
            'organizationalTarget~': {
              localizedName: 'Super Page',
              vanityName: 'super-page',
            },
          },
          {
            role: 'CONTENT_ADMINISTRATOR',
            organizationalTarget: 'urn:li:organization:2',
            'organizationalTarget~': {
              localizedName: 'Content Page',
              vanityName: 'content-page',
            },
          },
          {
            role: 'VIEWER',
            organizationalTarget: 'urn:li:organization:3',
            'organizationalTarget~': {
              localizedName: 'Viewer Page',
              vanityName: 'viewer-page',
            },
          },
          {
            role: 'ADMINISTRATOR',
            organizationalTarget: 'urn:li:organization:4',
          },
        ],
      }),
    }) as jest.Mock;

    await expect(provider.companies('token')).resolves.toEqual([
      expect.objectContaining({ id: '1', name: 'Super Page' }),
      expect.objectContaining({ id: '2', name: 'Content Page' }),
    ]);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('state=APPROVED'),
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('elements*(role,'),
      expect.any(Object)
    );
  });

  it('consulta estatistica vitalicia do post sem timeIntervals', async () => {
    const calls: string[] = [];
    jest.spyOn(provider as any, 'analyticsFetch').mockImplementation(async (url) => {
      calls.push(String(url));
      if (String(url).includes('organizationalEntityShareStatistics')) {
        return {
          json: async () => ({
            elements: [
              {
                totalShareStatistics: {
                  impressionCount: 12,
                  uniqueImpressionsCount: 10,
                  clickCount: 2,
                  likeCount: 3,
                  commentCount: 1,
                  shareCount: 1,
                  engagement: 0.5,
                },
              },
            ],
          }),
        } as Response;
      }

      return {
        json: async () => ({
          likesSummary: { totalLikes: 3 },
          commentsSummary: { totalFirstLevelComments: 1 },
        }),
      } as Response;
    });

    const analytics = await provider.postAnalytics(
      'organization-1',
      'token',
      'urn:li:share:1',
      30
    );

    expect(calls[0]).not.toContain('timeIntervals');
    expect(analytics).toContainEqual(
      expect.objectContaining({
        label: 'Impressions',
        data: [{ total: 12, date: dayjs().format('YYYY-MM-DD') }],
      })
    );
  });
});
