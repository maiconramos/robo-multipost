'use client';

import { FC, useCallback, useMemo, useState, DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useFlow } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { useRouter } from 'next/navigation';
import { TriggerNode } from '@gitroom/frontend/components/automations/nodes/trigger-node';
import { ConditionNode } from '@gitroom/frontend/components/automations/nodes/condition-node';
import { ReplyCommentNode } from '@gitroom/frontend/components/automations/nodes/reply-comment-node';
import { SendDmNode } from '@gitroom/frontend/components/automations/nodes/send-dm-node';
import { DelayNode } from '@gitroom/frontend/components/automations/nodes/delay-node';
import { DeletableEdge } from '@gitroom/frontend/components/automations/nodes/deletable-edge';
import { NodeConfigPanel } from '@gitroom/frontend/components/automations/node-config-panel';
import { FlowExecutionsComponent } from '@gitroom/frontend/components/automations/flow-executions.component';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useToaster } from '@gitroom/react/toaster/toaster';

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  replyComment: ReplyCommentNode,
  sendDm: SendDmNode,
  delay: DelayNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

const defaultEdgeOptions = { type: 'deletable' };

const NODE_TYPE_MAP: Record<string, string> = {
  TRIGGER: 'trigger',
  CONDITION: 'condition',
  REPLY_COMMENT: 'replyComment',
  SEND_DM: 'sendDm',
  DELAY: 'delay',
};

const REVERSE_NODE_TYPE_MAP: Record<string, string> = {
  trigger: 'TRIGGER',
  condition: 'CONDITION',
  replyComment: 'REPLY_COMMENT',
  sendDm: 'SEND_DM',
  delay: 'DELAY',
};

const nodeToolbar = [
  { type: 'trigger', label: 'Trigger' },
  { type: 'condition', label: 'Condition' },
  { type: 'replyComment', label: 'Reply Comment' },
  { type: 'sendDm', label: 'Send DM' },
  { type: 'delay', label: 'Delay' },
];

interface FlowEditorProps {
  id: string;
}

