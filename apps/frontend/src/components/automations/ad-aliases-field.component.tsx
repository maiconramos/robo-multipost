'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import SafeImage from '@gitroom/react/helpers/safe.image';
import {
  createInboxActions,
  useAliases,
  useAliasLookup,
  type FlowMediaAliasItem,
} from './hooks/use-unmatched-comments';

interface AdAliasesFieldProps {
  flowId: string | null;
  integrationId: string | null;
}

interface AliasPreviewRowProps {
  alias: FlowMediaAliasItem;
  flowId: string;
  integrationId: string;
  onRemove: () => void;
}

const AliasPreviewRow: FC<AliasPreviewRowProps> = ({
  alias,
  flowId,
  integrationId,
  onRemove,
}) => {
  const t = useT();
  const { data: lookup } = useAliasLookup(integrationId, alias.aliasMediaId);
  const otherFlows = (lookup ?? []).filter((l) => l.flowId !== flowId);

  return (
    <div className="flex gap-[10px] p-[10px] rounded-[6px] border border-fifth bg-newBgColorInner items-start">
      <div className="w-[56px] h-[56px] rounded-[4px] bg-sixth flex-shrink-0 overflow-hidden flex items-center justify-center border border-fifth">
        {alias.thumbnailUrl ? (
          <SafeImage
            src={alias.thumbnailUrl}
            alt=""
            width={56}
            height={56}
            className="w-full h-full object-cover"
          />
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-customColor18"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
        {alias.caption && (
          <p
            className="text-[12px] text-textColor leading-snug overflow-hidden"
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
            }}
          >
            {alias.caption}
          </p>
        )}
        <p className="text-[11px] text-customColor18 truncate font-mono">
          {alias.aliasMediaId}
        </p>
        {alias.permalink ? (
          <a
            href={alias.permalink}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-btnPrimary hover:underline inline-flex items-center gap-[4px] w-fit"
          >
            {t('logs_open_post', 'Abrir post')}
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </a>
        ) : (
          <span className="text-[11px] text-customColor18 italic">
            {t('logs_preview_loading', 'Carregando preview...')}
          </span>
        )}
        {otherFlows.length > 0 && (
          <p className="text-[11px] text-orange-400">
            {t(
              'logs_already_bound_warning',
              'Este post também está vinculado a {{name}}'
            ).replace('{{name}}', otherFlows.map((o) => o.flow.name).join(', '))}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-[12px] text-red-400 hover:text-red-300 flex-shrink-0"
        aria-label={t('remove', 'Remover')}
      >
        {t('remove', 'Remover')}
      </button>
    </div>
  );
};

export const AdAliasesField: FC<AdAliasesFieldProps> = ({
  flowId,
  integrationId,
}) => {
  const t = useT();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const [pasteValue, setPasteValue] = useState('');

  const { data: aliases, mutate: mutateAliases } = useAliases(flowId);

  const actions = useMemo(
    () =>
      createInboxActions(fetchApi, {
        mutateAliases: () => mutateAliases(),
      }),
    [fetchApi, mutateAliases]
  );

  const parseInput = useCallback(
    (raw: string) =>
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    []
  );

  const handleAdd = useCallback(async () => {
    if (!flowId) {
      toaster.show(
        t(
          'logs_flow_required',
          'Save the automation before adding dark post IDs'
        ),
        'warning'
      );
      return;
    }
    const ids = parseInput(pasteValue);
    if (ids.length === 0) return;

    let errors = 0;
    for (const id of ids) {
      try {
        await actions.createAlias(flowId, id);
      } catch (e) {
        errors++;
      }
    }
    if (errors > 0) {
      toaster.show(
        t('logs_some_ids_failed', 'Some IDs failed: {{count}}').replace(
          '{{count}}',
          String(errors)
        ),
        'warning'
      );
    } else {
      toaster.show(
        t('logs_ids_added', 'Dark post IDs added'),
        'success'
      );
    }
    setPasteValue('');
  }, [actions, flowId, pasteValue, parseInput, toaster, t]);

  const handleRemove = useCallback(
    async (aliasId: string) => {
      try {
        await actions.deleteAlias(aliasId);
      } catch (e) {
        toaster.show(
          t('logs_remove_failed', 'Failed to remove alias'),
          'warning'
        );
      }
    },
    [actions, toaster, t]
  );

  if (!flowId) {
    return (
      <div className="space-y-[8px]">
        <label className="block text-[13px] text-textColor font-medium">
          {t('trigger_ad_ids_label', 'Dark Post IDs')}
        </label>
        <p className="text-[12px] text-customColor18">
          {t(
            'trigger_ad_ids_disabled_before_save',
            'Save the automation before adding dark post IDs.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-[8px]">
      <label className="block text-[13px] text-textColor font-medium">
        {t('trigger_ad_ids_label', 'Dark Post IDs')}
      </label>
      <textarea
        value={pasteValue}
        onChange={(e) => setPasteValue(e.target.value)}
        placeholder={t(
          'trigger_ad_ids_placeholder',
          '17876489127596221, 18091059095260302'
        )}
        className="w-full text-[12px] p-[8px] rounded-[6px] bg-newBgColorInner border border-newTableBorder text-textColor font-mono"
        rows={3}
      />
      <button
        type="button"
        onClick={handleAdd}
        disabled={!pasteValue.trim()}
        className="text-[12px] px-[12px] py-[6px] rounded-[6px] bg-btnPrimary text-white disabled:opacity-50"
      >
        {t('logs_add_alias_button', 'Add')}
      </button>

      {aliases && aliases.length > 0 && (
        <div className="space-y-[6px] mt-[8px]">
          {aliases.map((alias) => (
            <AliasPreviewRow
              key={alias.id}
              alias={alias}
              flowId={flowId}
              integrationId={integrationId ?? alias.integrationId}
              onRemove={() => handleRemove(alias.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
