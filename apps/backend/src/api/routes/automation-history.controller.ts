import { ZernioAutomationsService } from '@gitroom/nestjs-libraries/integrations/automations/zernio-automations.service';
import {
  Controller,
  Optional,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Organization, Profile } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { AutomationHistoryService } from '@gitroom/nestjs-libraries/database/prisma/automation-history/automation-history.service';
import {
  AutomationHistoryQueryDto,
  HistoryEngine,
} from '@gitroom/nestjs-libraries/dtos/flows/automation-history.dto';
const engines = { instagram: 'instagram', shared: 'shared', zernio: 'zernio' };
@Controller('/automation-history')
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AutomationHistoryController {
  constructor(
    private readonly service: AutomationHistoryService,
    @Optional() private readonly zernio?: ZernioAutomationsService
  ) {}
  @Get('/:engine/:flowId') @Header('Cache-Control', 'no-store') list(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('engine', new ParseEnumPipe(engines)) engine: HistoryEngine,
    @Param('flowId') flowId: string,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    )
    query: AutomationHistoryQueryDto
  ) {
    if (engine === 'zernio')
      return this.zernio!.history(
        { organizationId: org.id, profileId: profile?.id || '' },
        flowId,
        query
      );
    return this.service.list(
      { organizationId: org.id, profileId: profile?.id || '' },
      engine,
      flowId,
      query
    );
  }
  @Get('/:engine/:flowId/:executionId')
  @Header('Cache-Control', 'no-store')
  detail(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('engine', new ParseEnumPipe(engines)) engine: HistoryEngine,
    @Param('flowId') flowId: string,
    @Param('executionId') id: string
  ) {
    if (engine === 'zernio')
      return this.zernio!.history(
        { organizationId: org.id, profileId: profile?.id || '' },
        flowId,
        {},
        id
      );
    return this.service.detail(
      { organizationId: org.id, profileId: profile?.id || '' },
      engine,
      flowId,
      id
    );
  }
}
