'use client';

import { FC, memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const ConditionNode: FC<NodeProps> = memo(({ data, selected }) => {
  const t = useT();
  const config = typeof data?.config === 'string'
    ? (() => { try { return JSON.parse(data.config as string); } catch { return {}; } })()
    : (data?.config || {});
  const keywords: string[] = config.keywords || [];

  return (
    <div
      className={`rounded-[8px] border-2 px-[16px] py-[12px] min-w-[200px] ${
        selected ? 'border-yellow-400' : 'border-yellow-600'
      }`}
      style={{ background: 'rgba(234, 179, 8, 0.15)' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-yellow-400" />
      <div className="flex items-center gap-[8px] mb-[4px]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#eab308"
          strokeWidth="2"
        >
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-[13px] font-semibold" style={{ color: '#facc15' }}>
          {t('condition_node_label', 'Condition: Keyword')}
        </span>
      </div>
      {keywords.length > 0 && (
        <p className="text-[12px] text-customColor18 truncate">
          {keywords.join(', ')}
        </p>
      )}
      <div className="flex justify-between mt-[8px] text-[10px] text-customColor18">
        <span>{t('condition_match', 'Match')}</span>
        <span>{t('condition_no_match', 'No Match')}</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="match"
        className="!bg-green-400 !left-[30%]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no_match"
        className="!bg-red-400 !left-[70%]"
      />
    </div>
  );
});

ConditionNode.displayName = 'ConditionNode';
