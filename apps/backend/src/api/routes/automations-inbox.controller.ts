import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile, User } from '@prisma/client';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import { UnmatchedCommentService } from '@gitroom/nestjs-libraries/database/prisma/flows/unmatched-comment.service';
import {
  BindFromInboxDto,
  CreateAliasDto,
  IgnoreUnmatchedDto,
  ListUnmatchedQueryDto,
  LookupAliasQueryDto,
} from '@gitroom/nestjs-libraries/dtos/flows/flow-aliases.dto';

@ApiTags('Automations Inbox')
@Controller('/automations')
export class AutomationsInboxController {
  constructor(
    private _unmatchedCommentService: UnmatchedCommentService,
    private _flowsService: FlowsService
  ) {}

  // ─── Inbox de comentarios nao vinculados ─────────────────────────────

  @Get('/inbox')
  listInbox(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Query() query: ListUnmatchedQueryDto
  ) {
    return this._unmatchedCommentService.listInbox(
      org.id,
      query.integrationId,
      { status: query.status, page: query.page, limit: query.limit },
      profile?.id
    );
  }

  @Post('/inbox/bind')
  bindFromInbox(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: BindFromInboxDto
  ) {
    return this._unmatchedCommentService.bindToFlow(
      org.id,
      body.unmatchedCommentId,
      body.flowId,
      user.id,
      profile?.id
    );
  }

  @Post('/inbox/ignore')
  ignoreFromInbox(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: IgnoreUnmatchedDto
  ) {
    return this._unmatchedCommentService.ignore(
      org.id,
      body.unmatchedCommentId,
      body.reason,
      user.id,
      profile?.id
    );
  }

  // ─── Aliases manuais ─────────────────────────────────────────────────

  @Get('/aliases')
  listAliases(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Query('flowId') flowId: string
  ) {
    return this._unmatchedCommentService.listAliasesEnriched(
      org.id,
      flowId,
      profile?.id
    );
  }

  @Post('/aliases')
  createAlias(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: CreateAliasDto
  ) {
    return this._flowsService.addManualAlias(
      org.id,
      body.flowId,
      body.aliasMediaId,
      user.id,
      profile?.id
    );
  }

  @Delete('/aliases/:id')
  deleteAlias(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._flowsService.removeAlias(org.id, id, profile?.id);
  }

  @Get('/aliases/lookup')
  lookupAlias(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Query() query: LookupAliasQueryDto
  ) {
    return this._flowsService.lookupAliasFlows(
      org.id,
      query.integrationId,
      query.aliasMediaId,
      profile?.id
    );
  }
}
