'use client';

import { FC } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFlow } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { AutomationWizardComponent } from '@gitroom/frontend/components/automations/automation-wizard.component';
import { StoryWizardComponent } from '@gitroom/frontend/components/automations/story-wizard.component';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

interface Props {
  flowId: string;
}

function detectTriggerType(flow: any): 'comment_on_post' | 'story_reply' {
  const trigger = flow?.nodes?.find((n: any) => n.type === 'TRIGGER');
  if (trigger?.label === 'story_reply') return 'story_reply';
  if (trigger?.data) {
    try {
      const parsed = JSON.parse(trigger.data);
      if (parsed?.triggerType === 'story_reply') return 'story_reply';
    } catch {
      // ignore
    }
  }
  return 'comment_on_post';
}

export const AutomationWizardServerWrapper: FC<Props> = ({ flowId }) => {
  const { data: flow, isLoading } = useFlow(flowId);
  const search = useSearchParams();
  const typeParam = search?.get('type');

  if (isLoading) return <LoadingComponent />;

  // URL query wins for newly-created flows (node label not persisted yet in
  // the SWR response), otherwise detect from the flow payload.
  const resolved: 'comment_on_post' | 'story_reply' =
    typeParam === 'story'
      ? 'story_reply'
      : typeParam === 'comment'
      ? 'comment_on_post'
      : detectTriggerType(flow);

  if (resolved === 'story_reply') {
    return <StoryWizardComponent flowId={flowId} initialFlow={flow} />;
  }
  return <AutomationWizardComponent flowId={flowId} initialFlow={flow} />;
};
