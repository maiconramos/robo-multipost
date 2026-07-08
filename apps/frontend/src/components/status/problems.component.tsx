'use client';

import { FC, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { Button } from '@gitroom/react/form/button';
import {
  StatusChannelProblem,
  StatusPostProblem,
  StatusProblemsResponse,
  StatusProfileRef,
} from '@gitroom/nestjs-libraries/dtos/status/status.dto';

/**
 * Aba "Problemas": estado atual derivado (some quando resolve), agrupado por
 * severidade, cada item com o PERFIL de origem. Reusa o fluxo de "Reconectar"
 * dos canais (mesmo endpoint da tela de lançamentos).
 */
export const ProblemsComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();

  const load = useCallback(
    async (): Promise<StatusProblemsResponse> =>
      (await fetch('/status/problems')).json(),
    [fetch]
  );
  const { data, isLoading, error } = useSWR('status-problems', load);

  const reconnect = useCallback(
    (identifier: string, internalId: string) => async () => {
      const { url } = await (
        await fetch(
          `/integrations/social/${identifier}?refresh=${internalId}`,
          { method: 'GET' }
        )
      ).json();
      window.location.href = url;
    },
    [fetch]
  );

  // Dedup: um canal caído gera N posts em erro — agrupa por canal para não
  // virar uma muralha de linhas.
  const postsByChannel = useMemo(() => {
    const map = new Map<
      string,
      {
        channel: StatusPostProblem['channel'];
        profile: StatusProfileRef | null;
        count: number;
      }
    >();
    for (const p of data?.posts ?? []) {
      const key = p.channel?.id ?? 'no-channel';
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { channel: p.channel, profile: p.profile, count: 1 });
    }
    return [...map.values()];
  }, [data]);

  const profileChip = useCallback(
    (profile: StatusProfileRef | null) => (
      <span className="text-[11px] px-[8px] py-[2px] rounded-[6px] bg-newBgColorInner text-customColor18 whitespace-nowrap flex-none">
        {profile?.name ?? t('status_profile_workspace', 'Workspace')}
      </span>
    ),
    [t]
  );

  const avatar = useCallback(
    (picture: string | null, name: string) =>
      picture ? (
        <img
          src={picture}
          alt={name}
          className="w-[28px] h-[28px] rounded-full object-cover flex-none"
        />
      ) : (
        <div className="w-[28px] h-[28px] rounded-full bg-newBgColorInner flex-none" />
      ),
    []
  );

  const renderChannel = useCallback(
    (c: StatusChannelProblem) => (
      <div
        key={c.id}
        className="flex items-center gap-[12px] px-[16px] py-[12px] border-t border-fifth first:border-t-0"
      >
        {avatar(c.picture, c.name)}
        <div className="flex-1 min-w-0">
          <div className="text-[14px] text-textColor truncate">{c.name}</div>
          <div className="text-[12px] text-customColor18 truncate">
            {c.refreshNeeded
              ? c.reason || t('status_reason_unknown', 'Motivo não informado')
              : t('status_channel_disabled', 'Canal desativado')}
          </div>
        </div>
        {profileChip(c.profile)}
        {c.refreshNeeded && (
          <Button
            className="!px-[16px] !py-[8px] text-[13px]"
            onClick={reconnect(c.identifier, c.internalId)}
          >
            {t('status_reconnect', 'Reconectar')}
          </Button>
        )}
      </div>
    ),
    [avatar, profileChip, reconnect, t]
  );

  if (isLoading) return <LoadingComponent />;

  if (error) {
    return (
      <div className="border border-fifth rounded-[8px] bg-sixth p-[24px] text-[14px] text-customColor18">
        {t('status_error_loading', 'Erro ao carregar o status.')}
      </div>
    );
  }

  if (!data || data.summary.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-[64px] gap-[12px] border border-fifth rounded-[8px] bg-sixth text-center">
        <div className="w-[44px] h-[44px] rounded-full bg-green-500/15 grid place-items-center text-green-500 text-[20px]">
          ✓
        </div>
        <p className="text-[15px] text-textColor font-medium">
          {t('status_empty_all_good', 'Tudo certo — nenhum problema ativo')}
        </p>
      </div>
    );
  }

  const criticalChannels = data.channels.filter(
    (c) => c.severity === 'critical'
  );
  const warningChannels = data.channels.filter((c) => c.severity === 'warning');

  const hasCritical = criticalChannels.length > 0 || postsByChannel.length > 0;
  const hasWarning =
    warningChannels.length > 0 || data.automations.length > 0;

  return (
    <div className="flex flex-col gap-[24px]">
      {hasCritical && (
        <section className="flex flex-col gap-[10px]">
          <h2 className="text-[11px] uppercase tracking-wide font-semibold text-red-500">
            {t('status_severity_critical', 'Crítico')}
          </h2>
          <div className="rounded-[8px] border border-fifth bg-sixth overflow-hidden">
            {criticalChannels.map(renderChannel)}
            {postsByChannel.map((p, i) => (
              <div
                key={`post-${p.channel?.id ?? i}`}
                className="flex items-center gap-[12px] px-[16px] py-[12px] border-t border-fifth first:border-t-0"
              >
                {avatar(p.channel?.picture ?? null, p.channel?.name ?? '')}
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] text-textColor truncate">
                    {p.channel
                      ? t(
                          'status_posts_error_count',
                          '{{count}} posts falharam em {{name}}',
                          { count: p.count, name: p.channel.name }
                        )
                      : t(
                          'status_posts_error_count_no_channel',
                          '{{count}} posts falharam',
                          { count: p.count }
                        )}
                  </div>
                </div>
                {profileChip(p.profile)}
              </div>
            ))}
          </div>
        </section>
      )}

      {hasWarning && (
        <section className="flex flex-col gap-[10px]">
          <h2 className="text-[11px] uppercase tracking-wide font-semibold text-yellow-600">
            {t('status_severity_warning', 'Atenção')}
          </h2>
          <div className="rounded-[8px] border border-fifth bg-sixth overflow-hidden">
            {warningChannels.map(renderChannel)}
            {data.automations.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-[12px] px-[16px] py-[12px] border-t border-fifth first:border-t-0"
              >
                <div className="w-[28px] h-[28px] rounded-full bg-newBgColorInner flex-none grid place-items-center text-customColor18 text-[13px]">
                  ⚙
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] text-textColor truncate">
                    {t('status_automation_failed', 'Automação falhou')}:{' '}
                    {a.flowName}
                  </div>
                  {a.error && (
                    <div className="text-[12px] text-customColor18 truncate">
                      {a.error}
                    </div>
                  )}
                </div>
                {profileChip(a.profile)}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.summary.truncated && (
        <p className="text-[12px] text-customColor18">
          {t(
            'status_truncated',
            'Mostrando os mais recentes. Pode haver mais problemas.'
          )}
        </p>
      )}
    </div>
  );
};
