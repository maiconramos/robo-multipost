export type PostWorkflowName = 'postWorkflowV102' | 'postWorkflowV112';

type PostWorkflowTarget = {
  integrationId: string;
  providerIdentifier: string;
};

type PostWorkflowGateEnvironment = {
  POST_WORKFLOW_V112_INTEGRATION_IDS?: string;
  POST_WORKFLOW_V112_PROVIDERS?: string;
  POST_WORKFLOW_V112_ALL?: string;
};

const csvSet = (value?: string): Set<string> =>
  new Set(
    (value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

export const selectPostWorkflowVersion = (
  target: PostWorkflowTarget,
  env: PostWorkflowGateEnvironment = process.env as PostWorkflowGateEnvironment
): PostWorkflowName => {
  // Zernio keeps its current activity routing and remains pinned to V102 until
  // it has a provider-specific pending/finalize smoke test.
  if (target.providerIdentifier.startsWith('zernio-')) {
    return 'postWorkflowV102';
  }

  const enabledForAll = env.POST_WORKFLOW_V112_ALL === 'true';
  const enabledIntegrations = csvSet(env.POST_WORKFLOW_V112_INTEGRATION_IDS);
  const enabledProviders = csvSet(env.POST_WORKFLOW_V112_PROVIDERS);

  return enabledForAll ||
    enabledIntegrations.has(target.integrationId) ||
    enabledProviders.has(target.providerIdentifier)
    ? 'postWorkflowV112'
    : 'postWorkflowV102';
};
