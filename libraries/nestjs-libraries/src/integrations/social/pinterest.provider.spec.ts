import 'reflect-metadata';
import { PinterestProvider } from './pinterest.provider';

describe('PinterestProvider.handleErrors', () => {
  let provider: PinterestProvider;

  beforeEach(() => {
    provider = new PinterestProvider();
  });

  it('deve mapear maxItems=5 para bad-body com mensagem amigavel', () => {
    const result = provider.handleErrors(
      'pinterest api error: constraint: maxItems=5 violated'
    );

    expect(result).toEqual({
      type: 'bad-body',
      value: 'You can upload a maximum of 5 images per post on Pinterest.',
    });
  });

  it('deve manter o mapeamento de cover_image obrigatorio', () => {
    const result = provider.handleErrors(
      'missing cover_image_url or cover_image_content_type'
    );

    expect(result?.type).toBe('bad-body');
  });

  it('deve retornar undefined para erro desconhecido', () => {
    expect(provider.handleErrors('algum erro qualquer')).toBeUndefined();
  });
});
