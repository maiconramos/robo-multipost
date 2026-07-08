'use client';

import { FC, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { ProblemsComponent } from '@gitroom/frontend/components/status/problems.component';

/**
 * Area "Status" (admin-only). Fase 1 traz apenas a aba "Problemas"; a estrutura
 * de abas ja fica pronta para Saude da infra / Erros (proximas fases) — o array
 * `tabs` cresce e a barra de abas aparece quando houver mais de uma.
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
    <div className="flex flex-col gap-[16px] p-[24px] flex-1">
      <div>
        <h1 className="text-[20px] font-semibold text-textColor">
          {t('status_title', 'Status')}
        </h1>
        <p className="text-[14px] text-customColor18 mt-[4px]">
          {t(
            'status_description',
            'Problemas que precisam da sua atenção no workspace.'
          )}
        </p>
      </div>

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
