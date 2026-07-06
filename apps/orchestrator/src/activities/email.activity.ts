import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import {
  NotificationEmailItem,
  renderDigestEmail,
} from '@gitroom/nestjs-libraries/emails/i18n/email.i18n';

@Injectable()
@Activity()
export class EmailActivity {
  constructor(
    private _emailService: EmailService,
    private _organizationService: OrganizationService
  ) {}

  @ActivityMethod()
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    replyTo?: string,
    lang?: string
  ) {
    return this._emailService.sendEmailSync(to, subject, html, replyTo, lang);
  }

  @ActivityMethod()
  async sendEmailAsync(
    to: string,
    subject: string,
    html: string,
    sendTo: 'top' | 'bottom',
    replyTo?: string,
    lang?: string
  ) {
    return await this._emailService.sendEmail(
      to,
      subject,
      html,
      sendTo,
      replyTo,
      lang
    );
  }

  // Renderiza (no idioma da org) e envia um lote de notificacoes por chave+params.
  // A renderizacao (emailT) vive na lib; a activity so orquestra o envio, mantendo
  // o bundle de workflow livre do catalogo.
  @ActivityMethod()
  async sendDigestEmail(
    to: string,
    items: NotificationEmailItem[],
    lang: string | undefined,
    sendTo: 'top' | 'bottom'
  ) {
    const { subject, html } = renderDigestEmail(items, lang);
    return await this._emailService.sendEmail(
      to,
      subject,
      html,
      sendTo,
      undefined,
      lang
    );
  }

  @ActivityMethod()
  async getUserOrgs(id: string) {
    return this._organizationService.getTeamForNotifications(id);
  }

  @ActivityMethod()
  async setStreak(organizationId: string, type: 'start' | 'end') {
    return this._organizationService.setStreak(organizationId, type);
  }
}
