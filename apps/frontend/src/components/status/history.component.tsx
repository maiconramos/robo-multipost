'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { Button } from '@gitroom/react/form/button';
import {
  ChannelAvatar,
  DebugLink,
  ProfileChip,
  temporalPostUrl,
} from '@gitroom/frontend/components/status/status.helpers';
import {
  StatusEventType,
  StatusHistoryItem,
  StatusHistoryResponse,
} from '@gitroom/nestjs-libraries/dtos/status/status.dto';

/**
 * Aba "Histórico": log append-only de eventos de falha que SOBREVIVEM à
 * resolução (o oposto de "Problemas"). Paginado por cursor ("Carregar mais"),
 * filtrável por tipo. Cada linha traz o badge da plataforma, o perfil de origem,
 * o momento e o link de depuração — mesma linguagem visual da aba Problemas.
 */
export const HistoryComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();

  const [type, setType] = useState<StatusEventType | undefined>(undefined);

  const getKey = useCallback(
    (_pageIndex: number, previous: StatusHistoryResponse | null) => {
      // Fim: página anterior sinalizou que não há mais.
      if (previous && !previous.hasMore) return null;
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (previous?.nextCursor) params.set('cursor', previous.nextCursor);
      return `/status/history?${params.toString()}`;
    },
    [type]
  );

  const fetcher = useCallback(
    async (url: string): Promise<StatusHistoryResponse> =>
      (await fetch(url)).json(),
    [fetch]
  );

  const { data, size, setSize, isLoading, isValidating, error } =
    useSWRInfinite<StatusHistoryResponse>(getKey, fetcher);

  const items = useMemo(
    () => (data ?? []).flatMap((p) => p?.items ?? []),
    [data]
  );
  const hasMore = data?.[data.length - 1]?.hasMore ?? false;
  const loadingMore = isValidating && !!data && size > data.length;

  const filters: { key: StatusEventType | undefined; label: string }[] = [
    { key: undefined, label: t('status_filter_all', 'Todos') },
    {
      key: 'CHANNEL_DISCONNECT',
      label: t('status_type_channel_disconnect', 'Canais'),
    },
    { key: 'POST_FAILED', label: t('status_type_post_failed', 'Posts') },
    {
      key: 'AUTOMATION_FAILED',
      label: t('status_type_automation_failed', 'Automações'),
    },
  ];

  const setFilter = useCallback(
    (key: StatusEventType | undefined) => () => {
      setType(key);
      setSize(1); // reinicia a paginação ao trocar o filtro
    },
    [setSize]
  );

  const eventTitle = useCallback(
    (item: StatusHistoryItem): string => {
      switch (item.type) {
        case 'CHANNEL_DISCONNECT':
          return t('status_event_channel_down', 'Canal desconectado');
        case 'POST_FAILED':
          return t('status_event_post_failed', 'Falha ao publicar');
        case 'AUTOMATION_FAILED':
          return t('status_event_automation_failed', 'Automação falhou');
        default:
          return item.type;
      }
    },
    [t]
  );

  const renderDebugLinks = useCallback(
    (item: StatusHistoryItem) => {
      if (!item.entityId) return null;
      if (item.type === 'POST_FAILED') {
        const temporal = temporalPostUrl(item.entityId);
        return (
          <>
            <DebugLink href={`/p/${item.entityId}`}>
              {t('status_view_post', 'Ver post')} ↗
            </DebugLink>
            {temporal && (
              <DebugLink href={temporal}>
                {t('status_view_temporal', 'Temporal')} ↗
              </DebugLink>
            )}
          </>
        );
      }
      if (item.type === 'AUTOMATION_FAILED') {
        return (
          <DebugLink href={`/automacoes/${item.entityId}`}>
            {t('status_view_automation', 'Ver automação')} ↗
          </DebugLink>
        );
      }
      return null;
    },
    [t]
  );

  if (isLoading) return <LoadingComponent />;

  if (error) {
    return (
      <div className="border border-fifth rounded-[8px] bg-sixth p-[24px] text-[14px] text-customColor18">
        {t('status_error_loading', 'Erro ao carregar o status.')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex gap-[6px] flex-wrap">
        {filters.map((f) => (
          <button
            key={f.key ?? 'all'}
            onClick={setFilter(f.key)}
            className={clsx(
              'px-[12px] py-[6px] rounded-[6px] text-[13px] border transition-colors',
              type === f.key
                ? 'border-btnPrimary text-btnPrimary bg-newBgColorInner'
                : 'border-fifth text-customColor18 hover:text-textColor'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-[64px] gap-[12px] border border-fifth rounded-[8px] bg-sixth text-center">
          <div className="w-[44px] h-[44px] rounded-full bg-green-500/15 grid place-items-center text-green-500 text-[20px]">
            ✓
          </div>
          <p className="text-[15px] text-textColor font-medium">
            {t('status_history_empty', 'Nenhum evento no período')}
          </p>
        </div>
      ) : (
        <div className="rounded-[8px] border border-fifth bg-sixth overflow-hidden">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-[12px] px-[16px] py-[12px] border-t border-fifth first:border-t-0"
            >
              {item.channel ? (
                <ChannelAvatar
                  picture={item.channel.picture}
                  name={item.channel.name ?? ''}
                  identifier={item.channel.identifier}
                />
              ) : (
                <div className="w-[28px] h-[28px] rounded-full bg-newBgColorInner flex-none" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-[8px]">
                  <span
                    className={clsx(
                      'w-[8px] h-[8px] rounded-full flex-none',
                      item.severity === 'critical'
                        ? 'bg-red-500'
                        : 'bg-yellow-600'
                    )}
                  />
                  <span className="text-[14px] text-textColor truncate">
                    {eventTitle(item)}
                    {item.channel?.name ? ` · ${item.channel.name}` : ''}
                  </span>
                </div>
                {item.message && (
                  <div className="text-[12px] text-customColor18 truncate mt-[2px]">
                    {item.message}
                  </div>
                )}
                <div className="flex items-center gap-[12px] mt-[3px]">
                  {renderDebugLinks(item)}
                </div>
              </div>
              <ProfileChip profile={item.profile} />
              <span className="text-[11px] text-customColor18 whitespace-nowrap flex-none">
                {dayjs(item.createdAt).format('DD/MM/YYYY HH:mm')}
              </span>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button
            className="!px-[20px] !py-[8px] text-[13px]"
            onClick={() => setSize(size + 1)}
            disabled={loadingMore}
          >
            {loadingMore
              ? t('status_loading', 'Carregando...')
              : t('status_load_more', 'Carregar mais')}
          </Button>
        </div>
      )}
    </div>
  );
};
