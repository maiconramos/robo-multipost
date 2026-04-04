'use client';

import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFlowExecutions } from '@gitroom/frontend/components/automations/hooks/use-flows';

interface FlowExecutionsProps {
  flowId: string;
}

export const FlowExecutionsComponent: FC<FlowExecutionsProps> = ({
  flowId,
}) => {
  const t = useT();
  const { data: executions, isLoading } = useFlowExecutions(flowId);

  if (isLoading) {
    return (
      <div className="text-[14px] text-customColor18 p-[16px]">
        {t('loading_executions', 'Loading...')}
      </div>
    );
  }

  if (!executions || executions.length === 0) {
    return (
      <div className="text-[14px] text-customColor18 p-[16px]">
        {t('no_executions', 'No executions yet')}
      </div>
    );
  }

  return (
    <div className="border-t border-fifth">
      <h3 className="text-[14px] font-semibold text-textColor px-[16px] py-[8px]">
        {t('flow_executions', 'Execution History')}
      </h3>
      <div className="overflow-x-auto">
        <table className="table1">
          <thead>
            <tr>
              <th>{t('commenter', 'Commenter')}</th>
              <th>{t('comment', 'Comment')}</th>
              <th>{t('status', 'Status')}</th>
              <th>{t('started_at', 'Started At')}</th>
            </tr>
          </thead>
          <tbody>
            {executions.map((exec: any) => (
              <tr key={exec.id}>
                <td className="text-textColor">
                  {exec.igCommenterName || exec.igCommenterId}
                </td>
                <td className="text-customColor18 truncate max-w-[200px]">
                  {exec.commentText}
                </td>
                <td>
                  <span
                    className={`rounded-[4px] px-[8px] py-[2px] text-[10px] ${
                      exec.status === 'COMPLETED'
                        ? 'bg-customColor42/20 text-customColor42'
                        : exec.status === 'FAILED'
                        ? 'bg-customColor19/20 text-customColor19'
                        : exec.status === 'RUNNING'
                        ? 'bg-customColor51/20 text-customColor51'
                        : 'bg-btnSimple text-customColor18'
                    }`}
                  >
                    {exec.status}
                  </span>
                </td>
                <td className="text-customColor18">
                  {new Date(exec.startedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
