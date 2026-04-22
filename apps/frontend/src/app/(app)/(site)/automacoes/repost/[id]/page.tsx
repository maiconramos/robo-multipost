export const dynamic = 'force-dynamic';
import { RepostEditComponent } from '@gitroom/frontend/components/automations/repost/repost-edit.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Repost Rule',
  description: 'Configure a repost rule',
};

export default async function Index({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex">
      <RepostEditComponent id={id} />
    </div>
  );
}
