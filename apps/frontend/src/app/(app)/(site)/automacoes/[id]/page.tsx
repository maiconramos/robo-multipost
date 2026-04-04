export const dynamic = 'force-dynamic';
import { FlowEditorComponent } from '@gitroom/frontend/components/automations/flow-editor.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Flow Editor',
  description: 'Edit automation flow',
};

export default async function Index({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex">
      <FlowEditorComponent id={id} />
    </div>
  );
}
