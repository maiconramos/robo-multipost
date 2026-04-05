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
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import {
  CreateFlowDto,
  UpdateFlowDto,
  UpdateFlowStatusDto,
  SaveCanvasDto,
} from '@gitroom/nestjs-libraries/dtos/flows/flow.dto';

@ApiTags('Flows')
@Controller('/flows')
export class FlowsController {
  constructor(private _flowsService: FlowsService) {}

  @Get('/webhook-config')
  getWebhookConfig() {
    const rawBase = (
      process.env.WEBHOOK_BASE_URL ||
      process.env.FRONTEND_URL ||
      process.env.BACKEND_URL ||
      ''
    ).replace(/\/$/, '');
    const needsApiPrefix = !process.env.WEBHOOK_BASE_URL;
    const callbackPath = `${needsApiPrefix ? '/api' : ''}/public/ig-webhook`;
    return {
      callbackUrl: rawBase ? `${rawBase}${callbackPath}` : callbackPath,
      verifyToken: 'multipost',
      subscribedFields: ['comments', 'messages'],
      object: 'instagram',
    };
  }

  @Get('/')
  async getFlows(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this._flowsService.getFlows(org.id, profile?.id);
  }

  @Post('/')
  async createFlow(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: CreateFlowDto
  ) {
    return this._flowsService.createFlow(org.id, body, profile?.id);
  }

  @Get('/:id')
  async getFlow(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._flowsService.getFlow(org.id, id, profile?.id);
  }

  @Put('/:id')
  async updateFlow(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: UpdateFlowDto
  ) {
    return this._flowsService.updateFlow(org.id, id, body, profile?.id);
  }

  @Delete('/:id')
  async deleteFlow(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._flowsService.deleteFlow(org.id, id, profile?.id);
  }

  @Put('/:id/canvas')
  async saveCanvas(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: SaveCanvasDto
  ) {
    return this._flowsService.saveCanvas(org.id, id, body, profile?.id);
  }

  @Post('/:id/status')
  async updateFlowStatus(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: UpdateFlowStatusDto
  ) {
    return this._flowsService.updateFlowStatus(
      org.id,
      id,
      body.status,
      profile?.id
    );
  }

  @Get('/:id/posts')
  async getInstagramPosts(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._flowsService.getInstagramPosts(org.id, id, profile?.id);
  }

  @Get('/:id/executions')
  async getExecutions(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this._flowsService.getExecutions(
      id,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined
    );
  }
}
