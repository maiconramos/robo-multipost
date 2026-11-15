import { ZernioAutomationsRepository } from '../../database/prisma/zernio-automations/zernio-automations.repository';
import { ZernioAutomationsService } from './zernio-automations.service';
import { ZernioAutomationClient } from './zernio-automation.client';
import { ScheduledAutomationProcessor } from './scheduled-automation.processor';
import { AutomationManagementService } from './automation-management.service';
import { FacebookSystemUserService } from './facebook-system-user.service';
import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { DatabaseModule } from '../../database/prisma/database.module';
import { SharedFlowsService } from '../../database/prisma/flows-v2/shared-flows.service';
import { CommentChannelService } from './comment-channel.service';
import { FacebookAutomationSetupService } from './facebook-automation-setup.service';
import { FacebookAutomationSetupRepository } from './facebook-automation-setup.repository';
import { MetaAutomationGraphClient } from './meta-automation-graph.client';
import { FacebookProvider } from '../social/facebook.provider';
import { SharedAutomationBootstrap } from './shared-automation.bootstrap';
@Module({
  imports: [DatabaseModule],
  providers: [
    ZernioAutomationClient,
    ZernioAutomationsRepository,
    ZernioAutomationsService,
    AutomationManagementService,
    SharedFlowsService,
    ScheduledAutomationProcessor,
    CommentChannelService,
    FacebookAutomationSetupService,
    FacebookSystemUserService,
    FacebookAutomationSetupRepository,
    SharedAutomationBootstrap,
    {
      provide: 'FACEBOOK_SETUP_REDIS',
      useFactory: () => {
        if (!process.env.REDIS_URL) return null;
        const redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 3000,
          commandTimeout: 3000,
        });
        redis.on('error', () => {});
        return redis;
      },
    },
    { provide: FacebookProvider, useFactory: () => new FacebookProvider() },
    {
      provide: MetaAutomationGraphClient,
      useFactory: () => new MetaAutomationGraphClient(),
    },
  ],
  exports: [
    ZernioAutomationClient,
    ZernioAutomationsRepository,
    ZernioAutomationsService,
    AutomationManagementService,
    SharedFlowsService,
    CommentChannelService,
    FacebookAutomationSetupService,
    FacebookAutomationSetupRepository,
    MetaAutomationGraphClient,
  ],
})
export class SharedAutomationsModule {}
