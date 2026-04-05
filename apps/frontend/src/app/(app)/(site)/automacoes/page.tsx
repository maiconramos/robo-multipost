export const dynamic = 'force-dynamic';
import { FlowListComponent } from '@gitroom/frontend/components/automations/flow-list.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Automations',
  description: 'Instagram comment automations',
};

export default async function Index() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex">
      <FlowListComponent />
    </div>
  );
}
