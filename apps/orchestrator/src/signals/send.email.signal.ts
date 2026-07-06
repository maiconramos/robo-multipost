import { defineSignal } from '@temporalio/workflow';

export type SendEmail = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  addTo: 'top' | 'bottom';
  lang?: string;
};
export const sendEmailSignal = defineSignal<[SendEmail]>('sendEmail');
