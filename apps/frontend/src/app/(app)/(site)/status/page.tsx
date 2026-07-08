export const dynamic = 'force-dynamic';
import { StatusComponent } from '@gitroom/frontend/components/status/status.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Status',
  description: 'System status and pending problems',
};

export default async function Index() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex">
      <StatusComponent />
    </div>
  );
}
