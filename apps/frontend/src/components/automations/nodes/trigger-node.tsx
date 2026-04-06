'use client';

import { FC, memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const TriggerNode: FC<NodeProps> = memo(({ data, selected }) => {
  const t = useT();
  const config = typeof data?.config === 'string'
    ? (() => { try { return JSON.parse(data.config as string); } catch { return {}; } })()
    : (data?.config || {});
  const postCount = Array.isArray(config.postIds) ? config.postIds.length : 0;
  const keywords: string[] = Array.isArray(config.keywords) ? config.keywords : [];

  return (
    <div
      className={`rounded-[8px] border-2 px-[16px] py-[12px] min-w-[200px] ${
        selected ? 'border-green-400' : 'border-green-600'
      }`}
      style={{ background: 'rgba(34, 197, 94, 0.15)' }}
    >
      <div className="flex items-center gap-[8px] mb-[4px]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
        >
          <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
        </svg>
        <span className="text-[13px] font-semibold" style={{ color: '#4ade80' }}>
          {t('trigger_node_label', 'Trigger: Instagram Comment')}
        </span>
      </div>
      <p className="text-[12px] text-customColor18">
        {t('trigger_node_description', 'When someone comments on a post')}
      </p>
      <p className="text-[11px] mt-[4px]" style={{ color: '#4ade80' }}>
        {postCount > 0
          ? t('trigger_posts_selected', '{count} post(s) selected').replace(
              '{count}',
              String(postCount)
            )
          : t('trigger_posts_all', 'All posts')}
      </p>
      {keywords.length > 0 && (
        <p className="text-[11px] mt-[2px] truncate max-w-[180px]" style={{ color: '#86efac' }}>
          {t('trigger_keywords_label', 'Keywords')}: {keywords.join(', ')}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-green-400" />
    </div>
  );
});

TriggerNode.displayName = 'TriggerNode';
