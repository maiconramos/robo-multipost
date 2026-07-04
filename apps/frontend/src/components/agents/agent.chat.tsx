'use client';

import React, {
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { CopilotChat, CopilotKitCSSProperties } from '@copilotkit/react-ui';
import {
  ErrorMessageProps,
  InputProps,
  UserMessageProps,
} from '@copilotkit/react-ui/dist/components/chat/props';
import { Input } from '@gitroom/frontend/components/agents/agent.input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import {
  CopilotKit,
  useCopilotAction,
  useCopilotMessagesContext,
} from '@copilotkit/react-core';
import {
  MediaPortal,
  PropertiesContext,
} from '@gitroom/frontend/components/agents/agent';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useParams } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { TextMessage } from '@copilotkit/runtime-client-gql';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import dayjs from 'dayjs';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Classifica a mensagem crua de erro do streaming do agente (CopilotKit
// nao expoe status HTTP — o erro chega como texto). Espelha o mapeamento
// do backend `buildFriendlyProviderMessage` em ai-text.service.ts.
// Remove material sensivel (Bearer tokens, chaves sk-...) que o provedor
// possa ecoar na mensagem crua do stream, antes de exibir o "Detalhe".
// Espelha `sanitize()` de ai-text.service.ts / ai-video.service.ts.
const sanitize = (value: string): string =>
  (value || '')
    .replace(/Bearer\s+[A-Za-z0-9_.\-]+/gi, 'Bearer ***')
    .replace(/\bsk-[A-Za-z0-9_.\-]{6,}/gi, 'sk-***');

type AiErrorKind = 'config' | 'credits' | 'auth' | 'rate_limit' | 'generic';

const classifyAiError = (raw?: string): AiErrorKind => {
  const lower = (raw || '').toLowerCase();
  // Credencial nao configurada / nao compartilhada (HTTP 412 do
  // AiProviderResolverService). Verificado ANTES de auth para nao ser
  // confundido com erro de chave invalida.
  if (
    /modelos de ia|configure suas chaves|nao esta compartilhando|não está compartilhando|precondition|412/.test(
      lower
    )
  ) {
    return 'config';
  }
  if (
    /credit|insufficient|afford|quota|billing|payment|fund|saldo|402/.test(
      lower
    )
  ) {
    return 'credits';
  }
  if (/unauthor|api key|invalid.{0,12}key|authentication|forbidden|401|403/.test(lower)) {
    return 'auth';
  }
  if (/rate.?limit|too many|429/.test(lower)) {
    return 'rate_limit';
  }
  return 'generic';
};

const friendlyAiErrorMessage = (
  raw: string | undefined,
  t: ReturnType<typeof useT>
): string => {
  switch (classifyAiError(raw)) {
    case 'config':
      return t(
        'ai_assistant_provider_not_configured',
        'Configure suas chaves de IA em Configurações > Modelos de IA. Se você usa um perfil secundário, verifique se o perfil padrão está compartilhando a credencial.'
      );
    case 'credits':
      return t(
        'ai_provider_no_credits',
        'Seu provedor de IA está sem créditos ou atingiu o limite de cobrança. Verifique o saldo na conta do provedor e tente novamente.'
      );
    case 'auth':
      return t(
        'ai_provider_auth_error',
        'Falha de autenticação no provedor de IA. Confira a chave de API em Configurações > Modelos de IA.'
      );
    case 'rate_limit':
      return t(
        'ai_provider_rate_limit',
        'O provedor de IA atingiu o limite de requisições. Aguarde alguns instantes e tente novamente.'
      );
    default:
      return t(
        'ai_assistant_generic_error',
        'O assistente encontrou um erro ao responder. Tente novamente em instantes.'
      );
  }
};

// Renderizado pelo CopilotChat quando o streaming do agente falha (ex.:
// provedor de IA sem creditos). Sem isso o usuario nao recebia feedback
// nenhum — o erro so aparecia no console (runChatCompletion).
const AgentErrorMessage: FC<ErrorMessageProps> = ({ error }) => {
  const t = useT();
  const raw = error?.message || '';
  return (
    <div className="copilotKitMessage copilotKitAssistantMessage !bg-red-500/10 border border-red-500/40 rounded-[8px] p-[12px] my-[8px] text-[14px]">
      <div className="font-semibold text-red-400 mb-[4px]">
        {t('ai_assistant_error_title', 'Não foi possível responder')}
      </div>
      <div className="opacity-90">{friendlyAiErrorMessage(raw, t)}</div>
      {raw ? (
        <div className="text-[11px] opacity-50 mt-[8px] break-words">
          {t('detail_label', 'Detalhe')}: {sanitize(raw)}
        </div>
      ) : null}
    </div>
  );
};

export const AgentChat: FC = () => {
  const { backendUrl } = useVariables();
  const params = useParams<{ id: string }>();
  const { properties } = useContext(PropertiesContext);
  const t = useT();
  const toaster = useToaster();

  return (
    <CopilotKit
      {...(params.id === 'new' ? {} : { threadId: params.id })}
      credentials="include"
      runtimeUrl={backendUrl + '/copilot/agent'}
      showDevConsole={false}
      agent="postiz"
      properties={{
        integrations: properties,
      }}
    >
      <Hooks />
      <LoadMessages id={params.id} />
      <div
        style={
          {
            '--copilot-kit-primary-color': 'var(--new-btn-text)',
            '--copilot-kit-background-color': 'var(--new-bg-color)',
          } as CopilotKitCSSProperties
        }
        className="trz agent bg-newBgColorInner flex flex-col gap-[15px] transition-all flex-1 items-center relative"
      >
        <div className="absolute left-0 w-full h-full pb-[20px]">
          <CopilotChat
            className="w-full h-full"
            labels={{
              title: t('your_assistant', 'Your Assistant'),
              placeholder: t('agent_input_placeholder', 'Type a message...'),
              initial: t('agent_welcome_message', `Hello, I am your Postiz agent 🙌🏻.
              
I can schedule a post or multiple posts to multiple channels and generate pictures and videos.

You can select the channels you want to use from the left menu.

You can see your previous conversations from the right menu.

You can also use me as an MCP Server, check Settings >> Public API
`),
            }}
            UserMessage={Message}
            Input={NewInput}
            ErrorMessage={AgentErrorMessage}
            onError={(errorEvent) =>
              toaster.show(
                friendlyAiErrorMessage(
                  (errorEvent?.error as { message?: string })?.message,
                  t
                ),
                'warning'
              )
            }
          />
        </div>
      </div>
    </CopilotKit>
  );
};

const LoadMessages: FC<{ id: string }> = ({ id }) => {
  const { setMessages } = useCopilotMessagesContext();
  const fetch = useFetch();

  const loadMessages = useCallback(async (idToSet: string) => {
    const data = await (await fetch(`/copilot/${idToSet}/list`)).json();
    setMessages(
      data.uiMessages.map((p: any) => {
        return new TextMessage({
          content: p.content,
          role: p.role,
        });
      })
    );
  }, []);

  useEffect(() => {
    if (id === 'new') {
      setMessages([]);
      return;
    }
    loadMessages(id);
  }, [id]);

  return null;
};

const Message: FC<UserMessageProps> = (props) => {
  const convertContentToImagesAndVideo = useMemo(() => {
    return (props.message?.content || '')
      .replace(/Video: (http.*mp4\n)/g, (match, p1) => {
        return `<video controls class="h-[150px] w-[150px] rounded-[8px] mb-[10px]"><source src="${p1.trim()}" type="video/mp4">Your browser does not support the video tag.</video>`;
      })
      .replace(/Image: (http.*\n)/g, (match, p1) => {
        return `<img src="${p1.trim()}" class="h-[150px] w-[150px] max-w-full border border-newBgColorInner" />`;
      })
      .replace(/\[\-\-Media\-\-\](.*)\[\-\-Media\-\-\]/g, (match, p1) => {
        return `<div class="flex justify-center mt-[20px]">${p1}</div>`;
      })
      .replace(
        /(\[--integrations--\][\s\S]*?\[--integrations--\])/g,
        (match, p1) => {
          return ``;
        }
      );
  }, [props.message?.content]);
  return (
    <div
      className="copilotKitMessage copilotKitUserMessage min-w-[300px]"
      dangerouslySetInnerHTML={{ __html: convertContentToImagesAndVideo }}
    />
  );
};
const NewInput: FC<InputProps> = (props) => {
  const [media, setMedia] = useState([] as { path: string; id: string }[]);
  const [value, setValue] = useState('');
  const { properties } = useContext(PropertiesContext);
  return (
    <>
      <MediaPortal
        value={value}
        media={media}
        setMedia={(e) => setMedia(e.target.value)}
      />
      <Input
        {...props}
        onChange={setValue}
        onSend={(text) => {
          const send = props.onSend(
            text +
              (media.length > 0
                ? '\n[--Media--]' +
                  media
                    .map((m) =>
                      m.path.indexOf('mp4') > -1
                        ? `Video: ${m.path}`
                        : `Image: ${m.path}`
                    )
                    .join('\n') +
                  '\n[--Media--]'
                : '') +
              `
${
  properties.length
    ? `[--integrations--]
Use the following social media platforms: ${JSON.stringify(
        properties.map((p) => ({
          id: p.id,
          platform: p.identifier,
          profilePicture: p.picture,
          additionalSettings: p.additionalSettings,
        }))
      )}
[--integrations--]`
    : ``
}`
          );
          setValue('');
          setMedia([]);
          return send;
        }}
      />
    </>
  );
};

export const Hooks: FC = () => {
  const modals = useModals();

  useCopilotAction({
    name: 'manualPosting',
    description:
      'This tool should be triggered when the user wants to manually add the generated post',
    parameters: [
      {
        name: 'list',
        type: 'object[]',
        description:
          'list of posts to schedule to different social media (integration ids)',
        attributes: [
          {
            name: 'integrationId',
            type: 'string',
            description: 'The integration id',
          },
          {
            name: 'date',
            type: 'string',
            description: 'UTC date of the scheduled post',
          },
          {
            name: 'settings',
            type: 'object',
            description: 'Settings for the integration [input:settings]',
          },
          {
            name: 'posts',
            type: 'object[]',
            description: 'list of posts / comments (one under another)',
            attributes: [
              {
                name: 'content',
                type: 'string',
                description: 'the content of the post',
              },
              {
                name: 'attachments',
                type: 'object[]',
                description: 'list of attachments',
                attributes: [
                  {
                    name: 'id',
                    type: 'string',
                    description: 'id of the attachment',
                  },
                  {
                    name: 'path',
                    type: 'string',
                    description: 'url of the attachment',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    renderAndWaitForResponse: ({ args, status, respond }) => {
      if (status === 'executing') {
        return <OpenModal args={args} respond={respond} />;
      }

      return null;
    },
  });
  return null;
};

const OpenModal: FC<{
  respond: (value: any) => void;
  args: {
    list: {
      integrationId: string;
      date: string;
      settings?: Record<string, any>;
      posts: { content: string; attachments: { id: string; path: string }[] }[];
    }[];
  };
}> = ({ args, respond }) => {
  const modals = useModals();
  const { properties } = useContext(PropertiesContext);
  const startModal = useCallback(async () => {
    for (const integration of args.list) {
      const foundIntegration = properties.find(
        (p) => p.id === integration.integrationId
      );
      if (!foundIntegration) {
        continue;
      }
      await new Promise((res) => {
        const group = makeId(10);
        modals.openModal({
          id: 'add-edit-modal',
          closeOnClickOutside: false,
          removeLayout: true,
          fullScreen: true,
          closeOnEscape: false,
          withCloseButton: false,
          askClose: true,
          size: '80%',
          title: ``,
          classNames: {
            modal: 'w-[100%] max-w-[1400px] text-textColor',
          },
          children: (
            <ExistingDataContextProvider
              value={{
                group,
                integration: integration.integrationId,
                integrationPicture: foundIntegration.picture || '',
                settings: integration.settings || {},
                posts: integration.posts.map((p) => ({
                  approvedSubmitForOrder: 'NO',
                  content: p.content,
                  createdAt: new Date().toISOString(),
                  state: 'DRAFT',
                  id: makeId(10),
                  settings: JSON.stringify(integration.settings || {}),
                  group,
                  integrationId: integration.integrationId,
                  integration: foundIntegration,
                  publishDate: dayjs.utc(integration.date).toISOString(),
                  image: p.attachments.map((a) => ({
                    id: a.id,
                    path: a.path,
                  })),
                })),
              }}
            >
              <AddEditModal
                date={dayjs.utc(integration.date)}
                allIntegrations={properties}
                integrations={[foundIntegration]}
                onlyValues={integration.posts.map((p) => ({
                  content: p.content,
                  id: makeId(10),
                  settings: integration.settings || {},
                  image: p.attachments.map((a) => ({
                    id: a.id,
                    path: a.path,
                  })),
                }))}
                reopenModal={() => {}}
                mutate={() => res(true)}
              />
            </ExistingDataContextProvider>
          ),
        });
      });
    }

    respond('User scheduled all the posts');
  }, [args, respond, properties]);

  useEffect(() => {
    startModal();
  }, []);
  return (
    <div onClick={() => respond('continue')}>
      Opening manually ${JSON.stringify(args)}
    </div>
  );
};
