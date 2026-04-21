'use client';

import { FC, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  useFlowExecutions,
  useFlowExecution,
} from '@gitroom/frontend/components/automations/hooks/use-flows';

interface FlowExecutionsProps {
  flowId: string;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  TRIGGER: 'Trigger',
  CONDITION: 'Condition',
  REPLY_COMMENT: 'Reply Comment',
  SEND_DM: 'Send DM',
  DELAY: 'Delay',
  GATE_RESOLVE: 'Gate de Follow',
};

const NODE_TYPE_COLORS: Record<string, string> = {
  TRIGGER: '#22c55e',
  CONDITION: '#eab308',
  REPLY_COMMENT: '#3b82f6',
  SEND_DM: '#a855f7',
  DELAY: '#f97316',
  GATE_RESOLVE: '#eab308',
};

const ExecutionDetail: FC<{ flowId: string; executionId: string; onBack: () => void }> = ({
  flowId,
  executionId,
  onBack,
}) => {
  const t = useT();
  const { data: execution, isLoading } = useFlowExecution(flowId, executionId);

  if (isLoading) {
    return (
      <div className="text-[14px] text-customColor18 p-[16px]">
        {t('loading_executions', 'Loading...')}
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="text-[14px] text-customColor18 p-[16px]">
        {t('execution_not_found', 'Execution not found')}
      </div>
    );
  }

  const log: Array<{
    nodeId: string;
    nodeType: string;
    status: string;
    timestamp: string;
    error?: string;
  }> = execution.executionLog ? JSON.parse(execution.executionLog) : [];

  return (
    <div className="p-[16px]">
      <button
        onClick={onBack}
        className="text-[12px] text-customColor18 hover:text-textColor mb-[12px]"
      >
        &larr; {t('back_to_list', 'Back to list')}
      </button>

      <div className="flex items-center gap-[8px] mb-[12px]">
        <span className="text-[13px] font-semibold text-textColor">
          {execution.igCommenterName || execution.igCommenterId}
        </span>
        <span
          className={`rounded-[4px] px-[8px] py-[2px] text-[10px] ${
            execution.status === 'COMPLETED'
              ? 'bg-customColor42/20 text-customColor42'
              : execution.status === 'FAILED'
              ? 'bg-customColor19/20 text-customColor19'
              : execution.status === 'WAITING_POSTBACK'
              ? 'bg-yellow-500/20 text-yellow-500'
              : 'bg-customColor51/20 text-customColor51'
          }`}
        >
          {String(
            t(
              `flow_execution_status_${execution.status.toLowerCase()}`,
              execution.status
            )
          )}
        </span>
      </div>

      <p className="text-[12px] text-customColor18 mb-[16px]">
        &ldquo;{execution.commentText}&rdquo;
      </p>

      {execution.error && (
        <div className="rounded-[4px] border border-customColor19/40 bg-customColor19/10 p-[12px] mb-[16px]">
          <p className="text-[12px] text-customColor19">{execution.error}</p>
        </div>
      )}

      {/* Timeline */}
      {log.length > 0 ? (
        <div className="relative pl-[24px]">
          <div className="absolute left-[8px] top-[4px] bottom-[4px] w-[2px] bg-fifth" />
          {log.map((entry, i) => {
            const color = NODE_TYPE_COLORS[entry.nodeType] || '#6b7280';
            const isError = entry.status === 'error' || entry.status === 'gate_exhausted';
            const isSkipped = entry.status === 'skipped' || entry.status === 'gate_blocked';
            const isCompleted = entry.status === 'completed' || entry.status === 'gate_passed';
            const isWaiting = entry.status === 'awaiting_postback';
            return (
              <div key={i} className="relative mb-[16px] last:mb-0">
                <div
                  className="absolute left-[-20px] top-[2px] w-[12px] h-[12px] rounded-full border-2"
                  style={{
                    borderColor: color,
                    backgroundColor: isError
                      ? '#ef4444'
                      : isSkipped
                      ? '#6b7280'
                      : isWaiting
                      ? '#eab308'
                      : isCompleted
                      ? color
                      : 'transparent',
                  }}
                />
                <div>
                  <div className="flex items-center gap-[8px]">
                    <span className="text-[12px] font-medium text-textColor">
                      {t(
                        `flow_node_type_${entry.nodeType.toLowerCase()}`,
                        NODE_TYPE_LABELS[entry.nodeType] || entry.nodeType
                      )}
                    </span>
                    <span
                      className={`text-[10px] px-[6px] py-[1px] rounded-[3px] ${
                        isError
                          ? 'bg-customColor19/20 text-customColor19'
                          : isSkipped
                          ? 'bg-btnSimple text-customColor18'
                          : isWaiting
                          ? 'bg-yellow-500/20 text-yellow-500'
                          : entry.status === 'entered'
                          ? 'bg-customColor51/20 text-customColor51'
                          : 'bg-customColor42/20 text-customColor42'
                      }`}
                    >
                      {t(`flow_log_status_${entry.status}`, entry.status)}
                    </span>
                  </div>
                  <span className="text-[10px] text-customColor18">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  {entry.error && entry.status !== 'completed' && (
                    <p className="text-[10px] text-customColor19 mt-[2px]">{entry.error}</p>
                  )}
                  {entry.error && entry.status === 'completed' && entry.error.startsWith('branch:') && (
                    <p className="text-[10px] text-customColor18 mt-[2px]">
                      {t('branch_taken', 'Branch')}: {entry.error.replace('branch:', '')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[12px] text-customColor18">
          {t('no_execution_log', 'No detailed log available')}
        </p>
      )}
    </div>
  );
};

export const FlowExecutionsComponent: FC<FlowExecutionsProps> = ({
  flowId,
}) => {
  const t = useT();
  const { data: executions, isLoading } = useFlowExecutions(flowId);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  if (selectedExecutionId) {
    return (
      <ExecutionDetail
        flowId={flowId}
        executionId={selectedExecutionId}
        onBack={() => setSelectedExecutionId(null)}
      />
    );
  }

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
    <div>
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
              <tr
                key={exec.id}
                className="cursor-pointer hover:bg-boxHover"
                onClick={() => setSelectedExecutionId(exec.id)}
              >
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
                        : exec.status === 'WAITING_POSTBACK'
                        ? 'bg-yellow-500/20 text-yellow-500'
                        : 'bg-btnSimple text-customColor18'
                    }`}
                  >
                    {String(
                      t(
                        `flow_execution_status_${exec.status.toLowerCase()}`,
                        exec.status
                      )
                    )}
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
