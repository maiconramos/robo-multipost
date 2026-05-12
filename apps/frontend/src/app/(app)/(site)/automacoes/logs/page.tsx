export const dynamic = 'force-dynamic';
import { LogsComponent } from '@gitroom/frontend/components/automations/logs/logs.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Logs de Comentários',
  description:
    'Comentários em posts não monitorados (dark posts, anúncios) das suas automações do Instagram',
};

export default async function Index() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex min-w-0">
      <LogsComponent />
    </div>
  );
}
