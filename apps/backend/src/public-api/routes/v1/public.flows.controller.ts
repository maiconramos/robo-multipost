import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import * as Sentry from '@sentry/nestjs';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetPublicApiProfileId } from '@gitroom/nestjs-libraries/user/public.api.profile.from.request';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import {
  QuickCreateFlowDto,
  UpdateFlowStatusDto,
} from '@gitroom/nestjs-libraries/dtos/flows/flow.dto';

/**
 * API publica de automacoes de comentario/story do Instagram (Flows).
 *
 * Autenticada por chave de API (org-level, OAuth `pos_*` ou chave por-perfil)
 * via `PublicAuthMiddleware`, que popula `req.org` e — para chaves por-perfil —
 * `req.publicApiProfileId`. O escopo por-perfil e enforced em duas camadas:
 *   1. aqui (rejeita `?profileId`/body.profileId divergente da chave -> 403);
 *   2. no `FlowsService.assertIntegrationAccess` (integracao de outro perfil ->
 *      403; so Instagram; nao desativada).
 *
 * ValidationPipe estrito (whitelist + forbidNonWhitelisted) protege contra
 * mass-assignment SEM alterar o pipe global (blast-radius minimo).
 */
@ApiTags('Automações (Flows)')
@ApiSecurity('api-key')
@Controller('/public/v1')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  })
)
export class PublicFlowsController {
  constructor(private _flowsService: FlowsService) {}

  /**
   * Resolve o profileId efetivo respeitando a politica de chave por-perfil.
   * Chave por-perfil so opera no proprio perfil: `?profileId` divergente -> 403.
   */
  private resolveProfileId(
    publicApiProfileId: string | undefined,
    requestedProfileId?: string
  ): string | undefined {
    if (
      publicApiProfileId &&
      requestedProfileId &&
      requestedProfileId !== publicApiProfileId
    ) {
      throw new HttpException(
        { msg: 'Profile key cannot access another profile' },
        403
      );
    }
    return publicApiProfileId ?? requestedProfileId;
  }

  @Post('/flows')
  @ApiOperation({
    summary: 'Criar automação de comentário/story do Instagram',
    description:
      'Cria um Flow (automação). Com chave de organização sem `?profileId`, é atribuído ao perfil Default. ' +
      'Quando `postMode` é omitido, assume `next_publication` (vincula ao próximo post publicado no canal).',
  })
  @ApiQuery({
    name: 'profileId',
    required: false,
    description:
      'Escopa o flow a um perfil (apenas chave de organização). Omitido → perfil Default.',
  })
  @ApiBody({ type: QuickCreateFlowDto })
  @ApiResponse({ status: 201, description: 'Flow criado (geralmente já ACTIVE).' })
  @ApiResponse({
    status: 400,
    description:
      'Validação: dmButtonUrl não-https, postIds vazio em postMode=specific, matchMode inválido, ou profileId inexistente.',
  })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida.' })
  @ApiResponse({
    status: 403,
    description: 'Chave de perfil tentando criar em outro profileId.',
  })
  @ApiResponse({
    status: 412,
    description: 'Integração não é Instagram, está desativada ou não existe.',
  })
  // Cada criacao/ativacao dispara assinatura de webhook na Meta Graph API
  // (rate-limit ~10 req/s por app) — limite proprio mais apertado que o global.
  @Throttle({ default: { limit: 20, ttl: 3600_000 } })
  async createFlow(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Query('profileId') profileId: string | undefined,
    @Body() body: QuickCreateFlowDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const effectiveProfileId = this.resolveProfileId(
      publicApiProfileId,
      profileId
    );
    // Modo padrao para o cenario de encadeamento (gerar imagem -> publicar ->
    // criar automacao): next_publication faz a automacao se conectar sozinha ao
    // proximo post publicado, sem o cliente precisar do media id do Instagram.
    const payload: QuickCreateFlowDto = {
      ...body,
      postMode: body.postMode ?? 'next_publication',
    };
    return this._flowsService.quickCreateFlow(
      org.id,
      payload,
      effectiveProfileId
    );
  }

