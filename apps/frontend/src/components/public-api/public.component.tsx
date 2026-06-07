'use client';

import { useState, useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useUser } from '../layout/user.context';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import copy from 'copy-to-clipboard';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { DeveloperComponent } from '@gitroom/frontend/components/developer/developer.component';
import clsx from 'clsx';

const mcpClients = [
  'Claude Code',
  'Cursor',
  'VS Code / Copilot',
  'Windsurf',
  'Amp',
  'Codex',
  'Gemini CLI',
  'Warp',
] as const;

type McpClient = (typeof mcpClients)[number];

const getMcpConfig = (
  client: McpClient,
  method: 'header' | 'path',
  mcpBase: string,
  apiKey: string
): { config: string; hintKey: string; hintDefault: string } => {
  const urlWithKey = `${mcpBase}/mcp/${apiKey}`;
  const urlBase = `${mcpBase}/mcp`;
  const bearer = `Bearer ${apiKey}`;

  const json = (obj: object) => JSON.stringify(obj, null, 2);

  if (method === 'path') {
    switch (client) {
      case 'Claude Code':
        return {
          config: `claude mcp add postiz --transport http "${urlWithKey}"`,
          hintKey: 'mcp_hint_terminal', hintDefault: 'Execute este comando no seu terminal.',
        };
      case 'Cursor':
        return {
          config: json({ mcpServers: { postiz: { url: urlWithKey } } }),
          hintKey: 'mcp_hint_cursor', hintDefault: 'Adicione ao arquivo .cursor/mcp.json na raiz do projeto.',
        };
      case 'VS Code / Copilot':
        return {
          config: json({ servers: { postiz: { type: 'http', url: urlWithKey } } }),
          hintKey: 'mcp_hint_vscode', hintDefault: 'Adicione ao arquivo .vscode/mcp.json na raiz do projeto.',
        };
      case 'Windsurf':
        return {
          config: json({ mcpServers: { postiz: { serverUrl: urlWithKey } } }),
          hintKey: 'mcp_hint_windsurf', hintDefault: 'Adicione ao arquivo ~/.codeium/windsurf/mcp_config.json',
        };
      case 'Amp':
        return {
          config: `amp mcp add postiz ${urlWithKey}`,
          hintKey: 'mcp_hint_terminal', hintDefault: 'Execute este comando no seu terminal.',
        };
      case 'Codex':
        return {
          config: `# ~/.codex/config.toml\n\n[mcp_servers.postiz]\nurl = "${urlWithKey}"`,
          hintKey: 'mcp_hint_codex', hintDefault: 'Adicione ao arquivo ~/.codex/config.toml',
        };
      case 'Gemini CLI':
        return {
          config: json({ mcpServers: { postiz: { url: urlWithKey } } }),
          hintKey: 'mcp_hint_gemini', hintDefault: 'Adicione ao arquivo ~/.gemini/settings.json',
        };
      case 'Warp':
        return {
          config: json({ postiz: { url: urlWithKey } }),
          hintKey: 'mcp_hint_warp', hintDefault: 'Configurações > MCP Servers > + Add, cole esta configuração.',
        };
    }
  }

  switch (client) {
    case 'Claude Code':
      return {
        config: `claude mcp add postiz \\\n  --transport http \\\n  --header "Authorization: ${bearer}" \\\n  "${urlBase}"`,
        hintKey: 'mcp_hint_terminal', hintDefault: 'Execute este comando no seu terminal.',
      };
    case 'Cursor':
      return {
        config: json({ mcpServers: { postiz: { url: urlBase, headers: { Authorization: bearer } } } }),
        hintKey: 'mcp_hint_cursor', hintDefault: 'Adicione ao arquivo .cursor/mcp.json na raiz do projeto.',
      };
    case 'VS Code / Copilot':
      return {
        config: json({ servers: { postiz: { type: 'http', url: urlBase, headers: { Authorization: bearer } } } }),
        hintKey: 'mcp_hint_vscode', hintDefault: 'Adicione ao arquivo .vscode/mcp.json na raiz do projeto.',
      };
    case 'Windsurf':
      return {
        config: json({ mcpServers: { postiz: { serverUrl: urlBase, headers: { Authorization: bearer } } } }),
        hintKey: 'mcp_hint_windsurf', hintDefault: 'Adicione ao arquivo ~/.codeium/windsurf/mcp_config.json',
      };
    case 'Amp':
      return {
        config: json({ 'amp.mcpServers': { postiz: { url: urlBase, headers: { Authorization: bearer } } } }),
        hintKey: 'mcp_hint_amp', hintDefault: 'Adicione ao arquivo de configurações do Amp (settings.json).',
      };
    case 'Codex':
      return {
        config: `# ~/.codex/config.toml\n\n[mcp_servers.postiz]\nurl = "${urlBase}"\nhttp_headers = { "Authorization" = "${bearer}" }`,
        hintKey: 'mcp_hint_codex', hintDefault: 'Adicione ao arquivo ~/.codex/config.toml',
      };
    case 'Gemini CLI':
      return {
        config: json({ mcpServers: { postiz: { url: urlBase, headers: { Authorization: bearer } } } }),
        hintKey: 'mcp_hint_gemini', hintDefault: 'Adicione ao arquivo ~/.gemini/settings.json',
      };
    case 'Warp':
      return {
        config: json({ postiz: { url: urlBase, headers: { Authorization: bearer } } }),
        hintKey: 'mcp_hint_warp', hintDefault: 'Configurações > MCP Servers > + Add, cole esta configuração.',
      };
  }
};

