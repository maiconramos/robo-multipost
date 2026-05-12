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
import { Organization, User } from '@prisma/client';
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
    @Query() query: ListUnmatchedQueryDto
  ) {
    return this._unmatchedCommentService.listInbox(org.id, query.integrationId, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post('/inbox/bind')
  bindFromInbox(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: BindFromInboxDto
  ) {
    return this._unmatchedCommentService.bindToFlow(
      org.id,
      body.unmatchedCommentId,
      body.flowId,
      user.id
    );
  }

  @Post('/inbox/ignore')
  ignoreFromInbox(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: IgnoreUnmatchedDto
  ) {
    return this._unmatchedCommentService.ignore(
      org.id,
      body.unmatchedCommentId,
      body.reason,
      user.id
    );
  }

  // ─── Aliases manuais ─────────────────────────────────────────────────

  @Get('/aliases')
  listAliases(
    @GetOrgFromRequest() org: Organization,
    @Query('flowId') flowId: string
  ) {
    return this._unmatchedCommentService.listAliasesEnriched(org.id, flowId);
  }

  @Post('/aliases')
  createAlias(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateAliasDto
  ) {
    return this._flowsService.addManualAlias(
      org.id,
      body.flowId,
      body.aliasMediaId,
      user.id
    );
  }

  @Delete('/aliases/:id')
  deleteAlias(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._flowsService.removeAlias(org.id, id);
  }

  @Get('/aliases/lookup')
  lookupAlias(
    @GetOrgFromRequest() org: Organization,
    @Query() query: LookupAliasQueryDto
  ) {
    return this._flowsService.lookupAliasFlows(
      org.id,
      query.integrationId,
      query.aliasMediaId
    );
  }
}
