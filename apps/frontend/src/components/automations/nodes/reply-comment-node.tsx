'use client';

import { FC, memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const ReplyCommentNode: FC<NodeProps> = memo(({ data, selected }) => {
  const t = useT();
  const config = typeof data?.config === 'string'
    ? (() => { try { return JSON.parse(data.config as string); } catch { return {}; } })()
    : (data?.config || {});
  const message = config.message || config.template || '';

  return (
    <div
      className={`rounded-[8px] border-2 px-[16px] py-[12px] min-w-[200px] ${
        selected ? 'border-blue-400' : 'border-blue-600'
      }`}
      style={{ background: 'rgba(59, 130, 246, 0.15)' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-400" />
      <div className="flex items-center gap-[8px] mb-[4px]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="text-[13px] font-semibold" style={{ color: '#60a5fa' }}>
          {t('reply_comment_node_label', 'Reply Comment')}
        </span>
      </div>
      {message && (
        <p className="text-[12px] text-customColor18 truncate max-w-[180px]">{message}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400" />
    </div>
  );
});

ReplyCommentNode.displayName = 'ReplyCommentNode';
