import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
vi.mock('@copilotkit/react-core', () => ({
  useCopilotAction: () => {},
  useCopilotReadable: () => {},
}));
vi.mock('./providers/high.order.provider', () => ({
  PostComment: { ALL: 0, POST: 1, COMMENT: 2 },
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
vi.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => true,
}));
vi.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: (): undefined => undefined })
);
vi.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({ uppy: { addFile: vi.fn() } }),
}));
vi.mock('react-dropzone', () => ({
  useDropzone: () => ({ getRootProps: () => ({}), isDragActive: false }),
}));
vi.mock('@uppy/react', () => ({ Dashboard: (): null => null }));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => vi.fn(),
}));
vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));
vi.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ frontEndUrl: 'http://localhost', cloudflareUrl: '' }),
}));
vi.mock('./mention.component', () => ({ suggestion: () => ({}) }));
vi.mock('@gitroom/frontend/components/media/media.component', () => ({
  MultiMediaComponent: (): null => null,
}));
vi.mock('./add.post.button', () => ({
  AddPostButton: () => <button>Add comment</button>,
}));
vi.mock('./delay.component', () => ({
  DelayComponent: () => <span>Delay</span>,
}));
vi.mock('@gitroom/frontend/components/launches/up.down.arrow', () => ({
  UpDownArrow: () => <button>Reorder</button>,
}));
vi.mock('@gitroom/frontend/components/ui/icons', () => ({
  LockIcon: (): null => null,
  ConnectionLineIcon: (): null => null,
  ResetIcon: (): null => null,
  EmojiIcon: (): null => null,
  DelayIcon: (): null => null,
  TrashIcon: ({ onClick }: any) => (
    <button aria-label="Remove comment" onClick={onClick} />
  ),
}));
vi.mock('@gitroom/frontend/components/signature', () => ({
  SignatureBox: (): null => null,
}));
vi.mock('@gitroom/frontend/components/launches/information.component', () => ({
  InformationComponent: (): null => null,
}));
vi.mock('./bold.text', () => ({ BoldText: (): null => null }));
vi.mock('./u.text', () => ({ UText: (): null => null }));
vi.mock('./bullets.component', () => ({ Bullets: (): null => null }));
vi.mock('./heading.component', () => ({ HeadingComponent: (): null => null }));
vi.mock('./a.component', () => ({ AComponent: (): null => null }));
vi.mock('@tiptap/react', async (original) => {
  const actual = await original<any>();
  return {
    ...actual,
    useEditor: (options: any) => ({
      getHTML: () => options.content,
      isActive: () => false,
      commands: {},
      text: options.content,
    }),
    EditorContent: ({ editor }: any) => <div>{editor.text}</div>,
  };
});
import { EditorWrapper } from './editor';
import { useLaunchStore } from './store';
afterEach(cleanup);
describe('recuperacao de comentarios antigos em Story', () => {
  it('mantem blocos visiveis e remove somente do canal sem adicionar novos', async () => {
    const integration = {
      id: 'facebook',
      identifier: 'facebook',
      additionalSettings: '[]',
      editor: 'normal',
    } as any;
    const root = {
      id: 'root',
      content: 'Story body',
      media: [] as never[],
      delay: 0,
    };
    const extra = {
      id: 'extra',
      content: 'Legacy comment',
      media: [] as never[],
      delay: 0,
    };
    const global = [
      {
        id: 'global',
        content: 'Global preserved',
        media: [] as never[],
        delay: 0,
      },
    ];
    useLaunchStore.setState({
      current: 'facebook',
      loaded: true,
      comments: false,
      editor: 'normal',
      internal: [{ integration, integrationValue: [root, extra] }],
      integrations: [integration],
      selectedIntegrations: [{ integration, settings: { post_type: 'story' } }],
      global,
      totalChars: 63206,
      dummy: false,
      isCreateSet: false,
      chars: {},
    });
    render(<EditorWrapper totalPosts={2} value="" />);
    const comment = screen.getByText('Legacy comment');
    expect(comment.closest('.hidden')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add comment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reorder' })).toBeNull();
    expect(useLaunchStore.getState().internal[0].integrationValue).toHaveLength(
      2
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove comment' }));
    await waitFor(() =>
      expect(
        useLaunchStore.getState().internal[0].integrationValue
      ).toHaveLength(1)
    );
    expect(
      useLaunchStore.getState().internal[0].integrationValue[0].content
    ).toBe('Story body');
    expect(useLaunchStore.getState().global).toEqual(global);
  });
});
