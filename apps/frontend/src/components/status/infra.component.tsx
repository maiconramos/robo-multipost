'use client';

import { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { Button } from '@gitroom/react/form/button';
import {
  InfraHealthComponent,
  InfraHealthResponse,
  InfraHealthStatus,
} from '@gitroom/nestjs-libraries/dtos/status/infra-health.dto';

/**
 * Aba "Saúde da infra": sonda ativa de PostgreSQL/Redis/Temporal/Storage.
 * Cada componente com selo (verde/amarelo/vermelho), mensagem, latência.
 * Botão "Verificar agora" força re-sonda (ignora o cache de 30s do backend).
 */
const DOT: Record<InfraHealthStatus, string> = {
  ok: 'bg-green-500',
  warning: 'bg-yellow-600',
  error: 'bg-red-500',
};

export const InfraComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const [rechecking, setRechecking] = useState(false);

  const load = useCallback(
    async (): Promise<InfraHealthResponse> =>
      (await fetch('/status/health')).json(),
    [fetch]
  );
  const { data, isLoading, error, mutate } = useSWR('status-health', load);

  const recheck = useCallback(async () => {
    setRechecking(true);
    try {
      const fresh: InfraHealthResponse = await (
        await fetch('/status/health?refresh=true')
      ).json();
      await mutate(fresh, { revalidate: false });
    } finally {
      setRechecking(false);
    }
  }, [fetch, mutate]);

  const label = useCallback(
    (c: InfraHealthComponent) => {
      switch (c.key) {
        case 'database':
          return t('status_infra_database', 'Banco de dados');
        case 'redis':
          return t('status_infra_redis', 'Redis');
        case 'temporal':
          return t('status_infra_temporal', 'Temporal');
        case 'storage':
          return t('status_infra_storage', 'Armazenamento');
        default:
          return c.key;
      }
    },
    [t]
  );

  const statusText = useCallback(
    (s: InfraHealthStatus) =>
      s === 'ok'
        ? t('status_infra_ok', 'Operacional')
        : s === 'warning'
        ? t('status_infra_warning', 'Atenção')
        : t('status_infra_error', 'Erro'),
    [t]
  );

  if (isLoading) return <LoadingComponent />;

  // Pitfall: `useFetch` não rejeita em 4xx/5xx — o corpo de erro cai em `data`.
  // Guardar em `error` E na presença do shape esperado (`summary`).
  if (error || !data?.summary) {
    return (
      <div className="border border-fifth rounded-[8px] bg-sixth p-[24px] text-[14px] text-customColor18">
        {t('status_error_loading', 'Erro ao carregar o status.')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center justify-between gap-[12px] flex-wrap">
        <span className="text-[12px] text-customColor18">
          {t('status_infra_checked_at', 'Verificado em')}{' '}
          {dayjs(data.checkedAt).format('DD/MM/YYYY HH:mm:ss')}
        </span>
        <Button
          className="!px-[16px] !py-[8px] text-[13px]"
          onClick={recheck}
          disabled={rechecking}
        >
          {rechecking
            ? t('status_loading', 'Carregando...')
            : t('status_infra_recheck', 'Verificar agora')}
        </Button>
      </div>

      <div className="rounded-[8px] border border-fifth bg-sixth overflow-hidden">
        {data.components.map((c) => (
          <div
            key={c.key}
            className="flex items-center gap-[12px] px-[16px] py-[14px] border-t border-fifth first:border-t-0"
          >
            <span
              className={clsx(
                'w-[10px] h-[10px] rounded-full flex-none',
                DOT[c.status]
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-textColor">{label(c)}</div>
              {c.message && (
                <div className="text-[12px] text-customColor18 truncate">
                  {c.message}
                </div>
              )}
            </div>
            {c.latencyMs != null && (
              <span className="text-[11px] text-customColor18 whitespace-nowrap flex-none">
                {c.latencyMs}
                {t('status_infra_latency', 'ms')}
              </span>
            )}
            <span
              className={clsx(
                'text-[12px] font-medium whitespace-nowrap flex-none',
                c.status === 'ok'
                  ? 'text-green-500'
                  : c.status === 'warning'
                  ? 'text-yellow-600'
                  : 'text-red-500'
              )}
            >
              {statusText(c.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
