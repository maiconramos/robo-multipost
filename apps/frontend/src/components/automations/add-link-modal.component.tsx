'use client';

import { FC, useEffect, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface Props {
  open: boolean;
  initialText?: string;
  initialUrl?: string;
  onSave: (text: string, url: string) => void;
  onClose: () => void;
}

export const AddLinkModal: FC<Props> = ({
  open,
  initialText,
  initialUrl,
  onSave,
  onClose,
}) => {
  const t = useT();
  const [text, setText] = useState(initialText || '');
  const [url, setUrl] = useState(initialUrl || '');

  useEffect(() => {
    if (open) {
      setText(initialText || '');
      setUrl(initialUrl || '');
    }
  }, [open, initialText, initialUrl]);

  if (!open) return null;

  const canSave = text.trim().length > 0 && url.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-[16px]">
      <div className="bg-newBgColorInner border border-fifth rounded-[8px] w-full max-w-[420px] overflow-hidden">
        <div className="flex items-center justify-between px-[20px] py-[14px] border-b border-fifth">
          <h3 className="text-[14px] font-semibold text-textColor">
            {t('add_link_title', 'Adicionar um link')}
          </h3>
          <button
            onClick={onClose}
            className="text-customColor18 hover:text-textColor text-[20px] leading-none px-[4px]"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-[12px] p-[20px]">
          <div className="flex flex-col gap-[6px]">
            <label className="text-[12px] text-textColor">
              {t('add_link_button_text', 'Texto do botao')}
            </label>
            <div className="bg-newBgColorInner h-[38px] border-newTableBorder border rounded-[8px] flex items-center">
              <input
                type="text"
                className="h-full bg-transparent outline-none flex-1 text-[13px] text-textColor px-[14px]"
                placeholder={t(
                  'add_link_button_placeholder',
                  'Por exemplo: Abrir'
                )}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-[6px]">
            <label className="text-[12px] text-textColor">
              {t('add_link_url', 'Link')}
            </label>
            <div className="bg-newBgColorInner h-[38px] border-newTableBorder border rounded-[8px] flex items-center">
              <input
                type="url"
                className="h-full bg-transparent outline-none flex-1 text-[13px] text-textColor px-[14px]"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-[8px] px-[20px] py-[12px] border-t border-fifth">
          <button
            onClick={onClose}
            className="rounded-[4px] border border-fifth bg-btnSimple px-[14px] py-[7px] text-[12px] text-textColor hover:opacity-80"
          >
            {t('cancel', 'Cancelar')}
          </button>
          <button
            onClick={() => {
              if (!canSave) return;
              onSave(text.trim(), url.trim());
              onClose();
            }}
            disabled={!canSave}
            className="rounded-[4px] bg-btnPrimary px-[14px] py-[7px] text-[12px] text-white hover:opacity-80 disabled:opacity-50"
          >
            {t('save', 'Salvar')}
          </button>
        </div>
      </div>
    </div>
  );
};