  @Get('/flows')
  @ApiOperation({
    summary: 'Listar automações',
    description:
      'Lista os flows do escopo: chave de organização vê todos; chave de perfil vê apenas os do próprio perfil.',
  })
  @ApiQuery({ name: 'profileId', required: false })
  @ApiQuery({
    name: 'integrationId',
    required: false,
    description: 'Filtra os flows por canal do Instagram.',
  })
  @ApiResponse({ status: 200, description: 'Lista de flows.' })
  async listFlows(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Query('profileId') profileId?: string,
    @Query('integrationId') integrationId?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const effectiveProfileId = this.resolveProfileId(
      publicApiProfileId,
      profileId
    );
    const flows = await this._flowsService.getFlows(org.id, effectiveProfileId);
    if (integrationId) {
      return flows.filter((f: any) => f.integrationId === integrationId);
    }
    return flows;
  }

  @Get('/flows/:id')
  @ApiOperation({ summary: 'Detalhar uma automação (com nós e arestas)' })
  @ApiParam({ name: 'id', description: 'ID do flow' })
  @ApiQuery({ name: 'profileId', required: false })
  async getFlow(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id: string,
    @Query('profileId') profileId?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const effectiveProfileId = this.resolveProfileId(
      publicApiProfileId,
      profileId
    );
    return this._flowsService.getFlow(org.id, id, effectiveProfileId);
  }

  @Put('/flows/:id')
  @ApiOperation({
    summary: 'Editar uma automação',
    description:
      'Reescreve o flow a partir do mesmo contrato de criação (QuickCreateFlowDto). Promove DRAFT→ACTIVE.',
  })
  @ApiParam({ name: 'id', description: 'ID do flow' })
  @ApiQuery({ name: 'profileId', required: false })
  @ApiBody({ type: QuickCreateFlowDto })
  // quickUpdateFlow promove DRAFT->ACTIVE, disparando assinatura de webhook na
  // Meta — mesmo rate limit do POST para evitar abuso da chamada outbound.
  @Throttle({ default: { limit: 20, ttl: 3600_000 } })
  async updateFlow(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id: string,
    @Query('profileId') profileId: string | undefined,
    @Body() body: QuickCreateFlowDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const effectiveProfileId = this.resolveProfileId(
      publicApiProfileId,
      profileId
    );
    return this._flowsService.quickUpdateFlow(
      org.id,
      id,
      body,
      effectiveProfileId
    );
  }

  @Post('/flows/:id/status')
  @ApiOperation({
    summary: 'Ativar / pausar / arquivar uma automação',
    description: 'Altera o status: ACTIVE, PAUSED, ARCHIVED ou DRAFT.',
  })
  @ApiParam({ name: 'id', description: 'ID do flow' })
  @ApiQuery({ name: 'profileId', required: false })
  @ApiBody({ type: UpdateFlowStatusDto })
  // Ativar (status ACTIVE) dispara assinatura de webhook na Meta — throttle.
  @Throttle({ default: { limit: 20, ttl: 3600_000 } })
  async updateFlowStatus(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id: string,
    @Query('profileId') profileId: string | undefined,
    @Body() body: UpdateFlowStatusDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const effectiveProfileId = this.resolveProfileId(
      publicApiProfileId,
      profileId
    );
    return this._flowsService.updateFlowStatus(
      org.id,
      id,
      body.status,
      effectiveProfileId
    );
  }

  @Delete('/flows/:id')
  @ApiOperation({ summary: 'Excluir uma automação' })
  @ApiParam({ name: 'id', description: 'ID do flow' })
  @ApiQuery({ name: 'profileId', required: false })
  async deleteFlow(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id: string,
    @Query('profileId') profileId?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const effectiveProfileId = this.resolveProfileId(
      publicApiProfileId,
      profileId
    );
    return this._flowsService.deleteFlow(org.id, id, effectiveProfileId);
  }
}
