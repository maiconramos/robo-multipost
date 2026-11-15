'use client';
import { AutomationContextHelp } from './shared-context-help.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSharedFlowData } from './hooks/use-shared-flows';
import { connectionSettingsUrl } from './shared-flow-ui';
import type { AutomationReadiness } from '@gitroom/nestjs-libraries/dtos/flows/flow-v2.dto';
export function AutomationConnectionIndicator({
  ready,
  loading,
  provider,
  integrationId,
  detail,
}: {
  ready: boolean;
  loading?: boolean;
  provider: string;
  integrationId: string;
  detail?: string;
}) {
  const t = useT();
  const label = t(
    loading
      ? 'shared_checking'
      : ready
      ? provider === 'zernio-instagram'
        ? 'zernio_account_authorized'
        : 'automation_webhook_configured'
      : 'automation_connection_settings'
  );
  const icon = (
    <svg
      data-status={loading ? 'loading' : ready ? 'ready' : 'warning'}
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      {loading || ready ? (
        <circle cx="12" cy="12" r="9" />
      ) : (
        <path d="M12 3 2 21h20L12 3Z" />
      )}
      <path
        d={
          ready ? 'm8 12 3 3 5-6' : loading ? 'M12 7v5l3 2' : 'M12 9v5m0 3h.01'
        }
      />
    </svg>
  );
  return loading || ready ? (
    <span
      title={detail || label}
      aria-label={label}
      role="status"
      className={
        ready ? 'text-emerald-600' : 'text-newTextColor/50 animate-pulse'
      }
    >
      {icon}
    </span>
  ) : (
    <AutomationContextHelp
      href={connectionSettingsUrl(provider, integrationId)}
      label={label}
      icon={icon}
      triggerClassName="text-amber-600 dark:text-amber-400"
    >
      {detail || t('automation_connection_action_hint')}
    </AutomationContextHelp>
  );
}
export function SharedConnectionIndicator({
  integrationId,
  provider,
  messenger,
}: {
  integrationId: string;
  provider: string;
  messenger: boolean;
}) {
  const result = useSharedFlowData<AutomationReadiness>(
    integrationId
      ? `/flows-v2/channels/${integrationId}/readiness${
          messenger ? '?triggerType=messenger_message' : ''
        }`
      : null
  );
  return integrationId ? (
    <AutomationConnectionIndicator
      integrationId={integrationId}
      provider={provider}
      ready={result.data?.ready === true}
      loading={!result.data && !result.error}
    />
  ) : null;
}
