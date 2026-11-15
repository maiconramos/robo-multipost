'use client';
import { useId, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { PrivateMessageVariant } from '@gitroom/nestjs-libraries/database/prisma/flows/private-message-variants';
import { AddLinkModal } from './add-link-modal.component';
import { AutomationContextHelp } from './shared-context-help.component';
import { AutomationMessageVariables } from './shared-message-variables.component';
export function PrivateMessageVariations({
  messages,
  onChange,
  variants,
  buttonText,
  buttonUrl,
  onVariantsChange,
  disabled = false,
  onFocus,
  maxLength = 2000,
  maxVariants = 10,
  engine = 'legacy',
  messenger = false,
}: {
  messages: string[];
  variants?: PrivateMessageVariant[];
  buttonText?: string;
  buttonUrl?: string;
  onVariantsChange?: (variants: PrivateMessageVariant[]) => void;
  onChange: (messages: string[]) => void;
  disabled?: boolean;
  onFocus?: (index: number) => void;
  maxLength?: number;
  maxVariants?: number;
  engine?: 'legacy' | 'shared' | 'zernio';
  messenger?: boolean;
}) {
  const t = useT(),
    id = useId();
  const [editingButton, setEditingButton] = useState<number | null>(null);
  const entries: PrivateMessageVariant[] =
    variants ||
    (messages.length ? messages : ['']).map((message) => ({
      message,
      ...(buttonText && buttonUrl ? { buttonText, buttonUrl } : {}),
    }));
  const change = (next: PrivateMessageVariant[]) =>
    variants ? onVariantsChange?.(next) : onChange(next.map((v) => v.message));
  const update = (index: number, value: string) =>
    change(entries.map((v, i) => (i === index ? { ...v, message: value } : v)));
  const setButton = (button?: { buttonText: string; buttonUrl: string }) => {
    onVariantsChange?.(
      entries.map((v, i) =>
        i === editingButton ? { message: v.message, ...button } : v
      )
    );
  };
  return (
    <div className="space-y-3">
      {entries.map((entry, index) => {
        const message = entry.message;
        const limit = entry.buttonText ? 640 : maxLength;
        return (
          <div
            key={index}
            role={entries.length > 1 ? 'group' : undefined}
            aria-label={
              entries.length > 1
                ? `${t('automation_private_variant')} ${index + 1}`
                : undefined
            }
            className={
              entries.length > 1
                ? 'space-y-3 rounded-xl border border-newTableBorder bg-newBgColorInner p-3'
                : 'space-y-2'
            }
          >
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`${id}-${index}`} className="block text-sm">
                {index === 0
                  ? t('shared_message')
                  : `${t('automation_private_variant')} ${index + 1}`}
              </label>
              {entries.length > 1 && (
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`${t('shared_reply_remove')} ${index + 1}`}
                  onClick={() => change(entries.filter((_, i) => i !== index))}
                  className="px-2 text-lg text-newTextColor/60 hover:text-btnPrimary"
                >
                  ×
                </button>
              )}
            </div>
            <textarea
              id={`${id}-${index}`}
              disabled={disabled}
              value={message}
              maxLength={limit}
              rows={4}
              placeholder={t('automation_private_message_placeholder')}
              onFocus={() => onFocus?.(index)}
              onChange={(e) => update(index, e.target.value)}
              className="block w-full rounded-lg border border-newTableBorder bg-newBgColorInner px-3.5 pt-2.5 pb-10 text-[13px] text-textColor resize-y"
            />
            <AutomationMessageVariables
              textareaId={`${id}-${index}`}
              engine={engine}
              messenger={messenger}
              disabled={disabled}
              resetKey={entries.length}
              onChange={(value) => update(index, value)}
            />
            {onVariantsChange && (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onFocus?.(index);
                    setEditingButton(index);
                  }}
                  className="min-w-0 truncate rounded border border-dashed border-newTableBorder px-3.5 py-2 text-xs hover:bg-boxHover disabled:opacity-40"
                >
                  {entry.buttonText && entry.buttonUrl
                    ? `${entry.buttonText} · ${entry.buttonUrl}`
                    : `+ ${t('story_add_link')}`}
                </button>
                <AutomationContextHelp label={t('automation_link_help')}>
                  {t(messenger ? 'messenger_message_hint' : 'shared_link_hint')}
                </AutomationContextHelp>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex justify-between gap-2 text-xs">
        <button
          type="button"
          disabled={disabled || entries.length >= maxVariants}
          className="text-btnPrimary disabled:opacity-40"
          onClick={() => change([...entries, { message: '' }])}
        >
          <span aria-hidden="true">+ </span>
          {t('wizard_add_reply_variant')}
        </button>
        <span className="text-newTextColor/50">
          {entries.length}/{maxVariants}
        </span>
      </div>
      {entries.length > 1 && (
        <p className="text-xs text-newTextColor/60">
          {t('automation_private_variations_hint')}
        </p>
      )}
      <AddLinkModal
        open={editingButton !== null}
        initialText={entries[editingButton ?? 0]?.buttonText}
        initialUrl={entries[editingButton ?? 0]?.buttonUrl}
        maxTextLength={20}
        onClose={() => setEditingButton(null)}
        onSave={(buttonText, buttonUrl) => setButton({ buttonText, buttonUrl })}
        onRemove={() => {
          setButton();
          setEditingButton(null);
        }}
      />
    </div>
  );
}