const FlowEditorInner: FC<FlowEditorProps> = ({ id }) => {
  const t = useT();
  const fetchApi = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const { data: flow, isLoading, mutate } = useFlow(id);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const initialNodes = useMemo(() => {
    if (!flow?.nodes) return [];
    return flow.nodes.map((n: any) => ({
      id: n.id,
      type: NODE_TYPE_MAP[n.type] || 'trigger',
      position: { x: n.positionX, y: n.positionY },
      data: { label: n.label, config: n.data },
    }));
  }, [flow?.nodes]);

  const initialEdges = useMemo(() => {
    if (!flow?.edges) return [];
    return flow.edges.map((e: any) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      sourceHandle: e.sourceHandle || undefined,
      type: 'deletable',
    }));
  }, [flow?.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => {
      // Block DM → DM direct connection (Meta only allows 1 private reply per comment)
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);
      if (sourceNode?.type === 'sendDm' && targetNode?.type === 'sendDm') {
        toaster.show(
          t(
            'dm_single_limit',
            'A Meta permite apenas 1 mensagem direta por comentario. Use quebras de linha no campo de mensagem para enviar multiplas linhas.'
          ),
          'warning'
        );
        return;
      }
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges, nodes, toaster, t]
  );


  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = {
        x: event.clientX - 250,
        y: event.clientY - 100,
      };

      const newNodeId = `temp-${Date.now()}`;
      const newNode: Node = {
        id: newNodeId,
        type,
        position,
        data: { label: type, config: '{}' },
      };

      setNodes((nds) => {
        // Find last added node (highest Y, or last in array) to auto-connect
        const lastNode = nds.length > 0 ? nds[nds.length - 1] : null;
        const shouldAutoConnect =
          lastNode &&
          type !== 'trigger' &&
          // Block DM → DM auto-connect (Meta 1 private reply limit)
          !(lastNode.type === 'sendDm' && type === 'sendDm');

        if (shouldAutoConnect) {
          const edgeData: Edge = {
            id: `e-${lastNode.id}-${newNodeId}`,
            source: lastNode.id,
            target: newNodeId,
            type: 'deletable',
          };
          // Condition nodes need sourceHandle to identify match/no_match path
          if (lastNode.type === 'condition') {
            edgeData.sourceHandle = 'match';
          }
          setEdges((eds) => [...eds, edgeData]);
        }

        if (lastNode?.type === 'sendDm' && type === 'sendDm') {
          toaster.show(
            t(
              'dm_single_limit',
              'A Meta permite apenas 1 mensagem direta por comentario. Use quebras de linha no campo de mensagem para enviar multiplas linhas.'
            ),
            'warning'
          );
        }

        return [...nds, newNode];
      });
    },
    [setNodes, setEdges]
  );

  const onDragStart = useCallback(
    (event: DragEvent, nodeType: string) => {
      event.dataTransfer.setData('application/reactflow', nodeType);
      event.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const handleNodeUpdate = useCallback(
    (nodeId: string, config: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, config: JSON.stringify(config) } }
            : n
        )
      );
      setSelectedNode(null);
    },
    [setNodes]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const canvasNodes = nodes.map((n) => ({
        id: n.id,
        type: REVERSE_NODE_TYPE_MAP[n.type || 'trigger'],
        label: typeof n.data?.label === 'string' ? n.data.label : undefined,
        data:
          typeof n.data?.config === 'string'
            ? n.data.config
            : JSON.stringify(n.data?.config || {}),
        positionX: n.position.x,
        positionY: n.position.y,
      }));

      const canvasEdges = edges.map((e) => ({
        id: e.id,
        sourceNodeId: e.source,
        targetNodeId: e.target,
        sourceHandle: e.sourceHandle || undefined,
      }));

      const res = await fetchApi(`/flows/${id}/canvas`, {
        method: 'PUT',
        body: JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toaster.show(
          body.message || t('failed_to_save_flow', 'Falha ao salvar automacao'),
          'warning'
        );
        return;
      }
      await mutate();
      toaster.show(t('flow_saved', 'Automacao salva'), 'success');
    } catch {
      toaster.show(t('failed_to_save_flow', 'Falha ao salvar automacao'), 'warning');
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, id, fetchApi, mutate, t, toaster]);

  const handleStatusChange = useCallback(
    async (status: string) => {
      try {
        const res = await fetchApi(`/flows/${id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toaster.show(
            body.message ||
              t('failed_to_change_status', 'Falha ao alterar status da automacao'),
            'warning'
          );
          return;
        }
        await mutate();
        toaster.show(
          status === 'ACTIVE'
            ? t('flow_activated', 'Automacao ativada')
            : t('flow_paused', 'Automacao pausada'),
          'success'
        );
      } catch {
        toaster.show(
          t('failed_to_change_status', 'Falha ao alterar status da automacao'),
          'warning'
        );
      }
    },
    [id, fetchApi, mutate, t, toaster]
  );

  if (isLoading) return <LoadingComponent />;
  if (!flow) return <div className="p-[24px] text-textColor">{t('flow_not_found', 'Flow not found')}</div>;

  return (
    <div className="flex flex-col h-full flex-1">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-fifth bg-newBgColorInner px-[16px] py-[8px]">
        <div className="flex items-center gap-[12px]">
          <button
            onClick={() => router.push('/automacoes')}
            className="text-customColor18 hover:text-textColor"
          >
            &larr;
          </button>
          <h2 className="text-[14px] font-semibold text-textColor">{flow.name}</h2>
          <span
            className={`rounded-[4px] px-[8px] py-[2px] text-[12px] ${
              flow.status === 'ACTIVE'
                ? 'bg-customColor42/20 text-customColor42'
                : flow.status === 'PAUSED'
                ? 'bg-customColor13/20 text-customColor13'
                : 'bg-btnSimple text-customColor18'
            }`}
          >
            {flow.status === 'ACTIVE'
              ? t('flow_status_active', 'Active')
              : flow.status === 'PAUSED'
              ? t('flow_status_paused', 'Paused')
              : t('flow_status_draft', 'Draft')}
          </span>
        </div>

        <div className="flex items-center gap-[8px]">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="rounded-[4px] bg-btnSimple border border-fifth px-[12px] py-[6px] text-[12px] text-textColor hover:bg-boxHover"
          >
            {showHistory
              ? t('hide_history', 'Ocultar historico')
              : t('show_history', 'Historico')}
          </button>
          {flow.status === 'ACTIVE' ? (
            <button
              onClick={() => handleStatusChange('PAUSED')}
              className="rounded-[4px] bg-customColor13/20 text-customColor13 px-[12px] py-[6px] text-[12px] hover:opacity-80"
            >
              {t('pause_flow', 'Pause')}
            </button>
          ) : (
            <button
              onClick={() => handleStatusChange('ACTIVE')}
              className="rounded-[4px] bg-customColor42/20 text-customColor42 px-[12px] py-[6px] text-[12px] hover:opacity-80"
            >
              {t('activate_flow', 'Activate')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-[4px] bg-btnPrimary px-[12px] py-[6px] text-[12px] text-white hover:opacity-80 disabled:opacity-50"
          >
            {saving
              ? t('saving_flow', 'Saving...')
              : t('save_flow', 'Save')}
          </button>
        </div>
      </div>

      {/* Node palette */}
      <div className="flex items-center gap-[8px] border-b border-fifth bg-newBgColorInner px-[16px] py-[8px]">
        <span className="text-[12px] text-customColor18 mr-[8px]">
          {t('drag_to_add', 'Drag to add:')}
        </span>
        {nodeToolbar.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            className="cursor-grab rounded-[4px] px-[12px] py-[4px] text-[12px] text-textColor bg-btnSimple border border-fifth hover:bg-boxHover"
          >
            {t(`node_${item.type}`, item.label)}
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          style={{ background: 'var(--new-bgColor)' }}
        >
          <Background color="var(--new-bgLineColor)" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              switch (n.type) {
                case 'trigger':
                  return '#22c55e';
                case 'condition':
                  return '#eab308';
                case 'replyComment':
                  return '#3b82f6';
                case 'sendDm':
                  return '#a855f7';
                case 'delay':
                  return '#6b7280';
                default:
                  return '#999';
              }
            }}
          />
        </ReactFlow>

        {showHistory && (
          <div className="absolute inset-0 z-20 bg-newBgColorInner overflow-y-auto">
            <div className="flex items-center justify-between p-[12px] border-b border-fifth">
              <h3 className="text-[14px] font-semibold text-textColor">
                {t('flow_executions', 'Historico de Execucoes')}
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-customColor18 hover:text-textColor text-[20px]"
              >
                &times;
              </button>
            </div>
            <FlowExecutionsComponent flowId={id} />
          </div>
        )}

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            flowId={id}
            onUpdate={handleNodeUpdate}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
};

export const FlowEditorComponent: FC<FlowEditorProps> = ({ id }) => {
  return (
    <ReactFlowProvider>
      <FlowEditorInner id={id} />
    </ReactFlowProvider>
  );
};
