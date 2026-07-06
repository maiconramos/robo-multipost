import { defineSignal } from '@temporalio/workflow';

export type Email = {
  messageKey: string;
  subjectKey?: string;
  params?: Record<string, string | number | undefined>;
  type: 'success' | 'fail' | 'info';
  profileId?: string | null;
};

export const emailSignal = defineSignal<[Email[]]>('email');
