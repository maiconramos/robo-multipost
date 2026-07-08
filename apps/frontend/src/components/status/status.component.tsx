'use client';

import { FC, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { ProblemsComponent } from '@gitroom/frontend/components/status/problems.component';
import { HistoryComponent } from '@gitroom/frontend/components/status/history.component';
import { InfraComponent } from '@gitroom/frontend/components/status/infra.component';

/**
 * Area "Status" (admin-only). Abas: "Problemas" (estado atual derivado),
 * "Historico" (log de eventos que sobrevive a resolucao) e "Saude da infra"
 * (sonda ativa de PostgreSQL/Redis/Temporal/Storage).
 */
export const StatusComponent: FC = () => {
  const t = useT();
  const user = useUser();
  const isOrgAdmin = user?.role !== 'USER';

  const tabs = useMemo(
    () => [
      {
        key: 'problems',
        label: t('status_tab_problems', 'Problemas'),
        render: () => <ProblemsComponent />,
      },
      {
        key: 'history',
        label: t('status_tab_history', 'Histórico'),
        render: () => <HistoryComponent />,
      },
      {
        key: 'infra',
        label: t('status_tab_infra', 'Saúde da infra'),
        render: () => <InfraComponent />,
      },
    ],
    [t]
  );
  const [tab, setTab] = useState('problems');

  // Defesa extra: o menu ja e gated por role e o endpoint responde 403. Se um
  // org-USER chegar aqui via URL, nao renderiza o conteudo.
  if (!isOrgAdmin) {
    return (
      <div className="flex flex-col gap-[16px] p-[24px] flex-1">
        <p className="text-[14px] text-customColor18">
          {t(
            'status_admin_only',
            'Apenas administradores da organização podem ver o Status.'
          )}
        </p>
      </div>
    );
  }

  const active = tabs.find((x) => x.key === tab) ?? tabs[0];

  return (
    // Sem título próprio: renderizado como aba dentro de Settings, que já rotula
    // "Status" na navegação lateral (evita o cabeçalho duplicado).
    <div className="flex flex-col gap-[16px] flex-1">
      {tabs.length > 1 && (
        <div className="flex gap-[4px] border-b border-fifth">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={clsx(
                'px-[14px] py-[10px] text-[14px] font-medium border-b-2 -mb-[1px] transition-colors',
                tab === tb.key
                  ? 'text-btnPrimary border-btnPrimary'
                  : 'text-customColor18 border-transparent hover:text-textColor'
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>
      )}

      {active.render()}
    </div>
  );
};
