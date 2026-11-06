jest.mock('../integration.manager', () => ({}));
import { IntegrationService } from '../../database/prisma/integrations/integration.service';
import { createMock } from '../../test';
import { AutomationHistoryService } from '../../database/prisma/automation-history/automation-history.service';
import { AutomationManagementService } from './automation-management.service';
import { FlowsService } from '../../database/prisma/flows/flows.service';
import { SharedFlowsService } from '../../database/prisma/flows-v2/shared-flows.service';
import { ScheduledPostsService } from '../../database/prisma/scheduled-automations/scheduled-posts.service';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { RepostService } from '../../database/prisma/repost/repost.service';
import {
  simpleDefinition,
  normalizeDefinition,
} from '../../database/prisma/flows-v2/flow-definition';
import { automationCanvasSchema } from '../../dtos/flows/automation-management.dto';

describe('gerenciamento de automacoes por API e agentes', () => {
  const scope = { organizationId: 'org', profileId: 'perfil' };
  const integrations = createMock<IntegrationService>();
  const flows = createMock<FlowsService>();
  const shared = createMock<SharedFlowsService>();
  const scheduled = createMock<ScheduledPostsService>();
  const profiles = createMock<ProfileService>();
  const repost = createMock<RepostService>();
  const executionHistory = createMock<AutomationHistoryService>();
  let service: AutomationManagementService;
  const legacy = () => ({
    id: 'ig-flow',
    name: 'IG',
    status: 'PAUSED',
    revision: 2,
    updatedAt: new Date('2026-10-27T12:00:00Z'),
    integrationId: 'ig',
    executionVersion: 1,
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        data: JSON.stringify({
          triggerType: 'comment_on_post',
          mode: 'scheduled',
          scheduledPostId: 'local-post',
          keywords: ['QUERO'],
          requireFollow: true,
          openingDmMessage: 'Inicio',
          openingDmButtonText: 'Receber',
          alreadyFollowedButtonText: 'Ja sigo',
          gateExhaustedMessage: 'Fim',
          maxGateAttempts: 7,
          followGateMessage: 'Siga',
        }),
      },
      {
        id: 'reply',
        type: 'REPLY_COMMENT',
        data: JSON.stringify({ messages: ['A', 'B'], message: 'A' }),
      },
      {
        id: 'dm',
        type: 'SEND_DM',
        data: JSON.stringify({
          message: 'Link',
          buttonText: 'Ver',
          buttonUrl: 'https://example.com',
        }),
      },
    ],
    edges: [
      { sourceNodeId: 'trigger', targetNodeId: 'reply' },
      { sourceNodeId: 'reply', targetNodeId: 'dm' },
    ],
  });
  beforeEach(() => {
    jest.clearAllMocks();
    integrations.getIntegrationById.mockImplementation(
      (org, id) =>
        Promise.resolve({
          id,
          organizationId: org,
          profileId: 'perfil',
        }) as never
    );
    service = new AutomationManagementService(
      flows,
      shared,
      scheduled,
      profiles,
      repost,
      executionHistory,
      integrations
    );
    profiles.getProfileById.mockResolvedValue({ id: 'perfil' } as any);
    profiles.getDefaultProfile.mockResolvedValue({ id: 'default' } as any);
    shared.listChannels.mockResolvedValue([
      { id: 'ig', providerIdentifier: 'instagram' },
      { id: 'fb', providerIdentifier: 'facebook' },
    ] as any);
    flows.getFlow.mockResolvedValue(legacy() as any);
    flows.listAliases.mockResolvedValue([]);
    flows.quickCreateFlow.mockResolvedValue({
      id: 'ig-flow',
      status: 'ACTIVE',
    } as any);
    flows.createFlow.mockResolvedValue({
      id: 'ig-flow',
      status: 'DRAFT',
    } as any);
    flows.createDraftFlow.mockResolvedValue({
      id: 'ig-flow',
      status: 'DRAFT',
    } as any);
    flows.checkIntegrationWebhook.mockResolvedValue({ ok: true });
    flows.updateFlowStatus.mockResolvedValue({
      id: 'ig-flow',
      status: 'ACTIVE',
    } as any);
    flows.quickUpdateFlow.mockResolvedValue(legacy() as any);
    shared.save.mockResolvedValue({
      id: 'fb-flow',
      name: 'FB',
      status: 'DRAFT',
      revision: 1,
      executionVersion: 2,
      channels: [
        {
          integrationId: 'fb',
          platform: 'facebook',
          postMode: 'all',
          postIds: [],
        },
      ],
      definition: simpleDefinition({ message: 'Oi' }),
    } as any);
    shared.status.mockResolvedValue({
      id: 'fb-flow',
      status: 'ACTIVE',
      revision: 2,
    } as any);
  });
  it.each([
    {
      platform: 'instagram',
      triggerType: 'comment_on_post',
      integrationId: 'ig',
    },
    {
      platform: 'facebook',
      triggerType: 'comment_on_post',
      integrationId: 'fb',
    },
    {
      platform: 'facebook',
      triggerType: 'messenger_message',
      integrationId: 'fb',
    },
  ])(
    'recusa conta fora do Default pela fachada antes de salvar: %p',
    async (channel) => {
      const resolved = await service.scope('org');
      shared.listChannels.mockResolvedValue([]);
      await expect(
        service.create(resolved, {
          ...channel,
          name: 'Outro perfil',
          keywords: ['quero'],
          dmMessage: 'Link',
          activate: false,
        })
      ).rejects.toThrow('CHANNEL_NOT_FOUND');
      expect(shared.listChannels).toHaveBeenCalledWith({
        organizationId: 'org',
        profileId: 'default',
      });
      expect(flows.createDraftFlow).not.toHaveBeenCalled();
      expect(flows.quickUpdateFlow).not.toHaveBeenCalled();
      expect(flows.checkIntegrationWebhook).not.toHaveBeenCalled();
      expect(shared.save).not.toHaveBeenCalled();
      expect(shared.status).not.toHaveBeenCalled();
    }
  );
  it('encaminha todos os campos do follow gate, variacoes e alvo agendado do Instagram', async () => {
    const config = {
      name: 'Completa',
      integrationId: 'ig',
      platform: 'instagram',
      postMode: 'scheduled',
      scheduledPostId: 'local-post',
      keywords: ['QUERO'],
      matchMode: 'all',
      replyMessages: ['A', 'B'],
      dmMessage: 'DM',
      dmButtonText: 'Ver',
      dmButtonUrl: 'https://example.com',
      requireFollow: true,
      followGateMessage: 'Siga',
      openingDmMessage: 'Inicio',
      openingDmButtonText: 'Receber',
      alreadyFollowedButtonText: 'Ja sigo',
      gateExhaustedMessage: 'Fim',
      maxGateAttempts: 7,
    };
    await service.create(scope, config);
    const { platform, ...legacyConfig } = config;
    expect(flows.quickUpdateFlow).toHaveBeenCalledWith(
      'org',
      'ig-flow',
      expect.objectContaining({ ...legacyConfig, activate: false }),
      'perfil'
    );
    expect(flows.quickUpdateFlow.mock.calls[0][2]).not.toHaveProperty(
      'platform'
    );
  });
  it('cria Messenger com palavra chave e prioridade no mesmo motor deduplicado', async () => {
    await service.create(scope, {
      platform: 'facebook',
      name: 'Messenger',
      integrationId: 'fb',
      triggerType: 'messenger_message',
      keywords: ['preco'],
      priority: 25,
      dmMessage: 'Link',
    });
    const input = shared.save.mock.calls[0][1];
    expect(input.channels).toEqual([
      { integrationId: 'fb', postMode: 'all', postIds: [] },
    ]);
    expect(JSON.parse(input.definition.nodes[0].data)).toMatchObject({
      triggerType: 'messenger_message',
      priority: 25,
      keywords: ['preco'],
    });
    expect(flows.quickCreateFlow).not.toHaveBeenCalled();
  });
  it('prepara Instagram sem preflight e revalida a conexao somente na ativacao explicita', async () => {
    await service.create(scope, {
      name: 'Draft',
      integrationId: 'ig',
      postMode: 'all',
      dmMessage: 'Link',
      activate: false,
    });
    expect(flows.createDraftFlow).toHaveBeenCalledWith(
      'org',
      expect.objectContaining({ integrationId: 'ig' }),
      'perfil'
    );
    expect(flows.createFlow).not.toHaveBeenCalled();
    expect(flows.checkIntegrationWebhook).not.toHaveBeenCalled();
    flows.checkIntegrationWebhook.mockResolvedValue({
      ok: false,
      error: 'detalhes internos',
    });
    await expect(service.status(scope, 'ig-flow', 1, 'ACTIVE')).rejects.toThrow(
      'CONNECTION_CHECK_REQUIRED'
    );
    expect(flows.updateFlowStatus).not.toHaveBeenCalled();
  });
  it('cria e edita resposta publica Facebook sem inserir DM vazia e preserva layout', async () => {
    shared.save.mockImplementation(
      async (_scope, body) =>
        ({
          id: 'fb-flow',
          name: body.name,
          status: 'DRAFT',
          revision: 1,
          executionVersion: 2,
          channels: [
            {
              integrationId: 'fb',
              platform: 'facebook',
              postMode: 'all',
              postIds: [],
            },
          ],
          definition: normalizeDefinition(body.definition),
        } as any)
    );
    await service.create(scope, {
      platform: 'facebook',
      name: 'Publica',
      integrationId: 'fb',
      postMode: 'all',
      replyMessages: ['A', 'B'],
      activate: false,
    });
    expect(
      shared.save.mock.calls[0][1].definition.nodes.map((n) => n.type)
    ).toEqual(['TRIGGER', 'REPLY_COMMENT']);
    const flow = (await shared.save.mock.results[0].value) as Awaited<
      ReturnType<SharedFlowsService['save']>
    >;
    flow.definition.nodes[1].label = 'Publica personalizada';
    flow.definition.nodes[1].positionX = 713;
    shared.get.mockResolvedValue(flow);
    await service.update(scope, 'fb-flow', 2, {
      configuration: { name: 'Novo nome' },
      expectedRevision: 1,
    });
    expect(shared.save.mock.calls[1][1].definition.nodes[1]).toMatchObject({
      label: 'Publica personalizada',
      positionX: 713,
    });
    expect(
      shared.save.mock.calls[1][1].definition.nodes.some(
        (n) => n.type === 'SEND_DM'
      )
    ).toBe(false);
  });
  it('nao aceita aliases em Story nem nome de canvas vazio', async () => {
    const story = legacy();
    story.nodes[0].data = JSON.stringify({
      triggerType: 'story_reply',
      mode: 'all',
    });
    flows.getFlow.mockResolvedValue(story as any);
    await expect(
      service.aliases(scope, 'ig-flow', {
        operation: 'add',
        aliasMediaId: '1234',
      })
    ).rejects.toThrow('INSTAGRAM_COMMENT_ALIASES_ONLY');
    expect(flows.addManualAlias).not.toHaveBeenCalled();
    expect(
      automationCanvasSchema.safeParse({ name: '  ', nodes: [], edges: [] })
        .success
    ).toBe(false);
  });
  it.each([
    { platform: 'facebook', integrationId: 'fb', requireFollow: true },
    {
      platform: 'facebook',
      integrationId: 'fb',
      dmMessage: '',
      activate: false,
    },
    {
      platform: 'facebook',
      integrationId: 'fb',
      triggerType: 'messenger_message',
      keywords: [],
    },
    {
      platform: 'facebook',
      integrationId: 'fb',
      triggerType: 'messenger_message',
      keywords: ['x'],
      postMode: 'specific',
      postIds: ['1_2'],
    },
    { integrationId: 'ig', postMode: 'all', postIds: ['123'] },
    {
      integrationId: 'ig',
      triggerType: 'story_reply',
      replyMessages: ['Nao pode'],
    },
    {
      integrationId: 'ig',
      triggerType: 'story_reply',
      postMode: 'scheduled',
      scheduledPostId: 'local',
    },
    { integrationId: 'ig', extraField: 'nao ignorar' },
  ])('rejeita combinacao incompatível antes de gravar %#', async (extra) => {
    await expect(
      service.create(scope, { name: 'Teste', dmMessage: 'DM', ...extra })
    ).rejects.toBeDefined();
    expect(flows.quickCreateFlow).not.toHaveBeenCalled();
    expect(shared.save).not.toHaveBeenCalled();
  });
  it('recupera todos os campos e atualiza parcialmente sem apagar follow gate e variacoes', async () => {
    const detail = await service.detail(scope, 'ig-flow', 1);
    expect(detail.configuration).toMatchObject({
      postMode: 'scheduled',
      scheduledPostId: 'local-post',
      replyMessages: ['A', 'B'],
      openingDmMessage: 'Inicio',
      maxGateAttempts: 7,
    });
    await service.update(scope, 'ig-flow', 1, {
      configuration: { dmMessage: 'Alterada' },
      expectedUpdatedAt: detail.updatedAt,
    });
    expect(flows.quickUpdateFlow).toHaveBeenCalledWith(
      'org',
      'ig-flow',
      expect.objectContaining({
        dmMessage: 'Alterada',
        replyMessages: ['A', 'B'],
        maxGateAttempts: 7,
        scheduledPostId: 'local-post',
      }),
      'perfil'
    );
  });
  it('canvas do detalhe normaliza nulos opcionais para permitir ida e volta sem perda', async () => {
    const graph = legacy();
    flows.getFlow.mockResolvedValue({
      ...graph,
      nodes: graph.nodes.map((n, i) => ({
        ...n,
        label: null,
        positionX: 0,
        positionY: i * 100,
      })),
      edges: graph.edges.map((e, i) => ({
        ...e,
        id: `edge-${i}`,
        sourceHandle: null,
      })),
    } as any);
    const detail = await service.detail(scope, 'ig-flow', 1);
    expect(
      'canvas' in detail &&
        automationCanvasSchema.safeParse(detail.canvas).success
    ).toBe(true);
    if ('canvas' in detail) {
      await service.canvas(scope, 'ig-flow', 1, {
        ...detail.canvas,
        expectedUpdatedAt: detail.updatedAt,
      });
      expect(flows.saveCanvas).toHaveBeenCalledWith(
        'org',
        'ig-flow',
        expect.objectContaining({ expectedUpdatedAt: detail.updatedAt }),
        'perfil'
      );
    }
  });
  it('nao achata grafo personalizado nem troca conta durante update', async () => {
    const flow = legacy();
    flow.nodes.push({ id: 'delay', type: 'DELAY', data: '{"duration":5}' });
    flows.getFlow.mockResolvedValue(flow as any);
    await expect(
      service.update(scope, 'ig-flow', 1, { configuration: { dmMessage: 'X' } })
    ).rejects.toThrow('CANVAS_EDIT_REQUIRED');
    flows.getFlow.mockResolvedValue(legacy() as any);
    await expect(
      service.update(scope, 'ig-flow', 1, {
        configuration: { integrationId: 'outra' },
      })
    ).rejects.toThrow('INTEGRATION_IMMUTABLE');
    expect(flows.quickUpdateFlow).not.toHaveBeenCalled();
  });
  it('nao le aliases nem historico se o flow nao pertence ao perfil', async () => {
    flows.getFlow.mockResolvedValue(null);
    await expect(service.detail(scope, 'outro', 1)).rejects.toThrow(
      'FLOW_NOT_FOUND'
    );
    await expect(service.history(scope, 'outro', 1)).rejects.toThrow(
      'FLOW_NOT_FOUND'
    );
    await expect(
      service.aliases(scope, 'outro', { operation: 'list' })
    ).rejects.toThrow('FLOW_NOT_FOUND');
    expect(flows.listAliases).not.toHaveBeenCalled();
    expect(flows.getExecutions).not.toHaveBeenCalled();
  });
  it('exige revisao fornecida para editar V2 em vez de usar a recem consultada', async () => {
    shared.get.mockResolvedValue(await shared.save(scope, {} as any));
    shared.save.mockClear();
    await expect(
      service.update(scope, 'fb-flow', 2, {
        configuration: { dmMessage: 'Nova' },
      })
    ).rejects.toThrow('REVISION_REQUIRED');
    expect(shared.save).not.toHaveBeenCalled();
  });
  it('valida configuracao interna do canvas antes de salvar, inclusive URL e ciclo', async () => {
    await expect(
      service.canvas(scope, 'ig-flow', 1, {
        expectedUpdatedAt: '2026-10-27T12:00:00.000Z',
        nodes: [
          {
            id: 't',
            type: 'TRIGGER',
            data: '{"mode":"all","triggerType":"comment_on_post"}',
            positionX: 0,
            positionY: 0,
          },
          {
            id: 'dm',
            type: 'SEND_DM',
            data: '{"message":"X","buttonText":"Ir","buttonUrl":"http://localhost"}',
            positionX: 0,
            positionY: 0,
          },
        ],
        edges: [{ sourceNodeId: 't', targetNodeId: 'dm' }],
      })
    ).rejects.toBeDefined();
    expect(flows.saveCanvas).not.toHaveBeenCalled();
  });
  it('recusa edicao V1 sem snapshot e quando snapshot esta desatualizado', async () => {
    await expect(
      service.update(scope, 'ig-flow', 1, { configuration: { dmMessage: 'X' } })
    ).rejects.toThrow('UPDATED_AT_REQUIRED');
    await expect(
      service.update(scope, 'ig-flow', 1, {
        configuration: { dmMessage: 'X' },
        expectedUpdatedAt: '2026-10-27T11:00:00.000Z',
      })
    ).rejects.toThrow('REVISION_CONFLICT');
    expect(flows.quickUpdateFlow).not.toHaveBeenCalled();
  });
  it('resolve somente o perfil Default da org quando contexto nao tem perfil', async () => {
    const resolved = await service.scope('org');
    expect(resolved).toEqual({ organizationId: 'org', profileId: 'default' });
    expect(profiles.getDefaultProfile).toHaveBeenCalledWith('org');
  });
  it('preserva alternativas privadas em PATCH omitido e troca para singular explicitamente', async () => {
    const flow = await shared.save(scope, {} as any);
    flow.definition = simpleDefinition({
      message: '',
      dmMessages: ['Primeira', 'Segunda'],
    });
    shared.get.mockResolvedValue(flow);
    const detail = await service.detail(scope, flow.id, 2);
    expect(detail.configuration).toMatchObject({
      dmMessages: ['Primeira', 'Segunda'],
    });
    await service.update(scope, flow.id, 2, {
      configuration: { name: 'Outro nome' },
      expectedRevision: 1,
    });
    expect(
      JSON.parse(
        shared.save.mock.calls
          .at(-1)![1]
          .definition.nodes.find((n) => n.type === 'SEND_DM')!.data
      )
    ).toMatchObject({ messages: ['Primeira', 'Segunda'] });
    await service.update(scope, flow.id, 2, {
      configuration: { dmMessage: 'Unica' },
      expectedRevision: 1,
    });
    expect(
      JSON.parse(
        shared.save.mock.calls
          .at(-1)![1]
          .definition.nodes.find((n) => n.type === 'SEND_DM')!.data
      )
    ).toEqual({ message: 'Unica' });
  });
  it('troca singular por plural e rejeita patch ambiguo ou com alternativa vazia', async () => {
    const flow = await shared.save(scope, {} as any);
    shared.get.mockResolvedValue(flow);
    await service.update(scope, flow.id, 2, {
      configuration: { dmMessages: ['A', 'B'] },
      expectedRevision: 1,
    });
    expect(
      JSON.parse(
        shared.save.mock.calls
          .at(-1)![1]
          .definition.nodes.find((n) => n.type === 'SEND_DM')!.data
      )
    ).toEqual({ messages: ['A', 'B'] });
    await expect(
      service.update(scope, flow.id, 2, {
        configuration: { dmMessage: 'A', dmMessages: ['B'] },
        expectedRevision: 1,
      })
    ).rejects.toThrow('AMBIGUOUS_PRIVATE_REPLY');
    await expect(
      service.update(scope, flow.id, 2, {
        configuration: { dmMessages: ['ok', '   '] },
        expectedRevision: 1,
      })
    ).rejects.toThrow();
  });
  it('extrai a lista legada e preserva gate e botao ao editar somente nome', async () => {
    const flow = legacy();
    flow.nodes[2].data = JSON.stringify({
      messages: ['A', 'B'],
      buttonText: 'Ver',
      buttonUrl: 'https://example.com',
    });
    flows.getFlow.mockResolvedValue(flow as any);
    expect(
      (await service.detail(scope, flow.id, 1)).configuration
    ).toMatchObject({ dmMessages: ['A', 'B'], requireFollow: true });
    await service.update(scope, flow.id, 1, {
      configuration: { name: 'Novo nome' },
      expectedUpdatedAt: flow.updatedAt.toISOString(),
    });
    expect(flows.quickUpdateFlow.mock.calls.at(-1)![2]).toMatchObject({
      dmMessages: ['A', 'B'],
      dmButtonText: 'Ver',
      requireFollow: true,
    });
  });

  describe('alternativas privadas com botao proprio', () => {
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
      { message: 'Sem botao' },
    ];
    const snapshot = {
      expectedRevision: 1,
      expectedUpdatedAt: '2026-10-27T12:00:00.000Z',
    };

    async function configure(version: 1 | 2, data: Record<string, unknown>) {
      if (version === 1) {
        const flow = legacy();
        flow.nodes[2].data = JSON.stringify(data);
        flows.getFlow.mockResolvedValue(flow as any);
        return flow.id;
      }
      const flow = await shared.save(scope, {} as any);
      flow.definition = simpleDefinition({ message: 'Substituir' });
      flow.definition.nodes.find((n) => n.type === 'SEND_DM')!.data =
        JSON.stringify(data);
      shared.get.mockResolvedValue(flow);
      shared.save.mockClear();
      return flow.id;
    }

    function savedDm(version: 1 | 2): Record<string, unknown> {
      if (version === 1)
        return flows.quickUpdateFlow.mock.calls.at(-1)![2] as unknown as Record<
          string,
          unknown
        >;
      return JSON.parse(
        shared.save.mock.calls
          .at(-1)![1]
          .definition.nodes.find((n) => n.type === 'SEND_DM')!.data
      );
    }

    it.each([1, 2] as const)(
      'preserva objetos e CTA ao editar outro campo no motor %s',
      async (version) => {
        const id = await configure(version, { variants });
        expect(
          (await service.detail(scope, id, version)).configuration
        ).toMatchObject({ dmVariants: variants });
        await service.update(scope, id, version, {
          configuration: { name: 'Nome ajustado' },
          ...snapshot,
        });
        const saved = savedDm(version);
        expect(saved[version === 1 ? 'dmVariants' : 'variants']).toEqual(
          variants
        );
        for (const field of version === 1
          ? ['dmMessage', 'dmMessages', 'dmButtonText', 'dmButtonUrl']
          : ['message', 'messages', 'buttonText', 'buttonUrl']) {
          expect(saved[field]).toBeUndefined();
        }
        if (version === 1)
          expect(saved).toMatchObject({
            requireFollow: true,
            openingDmMessage: 'Inicio',
            maxGateAttempts: 7,
          });
      }
    );

    it.each([
      [
        1,
        {
          message: 'Antiga',
          buttonText: 'Global',
          buttonUrl: 'https://example.com/global',
        },
      ],
      [
        1,
        {
          messages: ['Antiga A', 'Antiga B'],
          buttonText: 'Global',
          buttonUrl: 'https://example.com/global',
        },
      ],
      [
        2,
        {
          message: 'Antiga',
          buttonText: 'Global',
          buttonUrl: 'https://example.com/global',
        },
      ],
      [
        2,
        {
          messages: ['Antiga A', 'Antiga B'],
          buttonText: 'Global',
          buttonUrl: 'https://example.com/global',
        },
      ],
    ] as const)(
      'troca singular ou lista por objetos e limpa CTA global no motor %s: %p',
      async (version, original) => {
        const id = await configure(version, original);
        await service.update(scope, id, version, {
          configuration: { dmVariants: variants },
          ...snapshot,
        });
        const saved = savedDm(version);
        expect(saved[version === 1 ? 'dmVariants' : 'variants']).toEqual(
          variants
        );
        for (const field of version === 1
          ? ['dmMessage', 'dmMessages', 'dmButtonText', 'dmButtonUrl']
          : ['message', 'messages', 'buttonText', 'buttonUrl']) {
          expect(saved[field]).toBeUndefined();
        }
      }
    );

    it.each([
      [1, { dmMessage: 'Unica' }],
      [1, { dmMessages: ['Texto A', 'Texto B'] }],
      [2, { dmMessage: 'Unica' }],
      [2, { dmMessages: ['Texto A', 'Texto B'] }],
    ] as const)(
      'troca objetos por singular ou lista explicitamente no motor %s: %p',
      async (version, replacement) => {
        const id = await configure(version, { variants });
        await service.update(scope, id, version, {
          configuration: replacement,
          ...snapshot,
        });
        const saved = savedDm(version);
        expect(
          saved[version === 1 ? 'dmVariants' : 'variants']
        ).toBeUndefined();
        if (version === 1) expect(saved).toMatchObject(replacement);
        else
          expect(saved).toEqual(
            'dmMessage' in replacement
              ? { message: replacement.dmMessage }
              : { messages: replacement.dmMessages }
          );
      }
    );

    it.each([
      { dmMessage: 'Misturada' },
      { dmMessages: ['Misturada'] },
      { dmButtonText: 'Global', dmButtonUrl: 'https://example.com/global' },
    ])(
      'recusa objetos misturados com representacao ou CTA global: %p',
      async (mixed) => {
        await expect(
          service.create(scope, {
            platform: 'facebook',
            name: 'Ambigua',
            integrationId: 'fb',
            postMode: 'all',
            dmVariants: variants,
            ...mixed,
            activate: false,
          })
        ).rejects.toThrow();
        expect(shared.save).not.toHaveBeenCalled();
        expect(flows.createDraftFlow).not.toHaveBeenCalled();
      }
    );

    it.each([1, 2] as const)(
      'recusa alterar somente CTA global em regra por objetos no motor %s',
      async (version) => {
        const id = await configure(version, { variants });
        await expect(
          service.update(scope, id, version, {
            configuration: {
              dmButtonText: 'Nao aplicar',
              dmButtonUrl: 'https://example.com/global',
            },
            ...snapshot,
          })
        ).rejects.toThrow();
        expect(flows.quickUpdateFlow).not.toHaveBeenCalled();
        expect(shared.save).not.toHaveBeenCalled();
      }
    );
  });
  it('lista geral identifica cliente de cada automacao sem usar Default', async () => {
    profiles.getProfilesByOrgId.mockResolvedValue([
      { id: 'a', name: 'AMZ' },
      { id: 'b', name: 'Outro' },
    ] as never);
    flows.getFlows.mockResolvedValue([]);
    shared.list.mockResolvedValue([]);
    await service.listOrganization('org');
    expect(flows.getFlows).toHaveBeenCalledWith('org', 'a');
    expect(flows.getFlows).toHaveBeenCalledWith('org', 'b');
    expect(shared.list).toHaveBeenCalledWith({
      organizationId: 'org',
      profileId: 'a',
    });
    expect(profiles.getDefaultProfile).not.toHaveBeenCalled();
  });

  it('filtro de canal desconectado consulta regras sem exigir prontidao', async () => {
    profiles.getProfilesByOrgId.mockResolvedValue([
      { id: 'a', name: 'AMZ' },
    ] as never);
    integrations.getIntegrationById.mockResolvedValue({
      id: 'ig',
      profileId: 'a',
      disabled: true,
    } as never);
    flows.getFlows.mockResolvedValue([]);
    shared.list.mockResolvedValue([]);
    await service.listOrganization('org', 1, 'ig');
    expect(flows.getFlows).toHaveBeenCalledWith('org', 'a');
    expect(shared.listChannels).not.toHaveBeenCalled();
  });
  it('canal de outro perfil recusa leitura antes de consultar regras', async () => {
    integrations.getIntegrationById.mockResolvedValueOnce({
      id: 'fb',
      profileId: 'outro',
    } as never);
    await expect(service.list(scope, 2, 'fb')).rejects.toThrow(
      'CHANNEL_NOT_FOUND'
    );
    expect(flows.getFlows).not.toHaveBeenCalled();
    expect(shared.list).not.toHaveBeenCalled();
  });
  it('associacao historica flow A canal B impede detalhe canvas aliases e historico', async () => {
    integrations.getIntegrationById.mockResolvedValue({
      id: 'ig',
      profileId: 'outro',
    } as never);
    const payload = {
      expectedUpdatedAt: '2026-10-27T12:00:00.000Z',
      nodes: [
        {
          id: 'trigger',
          type: 'TRIGGER',
          data: '{"triggerType":"comment_on_post","mode":"all"}',
          positionX: 0,
          positionY: 0,
        },
      ],
      edges: [] as { source: string; target: string }[],
    };
    for (const operation of [
      () => service.detail(scope, 'ig-flow', 1),
      () => service.canvas(scope, 'ig-flow', 1, payload),
      () => service.aliases(scope, 'ig-flow', { operation: 'list' }),
      () => service.executionHistory(scope, 'ig-flow', 1, {}),
      () => service.executionDetail(scope, 'ig-flow', 1, 'exec'),
    ])
      await expect(operation()).rejects.toThrow('CHANNEL_NOT_FOUND');
    expect(flows.saveCanvas).not.toHaveBeenCalled();
    expect(flows.listAliases).not.toHaveBeenCalled();
    expect(executionHistory.list).not.toHaveBeenCalled();
    expect(executionHistory.detail).not.toHaveBeenCalled();
  });
  it('status V2 tambem recusa associacao historica de outro cliente', async () => {
    integrations.getIntegrationById.mockResolvedValue({
      id: 'fb',
      profileId: 'outro',
    } as never);
    await expect(
      service.status(scope, 'fb-flow', 2, 'PAUSED', 2)
    ).rejects.toThrow('CHANNEL_NOT_FOUND');
    expect(shared.status).not.toHaveBeenCalled();
  });
});

