'use client';

import { FC } from 'react';
import { useRouter } from 'next/navigation';
import { RepostRuleForm } from '@gitroom/frontend/components/automations/repost/repost-rule-form.component';

export const RepostWizardComponent: FC = () => {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-[16px] p-[24px] flex-1">
      <RepostRuleForm
        mode="create"
        onSaved={(rule) => router.push(`/automacoes/repost/${rule.id}`)}
        onCancel={() => router.push('/automacoes')}
      />
    </div>
  );
};
