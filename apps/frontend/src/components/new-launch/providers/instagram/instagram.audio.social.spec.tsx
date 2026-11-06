import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from 'react-hook-form';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock(
  '@gitroom/frontend/components/launches/helpers/use.custom.provider.function',
  () => ({ useCustomProviderFunction: () => ({ get }) })
);
vi.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => useFormContext(),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
import { InstagramAudioSelector } from './instagram.audio';
function Data() {
  return <output data-testid="saved">{JSON.stringify(useWatch())}</output>;
}
function Harness({
  audio,
  disabled = false,
}: {
  audio?: any;
  disabled?: boolean;
}) {
  const form = useForm({ defaultValues: { audio } });
  return (
    <FormProvider {...form}>
      <InstagramAudioSelector disabled={disabled} />
      <Data />
    </FormProvider>
  );
}
describe('seletor de audio do Reel', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue([
      { id: '123', title: 'Musica teste', artist: 'Autor' },
    ]);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it('restaura selecao e conserva volume zero ao editar', () => {
    render(
      <Harness
        audio={{ id: '123', title: 'Salvo', audio_volume: 0, video_volume: 90 }}
      />
    );
    expect(screen.getByText('Salvo')).toBeTruthy();
    expect(
      (screen.getByLabelText('Audio volume') as HTMLInputElement).value
    ).toBe('0');
    fireEvent.change(screen.getByLabelText('Original video volume'), {
      target: { value: '0' },
    });
    expect(screen.getByTestId('saved').textContent).toContain(
      '"video_volume":0'
    );
  });
  it('busca tendencias e persiste o ID escolhido', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add audio' }));
    await waitFor(() => expect(screen.getByText('Musica teste')).toBeTruthy(), {
      timeout: 3000,
    });
    expect(get).toHaveBeenCalledWith('audioSearch', { q: '', type: 'music' });
    fireEvent.click(screen.getByText('Musica teste'));
    expect(screen.getByTestId('saved').textContent).toContain('"id":"123"');
  });
  it('falha de busca aparece como erro e nao como lista vazia', async () => {
    get.mockResolvedValue({ message: 'Forbidden' });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add audio' }));
    await waitFor(
      () =>
        expect(screen.getByRole('alert').textContent).toContain('Reconnect'),
      { timeout: 3000 }
    );
    expect(screen.queryByText('No audio found')).toBeNull();
  });
  it('selecao incompatível fica visivel e pode ser removida', () => {
    render(<Harness disabled audio={{ id: '123', title: 'Salvo' }} />);
    expect(screen.getByText('Salvo')).toBeTruthy();
    expect(
      (screen.getByLabelText('Audio volume') as HTMLInputElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove audio' }));
    expect(screen.getByTestId('saved').textContent).toBe('{}');
    expect(get).not.toHaveBeenCalled();
  });
  it('oferece previa no Instagram sem selecionar ou salvar o link temporario', async () => {
    get.mockResolvedValue([
      {
        id: '123',
        title: 'Som original',
        artist: 'Criador',
        platformPreviewUrl: 'https://www.instagram.com/reels/audio/123/',
      },
    ]);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add audio' }));
    const link = await screen.findByRole(
      'link',
      { name: 'Listen on Instagram' },
      { timeout: 3000 }
    );
    expect(link.getAttribute('href')).toBe(
      'https://www.instagram.com/reels/audio/123/'
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.getByTestId('saved').textContent).toBe('{}');
    fireEvent.click(screen.getByText('Som original'));
    expect(screen.getByTestId('saved').textContent).not.toContain(
      'platformPreviewUrl'
    );
  });
  it.each([
    undefined,
    'http://instagram.com/audio',
    'https://instagram.com.evil.test/audio',
    'https://u:p@instagram.com/audio',
  ])(
    'explica previa indisponivel e conserva selecao: %s',
    async (platformPreviewUrl) => {
      get.mockResolvedValue([
        {
          id: '123',
          title: 'Sem previa',
          artist: 'Autor',
          platformPreviewUrl,
          previewUrl: 'javascript:alert(1)',
        },
      ]);
      render(<Harness />);
      fireEvent.click(screen.getByRole('button', { name: 'Add audio' }));
      await screen.findByText('Preview unavailable', {}, { timeout: 3000 });
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
      fireEvent.click(screen.getByText('Sem previa'));
      expect(screen.getByTestId('saved').textContent).toContain('123');
    }
  );
  it('falha de reproducao conserva resultados e oferece link alternativo', async () => {
    const pause = vi.fn();
    vi.stubGlobal(
      'Audio',
      vi.fn(function () {
        return {
          pause,
          play: vi.fn().mockRejectedValue(new Error('network')),
          onended: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
      })
    );
    get.mockResolvedValue([
      {
        id: '123',
        title: 'Musica teste',
        artist: 'Autor',
        previewUrl: 'https://cdn.test/a.mp3',
        platformPreviewUrl: 'https://www.instagram.com/reels/audio/123/',
      },
    ]);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add audio' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Play' }, { timeout: 3000 })
    );
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Could not play this preview'
      )
    );
    expect(screen.getByText('Musica teste')).toBeTruthy();
    expect(screen.queryByText(/Reconnect/)).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Listen on Instagram' })
    ).toBeTruthy();
    vi.unstubAllGlobals();
  });
  it('busca nova interrompe previa e ignora play e eventos atrasados', async () => {
    let resolvePlay!: () => void;
    const sounds: any[] = [];
    vi.stubGlobal(
      'Audio',
      vi.fn(function () {
        const sound = {
          pause: vi.fn(),
          play: vi.fn(
            () =>
              new Promise<void>((r) => {
                resolvePlay = r;
              })
          ),
          onended: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        sounds.push(sound);
        return sound;
      })
    );
    get.mockResolvedValue([
      {
        id: '123',
        title: 'Musica teste',
        artist: 'Autor',
        previewUrl: 'https://cdn.test/a.mp3',
      },
    ]);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add audio' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Play' }, { timeout: 3000 })
    );
    fireEvent.change(
      screen.getByLabelText('Search audio (empty shows trending)'),
      { target: { value: 'nova' } }
    );
    expect(sounds[0].pause).toHaveBeenCalled();
    await act(async () => resolvePlay());
    await screen.findByRole('button', { name: 'Play' }, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    vi.unstubAllGlobals();
  });
  it('reproduz e para sem eventos atrasados interromperem o proximo audio', async () => {
    const sounds: any[] = [];
    vi.stubGlobal(
      'Audio',
      vi.fn(function () {
        const sound = {
          pause: vi.fn(),
          play: vi.fn().mockResolvedValue(undefined),
          onended: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        sounds.push(sound);
        return sound;
      })
    );
    get.mockResolvedValue([
      { id: '1', title: 'Primeiro', previewUrl: 'https://cdn.test/1.mp3' },
      { id: '2', title: 'Segundo', previewUrl: 'https://cdn.test/2.mp3' },
    ]);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add audio' }));
    await screen.findByText('Primeiro', {}, { timeout: 3000 });
    await act(async () =>
      fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[0])
    );
    const oldEnd = sounds[0].onended;
    const oldError = sounds[0].onerror;
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    );
    expect(sounds[0].pause).toHaveBeenCalled();
    act(() => {
      oldEnd();
      oldError();
    });
    expect(sounds[1].pause).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(sounds[1].pause).toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Play' })).toHaveLength(2);
  });
  it.each(['close', 'select', 'type', 'disable', 'unmount'])(
    'interrompe play pendente ao %s e ignora rejeicao tardia',
    async (action) => {
      let rejectPlay!: (error: Error) => void;
      const sound = {
        pause: vi.fn(),
        play: vi.fn(
          () =>
            new Promise<void>((_, reject) => {
              rejectPlay = reject;
            })
        ),
        onended: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      vi.stubGlobal(
        'Audio',
        vi.fn(function () {
          return sound;
        })
      );
      get.mockResolvedValue([
        {
          id: '123',
          title: 'Musica teste',
          previewUrl: 'https://cdn.test/a.mp3',
        },
      ]);
      const view = render(<Harness />);
      fireEvent.click(screen.getByRole('button', { name: 'Add audio' }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Play' }, { timeout: 3000 })
      );
      if (action === 'close')
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      if (action === 'select')
        fireEvent.click(screen.getByText('Musica teste'));
      if (action === 'type')
        fireEvent.change(screen.getByRole('combobox'), {
          target: { value: 'original_sound' },
        });
      if (action === 'disable') view.rerender(<Harness disabled />);
      if (action === 'unmount') view.unmount();
      expect(sound.pause).toHaveBeenCalled();
      await act(async () => rejectPlay(new Error('late failure')));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    }
  );
  it('mostra capa na busca e conserva a miniatura apos selecionar', async () => {
    get.mockResolvedValue([
      {
        id: '123',
        title: 'Com capa',
        artist: 'Autor',
        image: 'https://cdn.test/cover.jpg',
      },
    ]);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add audio' }));
    const row = await screen.findByRole(
      'button',
      { name: 'Com capa Autor' },
      { timeout: 3000 }
    );
    const image = row.querySelector('img')!;
    expect(image?.getAttribute('src')).toBe('https://cdn.test/cover.jpg');
    expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');
    fireEvent.click(image);
    expect(screen.getByTestId('saved').textContent).toContain(
      'https://cdn.test/cover.jpg'
    );
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/cover.jpg'
    );
  });
  it('substitui imagem quebrada por icone e recupera a imagem ao mudar o audio', async () => {
    get.mockResolvedValue([
      { id: '2', title: 'Outro', image: 'https://cdn.test/valid.jpg' },
    ]);
    const view = render(
      <Harness
        audio={{
          id: '1',
          title: 'Salvo',
          image: 'https://cdn.test/broken.jpg',
        }}
      />
    );
    const image = view.container.querySelector('img')!;
    expect(image).toBeTruthy();
    fireEvent.error(image);
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change audio' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Outro' }, { timeout: 3000 })
    );
    expect(view.container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/valid.jpg'
    );
  });
  it.each([
    undefined,
    'javascript:alert(1)',
    'http://cdn.test/a.jpg',
    'https://user:secret@cdn.test/a.jpg',
  ])('usa icone para capa ausente ou insegura: %s', (image) => {
    const view = render(<Harness audio={{ id: '1', title: 'Salvo', image }} />);
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.querySelector('svg')).toBeTruthy();
  });
});
