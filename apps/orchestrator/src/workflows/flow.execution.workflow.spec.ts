const activities = {
  getFlowWithNodes: jest.fn(),
  replyToComment: jest.fn(),
  sendDirectMessage: jest.fn(),
  sendStoryDirectMessage: jest.fn(),
  checkIgFollowStatus: jest.fn(),
  evaluateCondition: jest.fn(),
  updateExecution: jest.fn(),
  appendExecutionLog: jest.fn(),
  createPendingPostback: jest.fn(),
  sendOpeningDmWithPostback: jest.fn(),
  isFlowRunnable: jest.fn(),
};
jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => activities,
  sleep: jest.fn(),
  patched: jest.fn(),
}));
import { patched } from '@temporalio/workflow';
import { flowExecutionWorkflow } from './flow.execution.workflow';
import {
  stablePrivateMessage,
  stablePrivateVariant,
} from '@gitroom/nestjs-libraries/database/prisma/flows/private-message-variants';
describe('DM privada versionada', () => {
  const input = {
    executionId: 'e',
    flowId: 'f',
    integrationId: 'i',
    triggerType: 'comment_on_post' as const,
    igCommenterId: 'actor',
    igCommentId: 'c',
    igMediaId: 'p',
  };
  const config = { message: 'antiga', messages: ['Primeira', 'Segunda'] };
  beforeEach(() => {
    jest.clearAllMocks();
    activities.getFlowWithNodes.mockResolvedValue({
      integrationId: 'i',
      organizationId: 'o',
      nodes: [
        { id: 'trigger', type: 'TRIGGER', data: '{}' },
        { id: 'dm', type: 'SEND_DM', data: JSON.stringify(config) },
      ],
      edges: [{ sourceNodeId: 'trigger', targetNodeId: 'dm' }],
    });
  });
  it('replay anterior ignora lista e usa mensagem singular', async () => {
    (patched as jest.Mock).mockReturnValue(false);
    await flowExecutionWorkflow(input);
    expect(activities.sendDirectMessage.mock.calls[0][3]).toBe('antiga');
  });
  it('nova execucao e retry usam mesma alternativa sem consumir sorteio publico', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    const random = jest.spyOn(Math, 'random');
    await flowExecutionWorkflow(input);
    await flowExecutionWorkflow(input);
    expect(
      activities.sendDirectMessage.mock.calls.map((call) => call[3])
    ).toEqual([
      stablePrivateMessage(config, 'e:dm', true),
      stablePrivateMessage(config, 'e:dm', true),
    ]);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
  it('gate congela alternativa antes de criar postback e nao faz envio final', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    const flow = await activities.getFlowWithNodes();
    flow.nodes[0].data = JSON.stringify({ requireFollow: true });
    activities.createPendingPostback.mockResolvedValue({ id: 'pending' });
    await flowExecutionWorkflow(input);
    expect(activities.createPendingPostback).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotFinalDm: stablePrivateMessage(config, 'e:dm', true),
      })
    );
    expect(activities.sendDirectMessage).not.toHaveBeenCalled();
  });
  it('rejeita alternativa expandida alem do limite antes do envio', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    const flow = await activities.getFlowWithNodes();
    flow.nodes[1].data = JSON.stringify({
      messages: ['{comment_text}'],
      buttonText: 'Abrir',
      buttonUrl: 'https://example.com',
    });
    await expect(
      flowExecutionWorkflow({ ...input, commentText: 'x'.repeat(641) })
    ).rejects.toThrow('MESSAGE_TOO_LONG');
    expect(activities.sendDirectMessage).not.toHaveBeenCalled();
    expect(activities.updateExecution).toHaveBeenCalledWith(
      'e',
      expect.objectContaining({ status: 'FAILED' })
    );
  });
});

