'use client';

import { FC, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useRepostRules } from '@gitroom/frontend/components/automations/hooks/use-repost';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

export const RepostListComponent: FC = () => {
  const t = useT();
  const router = useRouter();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const { data: rules, isLoading, mutate } = useRepostRules();

  const runNow = useCallback(
    async (id: string) => {
      try {
        const res = await fetchApi(`/repost/rules/${id}/run-now`, {
          method: 'POST',
        });
        if (!res.ok) {
          toaster.show(
            t('repost_run_failed', 'Não foi possível disparar o ciclo'),
            'warning'
          );
          return;
        }
        toaster.show(
          t('repost_run_started', 'Ciclo disparado. Aguarde alguns minutos.'),
          'success'
        );
      } catch {
        toaster.show(
          t('repost_run_failed', 'Não foi possível disparar o ciclo'),
          'warning'
        );
      }
    },
    [fetchApi, t, toaster]
  );

  const toggleRule = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        const res = await fetchApi(`/repost/rules/${id}/toggle`, {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) {
          toaster.show(
            t('repost_toggle_failed', 'Falha ao alterar o status da regra'),
            'warning'
          );
          return;
        }
        await mutate();
      } catch {
        toaster.show(
          t('repost_toggle_failed', 'Falha ao alterar o status da regra'),
          'warning'
        );
      }
    },
    [fetchApi, mutate, t, toaster]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      try {
        const res = await fetchApi(`/repost/rules/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          toaster.show(
            t('repost_delete_failed', 'Falha ao excluir a regra'),
            'warning'
          );
          return;
        }
        await mutate();
        toaster.show(t('repost_deleted', 'Regra excluída'), 'success');
      } catch {
        toaster.show(
          t('repost_delete_failed', 'Falha ao excluir a regra'),
          'warning'
        );
      }
    },
    [fetchApi, mutate, t, toaster]
  );

  if (isLoading) return <LoadingComponent />;

  return (
    <div className="flex flex-col gap-[16px] p-[24px] flex-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-textColor">
            {t('repost_list_title', 'Regras de Repost')}
          </h1>
          <p className="text-[14px] text-customColor18 mt-[4px]">
            {t(
              'repost_list_subtitle',
              'Monitore stories publicados no Instagram e republique automaticamente em TikTok e YouTube Shorts.'
            )}
          </p>
        </div>
        <button
          onClick={() => router.push('/automacoes/repost/nova')}
          className="rounded-[4px] bg-btnPrimary px-[16px] py-[8px] text-[14px] text-white hover:opacity-80"
        >
          {t('repost_new_rule', 'Nova regra de Repost')}
        </button>
      </div>

      {!Array.isArray(rules) || rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-[64px] text-customColor18">
          <p className="text-[14px]">
            {t(
              'repost_list_empty',
              'Nenhuma regra de repost criada ainda. Crie uma para começar.'
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-col rounded-[4px] border border-fifth bg-sixth p-[16px]"
            >
              <div
                onClick={() => router.push(`/automacoes/repost/${rule.id}`)}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between mb-[8px]">
                  <h3 className="text-[14px] font-semibold text-textColor truncate">
                    {rule.name}
                  </h3>
                  <span
                    className={`rounded-[4px] px-[8px] py-[2px] text-[10px] ${
                      rule.enabled
                        ? 'bg-customColor42/20 text-customColor42'
                        : 'bg-btnSimple text-customColor18'
                    }`}
                  >
                    {rule.enabled
                      ? t('repost_rule_active', 'Ativa')
                      : t('repost_rule_paused', 'Pausada')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[12px] text-customColor18">
                  <span>
                    {rule.destinationIntegrationIds.length}{' '}
                    {t('repost_destinations_count', 'destinos')}
                  </span>
                  <span>
                    {rule.lastRunAt
                      ? dayjs(rule.lastRunAt).format('DD/MM HH:mm')
                      : t('repost_never_ran', 'Nunca rodou')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-[6px] mt-[10px] pt-[10px] border-t border-fifth">
                <button
                  onClick={() => runNow(rule.id)}
                  className="flex-1 rounded-[4px] border border-fifth px-[8px] py-[6px] text-[12px] text-textColor hover:bg-boxHover"
                  disabled={!rule.enabled}
                >
                  {t('repost_run_now', 'Rodar agora')}
                </button>
                <button
                  onClick={() => toggleRule(rule.id, !rule.enabled)}
                  className="flex-1 rounded-[4px] border border-fifth px-[8px] py-[6px] text-[12px] text-textColor hover:bg-boxHover"
                >
                  {rule.enabled
                    ? t('repost_toggle_disable', 'Pausar')
                    : t('repost_toggle_enable', 'Ativar')}
                </button>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="rounded-[4px] border border-fifth px-[8px] py-[6px] text-[12px] text-customColor19 hover:bg-boxHover"
                >
                  {t('delete', 'Excluir')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
