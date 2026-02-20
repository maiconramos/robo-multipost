import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Robô MultiPost - Agent',
  description: '',
};

export default async function Page() {
  return redirect('/agents/new');
}
