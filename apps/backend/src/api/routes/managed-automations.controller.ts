import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Organization, Profile } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { AutomationManagementService } from '@gitroom/nestjs-libraries/integrations/automations/automation-management.service';
import {
  AutomationConfigurationDto,
  AutomationUpdateDto,
  AutomationStatusDto,
} from '@gitroom/nestjs-libraries/dtos/flows/automation-management.dto';
@Controller('/managed-automations')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })
)
export class ManagedAutomationsController {
  constructor(private readonly service: AutomationManagementService) {}
  private scope(org: Organization, profile: Profile | null) {
    if (!org?.id || !profile?.id)
      throw new HttpException('PROFILE_REQUIRED', 400);
    return { organizationId: org.id, profileId: profile.id };
  }
  @Get() @Header('Cache-Control', 'no-store') async list(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this.service.list(this.scope(org, profile), 3);
  }
  @Get('/options') @Header('Cache-Control', 'no-store') options(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Query() query: Record<string, string>
  ) {
    return this.service.options(this.scope(org, profile), query);
  }
  @Post() create(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: AutomationConfigurationDto
  ) {
    return this.service.create(this.scope(org, profile), body);
  }
  @Get('/:id') @Header('Cache-Control', 'no-store') async detail(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this.service.detail(this.scope(org, profile), id, 3);
  }
  @Put('/:id') update(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: AutomationUpdateDto
  ) {
    return this.service.update(this.scope(org, profile), id, 3, body);
  }
  @Post('/:id/status') status(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: AutomationStatusDto
  ) {
    return this.service.status(
      this.scope(org, profile),
      id,
      3,
      body.status,
      body.expectedRevision
    );
  }
}
