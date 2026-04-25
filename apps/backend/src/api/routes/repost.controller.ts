import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile, RepostSourceType } from '@prisma/client';
import { RepostService } from '@gitroom/nestjs-libraries/database/prisma/repost/repost.service';
import {
  CreateRepostRuleDto,
  ToggleRepostRuleDto,
  UpdateRepostRuleDto,
} from '@gitroom/nestjs-libraries/dtos/repost/repost.rule.dto';

@ApiTags('Repost')
@Controller('/repost')
export class RepostController {
  constructor(private _repostService: RepostService) {}

  @Get('/source-candidates')
  sourceCandidates(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this._repostService.sourceCandidates(org.id, profile?.id);
  }

  @Get('/destination-candidates')
  destinationCandidates(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Query('sourceType') sourceType?: string
  ) {
    const validated =
      sourceType &&
      (Object.values(RepostSourceType) as string[]).includes(sourceType)
        ? (sourceType as RepostSourceType)
        : undefined;
    return this._repostService.destinationCandidates(
      org.id,
      validated,
      profile?.id
    );
  }

  @Get('/rules')
  getRules(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this._repostService.getRules(org.id, profile?.id);
  }

  @Get('/rules/:id')
  getRule(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._repostService.getRule(org.id, id, profile?.id);
  }

  @Post('/rules')
  createRule(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: CreateRepostRuleDto
  ) {
    return this._repostService.createRule(org.id, profile?.id, body);
  }

  @Put('/rules/:id')
  updateRule(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: UpdateRepostRuleDto
  ) {
    return this._repostService.updateRule(org.id, id, body, profile?.id);
  }

  @Post('/rules/:id/toggle')
  toggleRule(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: ToggleRepostRuleDto
  ) {
    return this._repostService.toggleRule(
      org.id,
      id,
      body.enabled,
      profile?.id
    );
  }

  @Post('/rules/:id/run-now')
  runNow(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._repostService.runNow(org.id, id, profile?.id);
  }

  @Post('/rules/:id/reset-checkpoint')
  resetCheckpoint(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._repostService.resetCheckpoint(org.id, id, profile?.id);
  }

  @Delete('/rules/:id')
  deleteRule(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._repostService.deleteRule(org.id, id, profile?.id);
  }

  @Get('/rules/:id/logs')
  getLogs(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('size') size?: string
  ) {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedSize = size ? parseInt(size, 10) : 20;
    return this._repostService.getLogs(
      org.id,
      id,
      Number.isFinite(parsedPage) ? parsedPage : 1,
      Number.isFinite(parsedSize) ? parsedSize : 20,
      profile?.id
    );
  }
}
