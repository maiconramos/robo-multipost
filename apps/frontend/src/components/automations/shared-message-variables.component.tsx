'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker, { Categories, EmojiStyle, Theme } from 'emoji-picker-react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
type TextField = HTMLInputElement | HTMLTextAreaElement;
/** Focus tools for message fields. Tokens stay scoped to the actual execution engine. */
export function AutomationMessageVariables({
  textareaId,
  onChange,
  disabled = false,
  engine = 'legacy',
  messenger = false,
  variables = true,
  resetKey,
}: {
  textareaId: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  engine?: 'legacy' | 'shared' | 'zernio';
  messenger?: boolean;
  variables?: boolean;
  resetKey?: unknown;
}) {
  const t = useT(),
    id = useId();
  const root = useRef<HTMLDivElement>(null),
    bar = useRef<HTMLDivElement>(null),
    popup = useRef<HTMLDivElement>(null),
    field = useRef<TextField | null>(null);
  const selection = useRef({ start: 0, end: 0 });
  const [visible, setVisible] = useState(false),
    [menu, setMenu] = useState<'emoji' | 'variables' | null>(null),
    [length, setLength] = useState(0),
    [limitError, setLimitError] = useState(false),
    [position, setPosition] = useState({ top: 0, left: 0 });
  const remember = () => {
    const el = field.current;
    if (el) {
      selection.current = {
        start: el.selectionStart ?? el.value.length,
        end: el.selectionEnd ?? el.value.length,
      };
      setLength(el.value.length);
    }
  };
  useEffect(() => {
    const el = document.getElementById(textareaId);
    if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement))
      return;
    field.current = el;
    const focus = () => {
      if (!disabled && !el.matches(':disabled') && !el.readOnly) {
        remember();
        setVisible(true);
      }
    };
    const inside = (node: EventTarget | null) =>
      node instanceof Node &&
      (node === el ||
        root.current?.contains(node) ||
        popup.current?.contains(node));
    const focusIn = (e: FocusEvent) => {
      if (!inside(e.target)) {
        setVisible(false);
        setMenu(null);
      } else if (!disabled && !el.matches(':disabled')) setVisible(true);
    };
    const outside = (e: PointerEvent) => {
      if (!inside(e.target)) {
        setVisible(false);
        setMenu(null);
      }
    };
    el.addEventListener('focus', focus);
    for (const event of [
      'select',
      'keyup',
      'mouseup',
      'input',
      'change',
      'blur',
    ])
      el.addEventListener(event, remember);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('pointerdown', outside, true);
    return () => {
      el.removeEventListener('focus', focus);
      for (const event of [
        'select',
        'keyup',
        'mouseup',
        'input',
        'change',
        'blur',
      ])
        el.removeEventListener(event, remember);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('pointerdown', outside, true);
      field.current = null;
    };
  }, [textareaId, disabled]);
  useLayoutEffect(() => {
    setMenu(null);
    setLimitError(false);
    if (disabled) setVisible(false);
  }, [resetKey, disabled, textareaId]);
  const restore = () => {
    const el = field.current;
    if (!el || !el.isConnected || disabled || el.matches(':disabled')) return;
    const desired = { ...selection.current };
    el.focus({ preventScroll: true });
    el.setSelectionRange(desired.start, desired.end);
    selection.current = desired;
  };
  useEffect(() => {
    if (!menu) return;
    popup.current
      ?.querySelector<HTMLElement>(menu === 'emoji' ? 'input' : 'button')
      ?.focus({ preventScroll: true });
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMenu(null);
        restore();
      }
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [menu]);
  useLayoutEffect(() => {
    if (!menu) return;
    const place = () => {
      const a = bar.current?.getBoundingClientRect(),
        p = popup.current?.getBoundingClientRect();
      if (!a || !p) return;
      setPosition({
        left: Math.max(
          8,
          Math.min(a.right - p.width, window.innerWidth - p.width - 8)
        ),
        top: Math.max(
          8,
          a.bottom + 8 + p.height <= window.innerHeight
            ? a.bottom + 8
            : a.top - p.height - 8
        ),
      });
    };
    place();
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(place)
        : undefined;
    if (popup.current) observer?.observe(popup.current);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [menu]);
  const insert = (text: string) => {
    const el = field.current;
    if (
      !el ||
      !el.isConnected ||
      disabled ||
      el.matches(':disabled') ||
      el.readOnly
    )
      return;
    const { start, end } = selection.current;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setMenu(null);
    if (
      el.hasAttribute('maxlength') &&
      el.maxLength >= 0 &&
      next.length > el.maxLength
    ) {
      setLimitError(true);
      restore();
      return;
    }
    setLimitError(false);
    selection.current = {
      start: start + text.length,
      end: start + text.length,
    };
    setLength(next.length);
    onChange(next);
    requestAnimationFrame(() => restore());
  };
  const names =
    engine === 'zernio'
      ? ['name', 'first_name', 'username']
      : engine === 'legacy'
      ? ['commenter_name', 'commenter_id', 'comment_text', 'media_id']
      : messenger
      ? ['comment_text', 'comment_id']
      : ['comment_name', 'comment_text', 'comment_id', 'media_id'];
  const token = (name: string) =>
    engine === 'legacy' ? `{${name}}` : `{{${name}}}`;
  const label = (name: string) =>
    t(
      `automation_variable_${
        messenger && engine === 'shared'
          ? name === 'comment_text'
            ? 'message_text'
            : 'message_id'
          : name
      }`
    );
  return (
    <div ref={root} className="relative h-0">
      {visible && !disabled && (
        <div
          ref={bar}
          role="toolbar"
          aria-label={t('automation_text_tools')}
          className="absolute right-2 bottom-2 z-10 flex items-center gap-0.5 rounded-md bg-zinc-800 px-1 py-0.5 text-white shadow-md"
        >
          <button
            type="button"
            aria-label={t('insert_emoji')}
            aria-haspopup="dialog"
            aria-expanded={menu === 'emoji'}
            aria-controls={menu === 'emoji' ? id : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setLimitError(false);
              setMenu(menu === 'emoji' ? null : 'emoji');
            }}
            className="rounded p-1 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg
              aria-hidden="true"
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M8 14s1 3 4 3 4-3 4-3M8 8h.01M16 8h.01" />
            </svg>
          </button>
          {variables && (
            <button
              type="button"
              aria-label={t('automation_insert_variable')}
              aria-haspopup="dialog"
              aria-expanded={menu === 'variables'}
              aria-controls={menu === 'variables' ? id : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setLimitError(false);
                setMenu(menu === 'variables' ? null : 'variables');
              }}
              className="rounded p-1 font-mono text-sm hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
            >
              {'{}'}
            </button>
          )}
          <span
            className="px-1 text-[11px] tabular-nums"
            aria-label={t('automation_text_count')}
          >
            {length}
            {field.current?.hasAttribute('maxlength') &&
            field.current.maxLength >= 0
              ? `/${field.current.maxLength}`
              : ''}
          </span>
        </div>
      )}
      {visible && limitError && (
        <span
          role="status"
          className="absolute right-2 top-0 z-10 rounded bg-newBgColorInner px-2 py-1 text-xs text-btnPrimary shadow"
        >
          {t('automation_text_limit')}
        </span>
      )}
      {menu &&
        !disabled &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="dialog"
            aria-label={t(
              menu === 'emoji' ? 'insert_emoji' : 'automation_insert_variable'
            )}
            style={{ position: 'fixed', ...position }}
            className="z-[10001] w-[min(320px,calc(100vw-16px))] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-newTableBorder bg-newBgColorInner text-textColor shadow-xl"
          >
            {menu === 'emoji' ? (
              <EmojiPicker
                emojiStyle={EmojiStyle.NATIVE}
                width="100%"
                height={340}
                theme={
                  document.documentElement.classList.contains('dark') ||
                  !!root.current?.closest('.dark')
                    ? Theme.DARK
                    : Theme.LIGHT
                }
                searchPlaceholder={t('automation_emoji_search')}
                searchClearButtonLabel={t('automation_emoji_clear')}
                skinTonesDisabled
                autoFocusSearch={false}
                previewConfig={{ showPreview: false }}
                categories={Object.values(Categories)
                  .filter((c) => c !== Categories.CUSTOM)
                  .map((category) => ({
                    category,
                    name: t(`automation_emoji_${category}`),
                  }))}
                onEmojiClick={(e) => insert(e.emoji)}
              />
            ) : (
              <div className="p-2 space-y-1">
                {names.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={label(name)}
                    onClick={() => insert(token(name))}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-boxHover focus-visible:ring-2 focus-visible:ring-btnPrimary"
                  >
                    <span>{label(name)}</span>
                    <code
                      aria-hidden="true"
                      className="text-[10px] text-newTextColor/60"
                    >
                      {token(name)}
                    </code>
                  </button>
                ))}
              </div>
            )}
          </div>,
          root.current?.closest('dialog') || document.body
        )}
    </div>
  );
}
