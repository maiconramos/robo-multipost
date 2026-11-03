'use client';

import { FC, memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const DelayNode: FC<NodeProps> = memo(({ data, selected }) => {
  const t = useT();
  const config =
    typeof data?.config === 'string'
      ? (() => {
          try {
            return JSON.parse(data.config as string);
          } catch {
            return {};
          }
        })()
      : data?.config || {};
  const duration = config.duration || 0;
  const unit = config.unit || 'seconds';

  return (
    <div
      className="automation-node automation-color-delay rounded-[8px] border-2 px-[16px] py-[12px] min-w-[200px]"
      data-selected={!!selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="automation-node-handle"
      />
      <div className="flex items-center gap-[8px] mb-[4px]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          className="automation-accent"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-[13px] font-semibold text-textColor">
          {t('delay_node_label', 'Delay')}
        </span>
      </div>
      {duration > 0 && (
        <p className="text-[12px] text-customColor18">
          {duration}{' '}
          {unit === 'hours'
            ? t('hours', 'Hours').toLowerCase()
            : unit === 'minutes'
            ? t('minutes', 'Minutes').toLowerCase()
            : t('seconds', 'Seconds').toLowerCase()}
        </p>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="automation-node-handle"
      />
    </div>
  );
});

DelayNode.displayName = 'DelayNode';
