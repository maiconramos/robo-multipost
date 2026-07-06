import { Injectable } from '@nestjs/common';
import {
  NotificationsRepository,
  NotificationScope,
} from '@gitroom/nestjs-libraries/database/prisma/notifications/notifications.repository';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { organizationId } from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import {
  emailT,
  resolveOrgLang,
} from '@gitroom/nestjs-libraries/emails/i18n/email.i18n';

export type NotificationType = 'success' | 'fail' | 'info';

// Notificacao por chave+params (i18n): messageKey renderiza o sininho (via
// useT no frontend) e o corpo do e-mail; subjectKey e so do e-mail/digest;
// profileId escopa destinatarios e visibilidade (null = org-wide).
export type NotificationPayload = {
  subjectKey: string;
  messageKey: string;
  params?: Record<string, string | number | undefined>;
  profileId?: string | null;
};

@Injectable()
export class NotificationService {
  constructor(
    private _notificationRepository: NotificationsRepository,
    private _emailService: EmailService,
    private _organizationRepository: OrganizationRepository,
    private _temporalService: TemporalService
  ) {}

  getMainPageCount(
    organizationId: string,
    userId: string,
    scope?: NotificationScope
  ) {
    return this._notificationRepository.getMainPageCount(
      organizationId,
      userId,
      scope
    );
  }

  getNotificationsPaginated(
    organizationId: string,
    page: number,
    scope?: NotificationScope
  ) {
    return this._notificationRepository.getNotificationsPaginated(
      organizationId,
      page,
      scope
    );
  }

  getNotifications(
    organizationId: string,
    userId: string,
    scope?: NotificationScope
  ) {
    return this._notificationRepository.getNotifications(
      organizationId,
      userId,
      scope
    );
  }

  async inAppNotification(
    orgId: string,
    payload: NotificationPayload,
    sendEmail = false,
    digest = false,
    type: NotificationType = 'success'
  ) {
    const { subjectKey, messageKey, params, profileId } = payload;
    const lang = resolveOrgLang(
      await this._organizationRepository.getLanguage(orgId)
    );
    // `content` fica renderizado no idioma da org como fallback (sininho legado
    // / clientes sem contentKey); o sininho novo usa contentKey+params via useT.
    const content = emailT(messageKey, lang, params);
    await this._notificationRepository.createNotification(orgId, content, {
      contentKey: messageKey,
      contentParams: params,
      profileId: profileId ?? null,
    });
    if (!sendEmail) {
      return;
    }

    if (digest) {
      try {
        await this._temporalService.client
          .getRawClient()
          ?.workflow.signalWithStart('digestEmailWorkflow', {
            workflowId: 'digest_email_workflow_' + orgId,
            signal: 'email',
            signalArgs: [
              [
                {
                  subjectKey,
                  messageKey,
                  params,
                  type,
                  profileId: profileId ?? null,
                },
              ],
            ],
            taskQueue: 'main',
            workflowIdConflictPolicy: 'USE_EXISTING',
            args: [{ organizationId: orgId }],
            typedSearchAttributes: new TypedSearchAttributes([
              {
                key: organizationId,
                value: orgId,
              },
            ]),
          });
      } catch (err) {}

      return;
    }

    await this.sendEmailsToOrg(orgId, payload, type, lang);
  }

  async sendEmailsToOrg(
    orgId: string,
    payload: NotificationPayload,
    type?: NotificationType,
    lang?: string
  ) {
    const resolvedLang =
      lang ??
      resolveOrgLang(await this._organizationRepository.getLanguage(orgId));
    const users = await this._organizationRepository.getUsersForNotification(
      orgId,
      payload.profileId ?? null
    );
    const subject = emailT(payload.subjectKey, resolvedLang, payload.params);
    const message = emailT(payload.messageKey, resolvedLang, payload.params);
    for (const user of users) {
      // 'info' type is always sent regardless of preferences
      if (type !== 'info') {
        // Filter users based on their email preferences
        if (type === 'success' && !user.sendSuccessEmails) {
          continue;
        }
        if (type === 'fail' && !user.sendFailureEmails) {
          continue;
        }
      }
      await this.sendEmail(user.email, subject, message, undefined, resolvedLang);
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    replyTo?: string,
    lang?: string
  ) {
    await this._emailService.sendEmail(to, subject, html, 'top', replyTo, lang);
  }

  hasEmailProvider() {
    return this._emailService.hasProvider();
  }
}
