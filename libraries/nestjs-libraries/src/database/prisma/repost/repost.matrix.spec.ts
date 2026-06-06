import {
  formatsForProvider,
  formatsForSourceType,
  isDestinationCompatible,
} from './repost.matrix';

describe('repost.matrix', () => {
  describe('formatsForProvider', () => {
    it('deve expor FACEBOOK_REEL e FACEBOOK_STORY para o facebook', () => {
      const formats = formatsForProvider('facebook');
      expect(formats).toContain('FACEBOOK_REEL');
      expect(formats).toContain('FACEBOOK_STORY');
    });

    it('deve retornar lista vazia para provider sem destinos mapeados', () => {
      expect(formatsForProvider('unknown-provider')).toEqual([]);
    });
  });

  describe('formatsForSourceType', () => {
    it('INSTAGRAM_STORY deve poder ir para FACEBOOK_STORY', () => {
      expect(formatsForSourceType('INSTAGRAM_STORY')).toContain(
        'FACEBOOK_STORY'
      );
    });

    it('INSTAGRAM_POST deve poder ir para FACEBOOK_STORY', () => {
      expect(formatsForSourceType('INSTAGRAM_POST')).toContain('FACEBOOK_STORY');
    });
  });

  describe('isDestinationCompatible', () => {
    it('deve aceitar repost de story do IG para story do Facebook', () => {
      expect(
        isDestinationCompatible('INSTAGRAM_STORY', 'facebook', 'FACEBOOK_STORY')
      ).toBe(true);
    });

    it('deve aceitar repost de post do IG para story do Facebook', () => {
      expect(
        isDestinationCompatible('INSTAGRAM_POST', 'facebook', 'FACEBOOK_STORY')
      ).toBe(true);
    });

    it('nao deve aceitar formato em provider que nao o suporta', () => {
      expect(
        isDestinationCompatible('INSTAGRAM_STORY', 'tiktok', 'FACEBOOK_STORY')
      ).toBe(false);
    });
  });
});
