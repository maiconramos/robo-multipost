import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useFormContext } from 'react-hook-form';
const { state, setComments } = vi.hoisted(() => {
  const setComments = vi.fn();
  return {
    setComments,
    state: {
      current: 'channel',
      channelDates: {},
      tab: 1,
      date: '2026-12-01',
      global: [{ id: 'root', content: 'Root', media: [] as never[] }],
      internal: [],
      dummy: false,
      integrations: [],
      selectedIntegrations: [
        {
          integration: {
            id: 'channel',
            identifier: 'facebook',
            additionalSettings: '[]',
            editor: 'normal',
          },
          settings: { post_type: 'post' },
        },
      ],
      setComments,
      setCurrent: vi.fn(),
      setHide: vi.fn(),
      setTotalChars: vi.fn(),
      setPostComment: vi.fn(),
      setEditor: vi.fn(),
      setInlineImages: vi.fn(),
      setChars: vi.fn(),
    },
  };
});
vi.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: any) => select(state),
}));
vi.mock('zustand/react/shallow', () => ({
  useShallow: (select: any) => select,
}));
vi.mock('swr', () => ({
  default: () => ({
    data: { internalPlugs: [] as unknown[] },
    isLoading: false,
  }),
}));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => vi.fn(),
}));
vi.mock(
  '@gitroom/frontend/components/new-launch/media.settings.values',
  () => ({ useMediaSettingsValues: (): never[] => [] })
);
vi.mock(
  '@gitroom/frontend/components/launches/general.preview.component',
  () => ({ GeneralPreviewComponent: (): null => null })
);
vi.mock('@gitroom/frontend/components/launches/internal.channels', () => ({
  InternalChannels: (): null => null,
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
import { withProvider, PostComment } from '../high.order.provider';
import { facebookAllowsComments } from '@gitroom/nestjs-libraries/integrations/social/facebook.story-comments';
function Settings() {
  const { register } = useFormContext();
  return (
    <select aria-label="Type" {...register('post_type')}>
      <option value="post">Post</option>
      <option value="story">Story</option>
    </select>
  );
}
const Provider = withProvider<{ post_type: string }>({
  comments: (settings, identifier) =>
    facebookAllowsComments(settings, identifier),
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  defaults: { post_type: 'post' },
  SettingsComponent: Settings,
});
afterEach(() => {
  cleanup();
  setComments.mockClear();
  document.getElementById('social-settings')?.remove();
});
describe('capacidade reativa de comentarios no canal', () => {
  it('desliga ao trocar para Story e religa ao voltar para post sem apagar blocos', async () => {
    const portal = document.createElement('div');
    portal.id = 'social-settings';
    document.body.appendChild(portal);
    render(<Provider id="channel" />);
    await waitFor(() => expect(setComments).toHaveBeenLastCalledWith(true));
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'story' },
    });
    await waitFor(() => expect(setComments).toHaveBeenLastCalledWith(false));
    expect(state.global).toEqual([
      { id: 'root', content: 'Root', media: [] as never[] },
    ]);
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'post' },
    });
    await waitFor(() => expect(setComments).toHaveBeenLastCalledWith(true));
  });
});