describe('DM com botao proprio por alternativa versionada', () => {
  const input = {
    executionId: 'variant-execution',
    flowId: 'f',
    integrationId: 'i',
    triggerType: 'comment_on_post' as const,
    igCommenterId: 'actor',
    igCommentId: 'c',
    igMediaId: 'p',
    commentText: 'QUERO',
  };
  const variants = [
    {
      message: 'Material A',
      buttonText: 'Abrir A',
      buttonUrl: 'https://example.com/a',
    },
    {
      message: 'Material B',
      buttonText: 'Abrir B',
      buttonUrl: 'https://example.com/b',
    },
  ];
  beforeEach(() => {
    jest.clearAllMocks();
    (patched as jest.Mock).mockReset().mockReturnValue(true);
    activities.getFlowWithNodes.mockResolvedValue({
      integrationId: 'i',
      organizationId: 'o',
      nodes: [
        { id: 'trigger', type: 'TRIGGER', data: '{}' },
        { id: 'dm', type: 'SEND_DM', data: JSON.stringify({ variants }) },
      ],
      edges: [{ sourceNodeId: 'trigger', targetNodeId: 'dm' }],
    });
  });

  it('replay sem patch novo ignora variants historicamente desconhecido', async () => {
    (patched as jest.Mock).mockImplementation(
      (id: string) => id === 'private-message-variants-v1'
    );
    const flow = await activities.getFlowWithNodes();
    flow.nodes[1].data = JSON.stringify({
      message: 'Texto antigo',
      buttonText: 'Botao antigo',
      buttonUrl: 'https://example.com/antigo',
      variants,
    });
    await flowExecutionWorkflow(input);
    expect(activities.sendDirectMessage).toHaveBeenCalledTimes(1);
    const call = activities.sendDirectMessage.mock.calls[0];
    expect([call[3], call[5], call[6]]).toEqual([
      'Texto antigo',
      'Botao antigo',
      'https://example.com/antigo',
    ]);
    expect(patched).toHaveBeenCalledWith('private-message-button-variants-v1');
  });

  it('patch antigo da lista permanece estavel quando patch dos objetos esta desligado', async () => {
    (patched as jest.Mock).mockImplementation(
      (id: string) => id === 'private-message-variants-v1'
    );
    const flow = await activities.getFlowWithNodes();
    const old = {
      messages: ['Legada A', 'Legada B'],
      buttonText: 'Global antigo',
      buttonUrl: 'https://example.com/legado',
      variants,
    };
    flow.nodes[1].data = JSON.stringify(old);
    await flowExecutionWorkflow(input);
    const call = activities.sendDirectMessage.mock.calls[0];
    expect([call[3], call[5], call[6]]).toEqual([
      stablePrivateMessage(old, `${input.executionId}:dm`, true),
      'Global antigo',
      'https://example.com/legado',
    ]);
  });

  it('patch novo seleciona e repete o mesmo par sem consumir RNG publico', async () => {
    const expected = stablePrivateVariant(variants, `${input.executionId}:dm`);
    const random = jest.spyOn(Math, 'random');
    try {
      await flowExecutionWorkflow(input);
      await flowExecutionWorkflow(input);
      expect(
        activities.sendDirectMessage.mock.calls.map((call) => [
          call[3],
          call[5],
          call[6],
        ])
      ).toEqual([
        [expected.message, expected.buttonText, expected.buttonUrl],
        [expected.message, expected.buttonText, expected.buttonUrl],
      ]);
      expect(patched).toHaveBeenCalledWith(
        'private-message-button-variants-v1'
      );
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it('gate congela o mesmo texto e CTA antes do postback inclusive ao repetir', async () => {
    const flow = await activities.getFlowWithNodes();
    flow.nodes[0].data = JSON.stringify({
      requireFollow: true,
      openingDmMessage: 'Receber',
      openingDmButtonText: 'Continuar',
    });
    activities.createPendingPostback.mockResolvedValue({
      id: 'pending-variant',
    });
    const expected = stablePrivateVariant(variants, `${input.executionId}:dm`);
    await flowExecutionWorkflow(input);
    await flowExecutionWorkflow(input);
    expect(activities.createPendingPostback).toHaveBeenCalledTimes(2);
    for (const call of activities.createPendingPostback.mock.calls) {
      expect(call[0]).toMatchObject({
        snapshotFinalDm: expected.message,
        snapshotFinalBtnText: expected.buttonText,
        snapshotFinalBtnUrl: expected.buttonUrl,
      });
    }
    expect(activities.sendOpeningDmWithPostback).toHaveBeenCalledWith(
      'pending-variant'
    );
    expect(activities.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('alternativa sem botao nao herda CTA de outra alternativa', async () => {
    const flow = await activities.getFlowWithNodes();
    flow.nodes[1].data = JSON.stringify({
      variants: [{ message: 'Texto sem botao' }],
    });
    await flowExecutionWorkflow(input);
    const call = activities.sendDirectMessage.mock.calls[0];
    expect([call[3], call[5], call[6]]).toEqual([
      'Texto sem botao',
      undefined,
      undefined,
    ]);
  });

  it('valida texto interpolado contra o CTA selecionado antes de enviar ou criar gate', async () => {
    const flow = await activities.getFlowWithNodes();
    flow.nodes[1].data = JSON.stringify({
      variants: [
        {
          message: '{comment_text}',
          buttonText: 'Abrir',
          buttonUrl: 'https://example.com',
        },
      ],
    });
    await expect(
      flowExecutionWorkflow({ ...input, commentText: 'x'.repeat(641) })
    ).rejects.toThrow('MESSAGE_TOO_LONG');
    expect(activities.sendDirectMessage).not.toHaveBeenCalled();
    expect(activities.createPendingPostback).not.toHaveBeenCalled();
    expect(activities.updateExecution).toHaveBeenCalledWith(
      input.executionId,
      expect.objectContaining({ status: 'FAILED' })
    );
  });
});


describe('DELAY - automacao pausada ou canal desativado durante a espera', () => {
  const input = {
    executionId: 'e2',
    flowId: 'f2',
    integrationId: 'i',
    triggerType: 'comment_on_post' as const,
    igCommenterId: 'actor',
    igCommentId: 'c',
    igMediaId: 'p',
  };
  beforeEach(() => {
    jest.clearAllMocks();
    activities.getFlowWithNodes.mockResolvedValue({
      integrationId: 'i',
      organizationId: 'o',
      nodes: [
        { id: 'trigger', type: 'TRIGGER', data: '{}' },
        { id: 'wait', type: 'DELAY', data: JSON.stringify({ duration: 2, unit: 'hours' }) },
        { id: 'reply', type: 'REPLY_COMMENT', data: JSON.stringify({ message: 'oi' }) },
        { id: 'dm', type: 'SEND_DM', data: JSON.stringify({ message: 'link' }) },
      ],
      edges: [
        { sourceNodeId: 'trigger', targetNodeId: 'wait' },
        { sourceNodeId: 'wait', targetNodeId: 'reply' },
        { sourceNodeId: 'reply', targetNodeId: 'dm' },
      ],
    });
  });

  it('nao responde nem manda DM se a automacao parou de valer apos o DELAY', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    activities.isFlowRunnable.mockResolvedValue(false);

    await flowExecutionWorkflow(input);

    expect(activities.isFlowRunnable).toHaveBeenCalledWith('f2');
    expect(activities.replyToComment).not.toHaveBeenCalled();
    expect(activities.sendDirectMessage).not.toHaveBeenCalled();
    expect(activities.updateExecution).toHaveBeenCalledWith(
      'e2',
      expect.objectContaining({ status: 'CANCELLED' })
    );
  });

  it('segue normalmente quando a automacao continua ativa', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    activities.isFlowRunnable.mockResolvedValue(true);

    await flowExecutionWorkflow(input);

    expect(activities.replyToComment).toHaveBeenCalled();
    expect(activities.sendDirectMessage).toHaveBeenCalled();
  });

  it('execucao antiga (replay sem o patch) nao ganha a checagem', async () => {
    (patched as jest.Mock).mockReturnValue(false);

    await flowExecutionWorkflow(input);

    expect(activities.isFlowRunnable).not.toHaveBeenCalled();
    expect(activities.replyToComment).toHaveBeenCalled();
  });
});
