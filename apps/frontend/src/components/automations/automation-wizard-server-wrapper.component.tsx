'use client';

import { FC } from 'react';
import { useFlow } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { AutomationWizardComponent } from '@gitroom/frontend/components/automations/automation-wizard.component';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

interface Props {
  flowId: string;
}

export const AutomationWizardServerWrapper: FC<Props> = ({ flowId }) => {
  const { data: flow, isLoading } = useFlow(flowId);

  if (isLoading) return <LoadingComponent />;

  return <AutomationWizardComponent flowId={flowId} initialFlow={flow} />;
};
