'use client';

import { FC, memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const SendDmNode: FC<NodeProps> = memo(({ data, selected }) => {
  const t = useT();
  const config = typeof data?.config === 'string'
    ? (() => { try { return JSON.parse(data.config as string); } catch { return {}; } })()
    : (data?.config || {});
  const message = config.message || config.template || '';

  return (
    <div
      className={`rounded-[8px] border-2 px-[16px] py-[12px] min-w-[200px] ${
        selected ? 'border-purple-400' : 'border-purple-600'
      }`}
      style={{ background: 'rgba(168, 85, 247, 0.15)' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-400" />
      <div className="flex items-center gap-[8px] mb-[4px]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#a855f7"
          strokeWidth="2"
        >
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
        <span className="text-[13px] font-semibold" style={{ color: '#c084fc' }}>
          {t('send_dm_node_label', 'Send DM')}
        </span>
      </div>
      {message && (
        <p className="text-[12px] text-customColor18 truncate max-w-[180px]">{message}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400" />
    </div>
  );
});

SendDmNode.displayName = 'SendDmNode';
