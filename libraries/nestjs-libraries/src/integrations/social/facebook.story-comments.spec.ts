import 'reflect-metadata';
import { FacebookProvider } from './facebook.provider';
import {
  facebookAllowsComments,
  facebookStoryCommentError,
  FACEBOOK_STORY_COMMENTS_ERROR,
} from './facebook.story-comments';
describe('comentarios apos Stories Facebook', () => {
  it.each(['facebook', 'zernio-facebook'])(
    'bloqueia blocos extras somente no Story: %s',
    (identifier) => {
      expect(facebookAllowsComments({ post_type: 'story' }, identifier)).toBe(
        false
      );
      expect(
        facebookStoryCommentError({ post_type: 'story' }, 2, identifier)
      ).toBe(FACEBOOK_STORY_COMMENTS_ERROR);
      expect(
        facebookStoryCommentError({ post_type: 'story' }, 1, identifier)
      ).toBeUndefined();
      expect(
        facebookStoryCommentError({ post_type: 'post' }, 2, identifier)
      ).toBeUndefined();
    }
  );
  it('nao trata Story de outra rede como Facebook', () => {
    expect(
      facebookStoryCommentError({ post_type: 'story' }, 2, 'instagram')
    ).toBeUndefined();
  });
  it('provider recusa Story com varios blocos antes de qualquer envio', async () => {
    const provider = new FacebookProvider();
    const fetch = jest.spyOn(provider, 'fetch');
    await expect(
      provider.post('page', 'TOKEN', [
        {
          id: 'root',
          message: '',
          media: [{ path: 'a.jpg' }],
          settings: { post_type: 'story' },
        },
        {
          id: 'comment',
          message: 'extra',
          media: [],
          settings: { post_type: 'story' },
        },
      ] as any)
    ).rejects.toThrow(/Stories do Facebook/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('provider recusa comentario de Story com orientacao sem reconexao', async () => {
    const provider = new FacebookProvider();
    const fetch = jest.spyOn(provider, 'fetch');
    await expect(
      provider.comment(
        'page',
        'story',
        undefined,
        'TOKEN',
        [
          {
            id: 'comment',
            message: 'extra',
            media: [],
            settings: { post_type: 'story' },
          },
        ] as any,
        {} as any
      )
    ).rejects.toThrow(FACEBOOK_STORY_COMMENTS_ERROR);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('provider conserva comentarios em publicacao normal', async () => {
    const provider = new FacebookProvider();
    const fetch = jest.spyOn(provider, 'fetch').mockResolvedValue({
      json: async () => ({
        id: 'comment',
        permalink_url: 'https://facebook.com/comment',
      }),
    } as any);
    await expect(
      provider.comment(
        'page',
        'post',
        undefined,
        'TOKEN',
        [
          {
            id: 'comment',
            message: 'extra',
            media: [],
            settings: { post_type: 'post' },
          },
        ] as any,
        {} as any
      )
    ).resolves.toEqual([expect.objectContaining({ postId: 'comment' })]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
