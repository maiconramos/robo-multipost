import { ZernioInstagramEditor } from '@gitroom/frontend/components/automations/shared-zernio-editor.component';
export default async function ZernioAutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ZernioInstagramEditor id={id} />;
}