const CopyButton = ({
  text,
  label,
}: {
  text: string;
  label: string;
}) => {
  const toaster = useToaster();
  return (
    <button
      type="button"
      onClick={() => {
        copy(text);
        toaster.show(`${label} copied to clipboard`, 'success');
      }}
      className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      {label}
    </button>
  );
};

const ExternalLinkIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const DocsLinkButton = ({
  href,
  label,
  tooltip,
}: {
  href: string;
  label: string;
  tooltip?: string;
}) => (
  <a
    className="cursor-pointer px-[16px] h-[36px] bg-[#612BD3] hover:bg-[#5520CB] text-white transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    {...(tooltip
      ? { 'data-tooltip-id': 'tooltip', 'data-tooltip-content': tooltip }
      : {})}
  >
    <ExternalLinkIcon />
    {label}
  </a>
);

const McpSection = ({
  apiKey,
  mcpBase,
}: {
  apiKey: string;
  mcpBase: string;
}) => {
  const t = useT();
  const [activeClient, setActiveClient] = useState<McpClient>('Claude Code');
  const [method, setMethod] = useState<'header' | 'path'>('header');
  const [revealed, setRevealed] = useState(false);

  const { config, hintKey, hintDefault } = getMcpConfig(
    activeClient,
    method,
    mcpBase,
    apiKey
  );
  const hint = t(hintKey, hintDefault);

  const maskedConfig = revealed
    ? config
    : config.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '*'.repeat(apiKey.length));

  return (
    <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
      <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
        <div>
          <div className="text-[15px] font-[600]">
            {t('mcp_client_configuration', 'MCP Client Configuration')}
          </div>
          <div className="text-[13px] text-customColor18 mt-[2px]">
            {t(
              'connect_your_mcp_client_to_postiz_to_schedule_your_posts_faster',
              'Connect Postiz MCP server to your client (Http streaming) to schedule your posts faster.'
            )}
          </div>
        </div>
        <div className="flex gap-[6px] shrink-0 pt-[2px]">
          <DocsLinkButton
            href="https://docs.postiz.com/mcp/introduction"
            label={t('read_the_docs', 'Docs')}
          />
        </div>
      </div>
      <div className="p-[20px] flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[13px] font-[600] text-customColor18">
            {t('auth_method', 'Authentication')}
          </div>
          <div className="flex gap-[6px]">
            {(['header', 'path'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={clsx(
                  'cursor-pointer px-[14px] h-[36px] text-[13px] font-[500] rounded-[8px] transition-colors',
                  method === m
                    ? 'bg-[#612BD3] text-white'
                    : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
                )}
                onClick={() => setMethod(m)}
              >
                {m === 'header'
                  ? t('authorization_header', 'Authorization Header')
                  : t('api_key_in_url', 'API Key in URL')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-[6px]">
          <div className="text-[13px] font-[600] text-customColor18">
            {t('mcp_client', 'Client')}
          </div>
          <div className="flex flex-wrap gap-[6px]">
            {mcpClients.map((client) => (
              <button
                key={client}
                type="button"
                className={clsx(
                  'cursor-pointer px-[14px] h-[36px] text-[13px] font-[500] rounded-[8px] transition-colors',
                  activeClient === client
                    ? 'bg-[#612BD3] text-white'
                    : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
                )}
                onClick={() => setActiveClient(client)}
              >
                {client}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-[8px]">
          <div className="text-[12px] text-customColor18 font-[500]">
            {hint}
          </div>
          <pre className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[16px] text-[13px] whitespace-pre-wrap break-all overflow-x-auto leading-[1.6]">
            {maskedConfig}
          </pre>
          <div className="flex gap-[8px]">
            <button
              type="button"
              onClick={() => setRevealed(!revealed)}
              className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {revealed ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
              {revealed ? t('hide', 'Hide') : t('reveal', 'Reveal')}
            </button>
            <CopyButton text={config} label={t('copy', 'Copy')} />
          </div>
        </div>
      </div>
    </div>
  );
};

const RevealEyeIcon = ({ revealed }: { revealed: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {revealed ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

const RotateIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.5 2v6h-6" />
    <path d="M21.34 15.57a10 10 0 11-.57-8.38L21.5 8" />
  </svg>
);

const CliSection = ({
  apiKey,
  backendUrl,
}: {
  apiKey: string;
  backendUrl: string;
}) => {
  const t = useT();
  const toaster = useToaster();
  const [revealed, setRevealed] = useState(false);

  const cliSteps = [
    { label: t('cli_step_install', 'Instale o CLI'), code: 'npm install -g postiz' },
    { label: t('cli_step_set_key', 'Configure sua chave de API'), code: 'export POSTIZ_API_KEY="{API_KEY}"' },
    { label: t('cli_step_install_skill', 'Instale o skill do Postiz para seu agente de IA'), code: 'npx skills add gitroomhq/postiz-agent' },
  ];

  const steps = cliSteps.map((step) => ({
    ...step,
    code: step.code.replace('{API_KEY}', apiKey),
  }));

  const maskedSteps = steps.map((step) => ({
    ...step,
    code: revealed
      ? step.code
      : step.code.replace(
          new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          '*'.repeat(apiKey.length)
        ),
  }));

  return (
    <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
      <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
        <div>
          <div className="text-[15px] font-[600]">
            {t('cli_and_skills', 'CLI & AI Skills')}
          </div>
          <div className="text-[13px] text-customColor18 mt-[2px]">
            {t(
              'cli_description',
              'Use the Postiz CLI to automate posting from your terminal, or install the skill to let your AI agent schedule posts for you.'
            )}
          </div>
        </div>
        <div className="flex gap-[6px] shrink-0 pt-[2px]">
          <DocsLinkButton
            href="https://docs.postiz.com/cli/introduction"
            label={t('read_the_docs', 'Docs')}
          />
        </div>
      </div>
      <div className="p-[20px] flex flex-col gap-[16px]">
        {maskedSteps.map((step, i) => (
          <div key={i} className="flex flex-col gap-[6px]">
            <div className="text-[13px] font-[600] text-customColor18">
              {i + 1}. {step.label}
            </div>
            <pre className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[16px] text-[13px] whitespace-pre-wrap break-all overflow-x-auto leading-[1.6]">
              {step.code}
            </pre>
          </div>
        ))}
        <div className="flex gap-[8px]">
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {revealed ? (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
            {revealed ? t('hide', 'Hide') : t('reveal', 'Reveal')}
          </button>
          <CopyButton
            text={steps.map((s) => s.code).join(' && ')}
            label={t('copy_all', 'Copy All')}
          />
        </div>
      </div>
    </div>
  );
};

const ApiKeyCard = ({
  title,
  description,
  apiKey,
  reveal,
  onReveal,
  onRotate,
  extraActions,
  docsUrl,
}: {
  title: string;
  description: string;
  apiKey: string;
  reveal: boolean;
  onReveal: () => void;
  onRotate: () => void;
  extraActions?: React.ReactNode;
  docsUrl?: string;
}) => {
  const t = useT();
  return (
    <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
      <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
        <div>
          <div className="text-[15px] font-[600]">{title}</div>
          <div className="text-[13px] text-customColor18 mt-[2px]">{description}</div>
        </div>
        {docsUrl && (
          <div className="flex gap-[6px] shrink-0 pt-[2px]">
            <DocsLinkButton
              href={docsUrl}
              label={t('read_the_docs', 'Docs')}
              tooltip={t('api_reference_tooltip', 'Documentação da API (Swagger)')}
            />
          </div>
        )}
      </div>
      <div className="p-[20px] flex flex-col gap-[16px]">
        <div className="bg-newBgColorInner border border-newBorder rounded-[8px] px-[16px] h-[44px] flex items-center overflow-hidden">
          <code className="text-[14px] flex-1 truncate">
            {reveal ? (
              apiKey
            ) : (
              <span className="flex items-center">
                <span className="blur-sm select-none">{apiKey.slice(0, -5)}</span>
                <span>{apiKey.slice(-5)}</span>
              </span>
            )}
          </code>
        </div>
        <div className="flex gap-[8px]">
          <button type="button" onClick={onReveal} className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]">
            <RevealEyeIcon revealed={reveal} />
            {reveal ? t('hide', 'Hide') : t('reveal', 'Reveal')}
          </button>
          <CopyButton text={apiKey} label={t('copy', 'Copy')} />
          <button type="button" onClick={onRotate} className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]">
            <RotateIcon />
            {t('rotate_key', 'Rotate Key')}
          </button>
          {extraActions}
        </div>
      </div>
    </div>
  );
};

const ProfileApiKeySection = ({ profileId }: { profileId: string }) => {
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();
  const decision = useDecisionModal();
  const { mutate } = useSWRConfig();
  const { backendUrl } = useVariables();
  const t = useT();
  const [reveal, setReveal] = useState(false);

  const docsUrl = `${backendUrl}/docs`;

  const generateKey = useCallback(async () => {
    await fetch(`/profiles/${profileId}/api-key/rotate`, { method: 'POST' });
    await mutate('/user/self');
    toaster.show(t('profile_api_key_generated', 'Profile API Key generated'), 'success');
  }, [fetch, mutate, profileId, t, toaster]);

  const rotateKey = useCallback(async () => {
    const approved = await decision.open({
      title: t('rotate_profile_api_key', 'Rotate Profile API Key?'),
      description: t('rotate_profile_api_key_description', 'The old key will stop working immediately.'),
      approveLabel: t('rotate', 'Rotate'),
      cancelLabel: t('cancel', 'Cancel'),
    });
    if (!approved) return;
    await fetch(`/profiles/${profileId}/api-key/rotate`, { method: 'POST' });
    await mutate('/user/self');
    setReveal(false);
    toaster.show(t('profile_api_key_rotated', 'Profile API Key rotated'), 'success');
  }, [decision, fetch, mutate, profileId, t, toaster]);

  if (!user) return null;

  if (!user.profileApiKey) {
    return (
      <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
        <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
          <div>
            <div className="text-[15px] font-[600]">{t('profile_api_key', 'Profile API Key')}</div>
            <div className="text-[13px] text-customColor18 mt-[2px]">{t('profile_api_key_description', 'Scoped access to this profile only.')}</div>
          </div>
          <div className="flex gap-[6px] shrink-0 pt-[2px]">
            <DocsLinkButton
              href={docsUrl}
              label={t('read_the_docs', 'Docs')}
              tooltip={t('api_reference_tooltip', 'Documentação da API (Swagger)')}
            />
          </div>
        </div>
        <div className="p-[20px]">
          <button type="button" onClick={generateKey} className="cursor-pointer px-[16px] h-[36px] bg-[#612BD3] hover:bg-[#5520CB] text-white transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]">
            {t('generate_profile_api_key', 'Generate Key')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <ApiKeyCard
      title={t('profile_api_key', 'Profile API Key')}
      description={t('profile_api_key_description', 'Scoped access to this profile only.')}
      apiKey={user.profileApiKey}
      reveal={reveal}
      onReveal={() => setReveal(!reveal)}
      onRotate={rotateKey}
      docsUrl={docsUrl}
    />
  );
};

const AgentSkillSection = ({ backendUrl }: { backendUrl: string }) => {
  const t = useT();
  const skillUrl = `${backendUrl}/public/agent-skill`;
  return (
    <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
      <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
        <div>
          <div className="text-[15px] font-[600]">
            {t('agent_skill', 'Skill para Agentes de IA')}
          </div>
          <div className="text-[13px] text-customColor18 mt-[2px]">
            {t(
              'agent_skill_description',
              'Guia completo (MCP + CLI + API) para o agente. Passe este link + sua Chave de API ao agente (Hermes, OpenClaw, Claude, etc.).'
            )}
          </div>
        </div>
        <div className="flex gap-[6px] shrink-0 pt-[2px]">
          <a
            className="cursor-pointer px-[16px] h-[36px] bg-[#612BD3] hover:bg-[#5520CB] text-white transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
            href={skillUrl}
            target="_blank"
            rel="noreferrer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            {t('open', 'Abrir')}
          </a>
        </div>
      </div>
      <div className="p-[20px] flex flex-col gap-[16px]">
        <div className="bg-newBgColorInner border border-newBorder rounded-[8px] px-[16px] h-[44px] flex items-center overflow-hidden">
          <code className="text-[14px] flex-1 truncate">{skillUrl}</code>
        </div>
        <div className="flex gap-[8px]">
          <CopyButton text={skillUrl} label={t('copy_skill_link', 'Copiar link da skill')} />
        </div>
      </div>
    </div>
  );
};

const PublicApiContent = () => {
  const user = useUser();
  const { profile } = useCurrentProfile();
  const { backendUrl, frontEndUrl, mcpUrl } = useVariables();
  const toaster = useToaster();
  const fetch = useFetch();
  const decision = useDecisionModal();
  const { mutate } = useSWRConfig();
  const t = useT();
  const [revealOrg, setRevealOrg] = useState(false);

  const isDefault = profile?.isDefault ?? true;

  const rotateOrgKey = useCallback(async () => {
    const approved = await decision.open({
      title: t('rotate_api_key', 'Rotate API Key?'),
      description: t(
        'rotate_api_key_description',
        'This will generate a new API key and invalidate the current one. Any integrations using the old key will stop working.'
      ),
      approveLabel: t('rotate', 'Rotate'),
      cancelLabel: t('cancel', 'Cancel'),
    });
    if (!approved) return;
    await fetch('/user/api-key/rotate', { method: 'POST' });
    await mutate('/user/self');
    setRevealOrg(false);
    toaster.show(t('api_key_rotated', 'API Key rotated successfully'), 'success');
  }, [decision, fetch, mutate, toaster]);

  if (!user || !user.publicApi) {
    return null;
  }

  const mcpBase = mcpUrl || backendUrl;
  const docsUrl = `${backendUrl}/docs`;
  const activeKey = isDefault ? user.publicApi : (user.profileApiKey ?? user.publicApi);

  const wizardButton = (
    <button
      type="button"
      data-tooltip-id="tooltip"
      data-tooltip-content={t(
        'payload_wizard_description',
        'Building a POST request to /posts can be complex. Use the wizard to schedule a post with the UI, then copy the generated payload.'
      )}
      onClick={() => window.open(`${frontEndUrl}/modal/dark/all`, '_blank')}
      className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      {t('open_wizard', 'Open Wizard')}
    </button>
  );

  return (
    <div className="flex flex-col gap-[40px]">
      <div className="text-[14px] text-textColor leading-[1.7]">
        {t('api_auth_note_line1', 'Use your API Key to automate your own account.')}
        <br />
        {t('api_auth_note_line2', 'If you are building a product that schedules posts on behalf of other Postiz users,')}
        <br />
        {t('api_auth_note_line3', 'create an OAuth App under the "Apps" tab. Your users will authorize your app via OAuth2,')}
        <br />
        {t('api_auth_note_line4', 'and you will receive a pos_ prefixed token that works with the API, MCP, and CLI — just like an API Key.')}
      </div>

      {isDefault && (
        <ApiKeyCard
          title={t('org_api_key', 'Organization API Key')}
          description={t('org_api_key_description', 'Full access to all profiles.')}
          apiKey={user.publicApi}
          reveal={revealOrg}
          onReveal={() => setRevealOrg(!revealOrg)}
          onRotate={rotateOrgKey}
          extraActions={wizardButton}
          docsUrl={docsUrl}
        />
      )}

      {user.profileId && (
        <ProfileApiKeySection profileId={user.profileId} />
      )}

      <AgentSkillSection backendUrl={backendUrl} />
      <CliSection apiKey={activeKey} backendUrl={backendUrl} />
      <McpSection apiKey={activeKey} mcpBase={mcpBase} />
    </div>
  );
};

export const PublicComponent = () => {
  const t = useT();
  const [subTab, setSubTab] = useState<'api' | 'developer'>('api');

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex gap-[6px]">
        {(['api', 'developer'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={clsx(
              'cursor-pointer px-[20px] h-[44px] text-[15px] font-[600] rounded-[8px] transition-colors',
              subTab === tab
                ? 'bg-[#612BD3] text-white'
                : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
            )}
            onClick={() => setSubTab(tab)}
          >
            {tab === 'api'
              ? t('access', 'Acesso')
              : t('integrations_tab', 'Integrações')}
          </button>
        ))}
      </div>
      {subTab === 'api' && <PublicApiContent />}
      {subTab === 'developer' && <DeveloperComponent />}
    </div>
  );
};