describe('historico normalizado da fachada', () => {
  const h = createMock<AutomationHistoryService>();
  const scope = { organizationId: 'org', profileId: 'escorpiano' };
  const facade = () =>
    new AutomationManagementService(
      { getFlow: jest.fn().mockResolvedValue({ integrationId: 'ig' }) } as any,
      { get: jest.fn().mockResolvedValue({ channels: [] }) } as any,
      {} as any,
      {} as any,
      {} as any,
      h,
      {
        getIntegrationById: jest
          .fn()
          .mockResolvedValue({ id: 'ig', profileId: 'escorpiano' }),
      } as any
    );
  beforeEach(() => jest.clearAllMocks());
  it.each([
    [1, 'instagram'],
    [2, 'shared'],
  ] as const)(
    'reusa a projecao do painel no motor %s',
    async (version, engine) => {
      await facade().executionHistory(scope, 'f', version, {
        status: 'failed',
        limit: 5,
      });
      expect(h.list).toHaveBeenCalledWith(scope, engine, 'f', {
        status: 'failed',
        limit: 5,
      });
      await facade().executionDetail(scope, 'f', version, 'exec');
      expect(h.detail).toHaveBeenCalledWith(scope, engine, 'f', 'exec');
    }
  );
  it('recusa versao invalida e parametros desconhecidos antes da consulta', async () => {
    await expect(facade().executionHistory(scope, 'f', 3, {})).rejects.toThrow(
      'INVALID_EXECUTION_VERSION'
    );
    await expect(
      facade().executionHistory(scope, 'f', 2, { page: 1 } as any)
    ).rejects.toThrow('INVALID_HISTORY_QUERY');
    expect(h.list).not.toHaveBeenCalled();
  });
});
