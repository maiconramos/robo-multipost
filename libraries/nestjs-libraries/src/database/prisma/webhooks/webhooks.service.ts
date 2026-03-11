import { Injectable } from '@nestjs/common';
import { WebhooksRepository } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.repository';
import { WebhooksDto } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';

@Injectable()
export class WebhooksService {
  constructor(private _webhooksRepository: WebhooksRepository) {}

  getTotal(orgId: string, profileId?: string) {
    return this._webhooksRepository.getTotal(orgId, profileId);
  }

  getWebhooks(orgId: string, profileId?: string) {
    return this._webhooksRepository.getWebhooks(orgId, profileId);
  }

  createWebhook(orgId: string, body: WebhooksDto, profileId?: string) {
    return this._webhooksRepository.createWebhook(orgId, body, profileId);
  }

  deleteWebhook(orgId: string, id: string, profileId?: string) {
    return this._webhooksRepository.deleteWebhook(orgId, id, profileId);
  }
}
