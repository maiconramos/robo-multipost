export const dynamic = 'force-dynamic';
import { AutomationWizardServerWrapper } from '@gitroom/frontend/components/automations/automation-wizard-server-wrapper.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Editar Automação',
  description: 'Editar automação no assistente',
};

export default async function WizardEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex h-[calc(100dvh-104px)] overflow-hidden">
      <AutomationWizardServerWrapper flowId={id} />
    </div>
  );
}
