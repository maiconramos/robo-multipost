'use client';
import { useId } from 'react';
import { AutomationMessageVariables } from './shared-message-variables.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/** Both V2 editors write the same messages[] contract. Empty entries stay visible for validation. */
export function SharedReplyVariations({
  messages,
  onChange,
  disabled = false,
  onFocus,
  maxVariants = 10,
  engine = 'shared',
}: {
  messages: string[];
  onChange: (messages: string[]) => void;
  disabled?: boolean;
  onFocus?: (index: number) => void;
  maxVariants?: number | null;
  engine?: 'legacy' | 'shared' | 'zernio';
}) {
  const t = useT(),
    id = useId();
  const entries = messages.length ? messages : [''];
  return (
    <div className="space-y-2">
      {entries.map((message, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <label
              htmlFor={`${id}-${index}`}
              className="block text-sm space-y-1"
            >
              <span className="sr-only">
                {index === 0
                  ? t('shared_public_reply')
                  : `${t('shared_reply_variant')} ${index + 1}`}
              </span>
              <input
                id={`${id}-${index}`}
                type="text"
                disabled={disabled}
                className="w-full h-[42px] border border-newTableBorder rounded-lg pl-[14px] pr-20 bg-newBgColorInner text-[13px] text-textColor"
                placeholder={t('automation_public_reply_placeholder')}
                maxLength={2200}
                value={message}
                onFocus={() => onFocus?.(index)}
                onChange={(event) =>
                  onChange(
                    entries.map((entry, i) =>
                      i === index ? event.target.value : entry
                    )
                  )
                }
              />
            </label>
            <AutomationMessageVariables
              textareaId={`${id}-${index}`}
              engine={engine}
              disabled={disabled}
              resetKey={entries.length}
              onChange={(value) =>
                onChange(
                  entries.map((entry, i) => (i === index ? value : entry))
                )
              }
            />
          </div>
          {entries.length > 1 && (
            <button
              type="button"
              disabled={disabled}
              aria-label={`${t('shared_reply_remove')} ${index + 1}`}
              className="px-2 text-lg text-newTextColor/60 hover:text-btnPrimary disabled:opacity-40"
              onClick={() => onChange(entries.filter((_, i) => i !== index))}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={
            disabled || (!!maxVariants && entries.length >= maxVariants)
          }
          className="text-[12px] text-btnPrimary disabled:opacity-40"
          onClick={() => onChange([...entries, ''])}
        >
          <span aria-hidden="true">+ </span>
          {t('wizard_add_reply_variant')}
        </button>
        {maxVariants && (
          <span className="text-xs text-newTextColor/60">
            {entries.length}/{maxVariants}
          </span>
        )}
      </div>
      {entries.length > 1 && (
        <p className="text-[11px] text-newTextColor/60">
          {t('shared_reply_variations_hint')}
        </p>
      )}
    </div>
  );
}
