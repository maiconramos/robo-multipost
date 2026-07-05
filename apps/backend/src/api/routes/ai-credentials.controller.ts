import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AiKind, AiScope, Organization, Role, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { getOrgRole } from '@gitroom/nestjs-libraries/user/org.role';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { AiCredentialService } from '@gitroom/nestjs-libraries/ai/ai-credential.service';
import { AiProviderResolverService } from '@gitroom/nestjs-libraries/ai/ai-provider-resolver.service';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Profile } from '@prisma/client';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import {
  SaveAiCredentialPayload,
  SaveAiCredentialPayloadSchema,
} from '@gitroom/nestjs-libraries/ai/ai-credential.schemas';

const VALID_KINDS: AiKind[] = ['TEXT', 'IMAGE', 'VIDEO', 'WEB_SEARCH'];

function parseKindParam(raw: string): AiKind {
  const normalized = raw.toUpperCase() as AiKind;
  if (!VALID_KINDS.includes(normalized)) {
    throw new HttpException(`kind invalido: ${raw}`, 400);
  }
  return normalized;
}

interface ScopeContext {
  scope: AiScope;
  profileId?: string;
}

@ApiTags('AI Credentials')
@Controller('/ai/credentials')
export class AiCredentialsController {
  constructor(
    private _credentialService: AiCredentialService,
    private _profileService: ProfileService,
    private _resolver: AiProviderResolverService
  ) {}

  /**
   * Resolve `scope` a partir de `profileId` recebido na query.
   * - Sem profileId, ou profileId pertence ao perfil default → scope=WORKSPACE
   * - profileId de perfil secundario → scope=PROFILE
   *
   * Valida que o profile pertence ao org E que o usuario tem acesso a ele
   * (org USER precisa de membership; admin tem acesso implicito).
   */
  private async resolveScope(
    organizationId: string,
    actor: { userId: string; orgRole: Role },
    profileIdRaw?: string
  ): Promise<ScopeContext> {
    if (!profileIdRaw) return { scope: 'WORKSPACE' };

    const { profile } = await this._profileService.assertProfileAccess(
      organizationId,
      profileIdRaw,
      actor.userId,
      actor.orgRole
    );
    if (profile.isDefault) {
      return { scope: 'WORKSPACE' };
    }
    return { scope: 'PROFILE', profileId: profile.id };
  }

  @Get('/')
  async list(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    const credentials = await this._credentialService.listRedactedByOrg(
      org.id
    );
    const orgRole = getOrgRole(org);
    if (orgRole !== 'USER') {
      return credentials;
    }
    // Org USER so ve metadados de credenciais do workspace e dos perfis
    // que acessa — nao enumera a configuracao dos demais perfis da org.
    const accessible = await this._profileService.getAccessibleProfiles(
      org.id,
      user.id,
      orgRole
    );
    const accessibleIds = new Set(accessible.map((p) => p.id));
    return credentials.filter(
      (credential: { profileId?: string | null }) =>
        !credential.profileId || accessibleIds.has(credential.profileId)
    );
  }

  @Get('/:kind')
  async getByKind(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('kind') kindRaw: string,
    @Query('profileId') profileIdRaw?: string
  ) {
    const kind = parseKindParam(kindRaw);
    const ctx = await this.resolveScope(
      org.id,
      { userId: user.id, orgRole: getOrgRole(org) },
      profileIdRaw
    );
    const result = await this._credentialService.getRedacted(
      org.id,
      ctx.scope,
      kind,
      ctx.profileId
    );
    return result ?? null;
  }

  @Put('/:kind')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async save(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('kind') kindRaw: string,
    @Body() body: unknown,
    @Query('profileId') profileIdRaw?: string
  ) {
    const kind = parseKindParam(kindRaw);
    const ctx = await this.resolveScope(
      org.id,
      { userId: user.id, orgRole: getOrgRole(org) },
      profileIdRaw
    );
    const payload: SaveAiCredentialPayload =
      SaveAiCredentialPayloadSchema.parse(body);
    await this._credentialService.save(
      org.id,
      ctx.scope,
      kind,
      payload,
      ctx.profileId
    );
    return this._credentialService.getRedacted(
      org.id,
      ctx.scope,
      kind,
      ctx.profileId
    );
  }

  @Delete('/:kind')
  @HttpCode(204)
  @CheckPolicies([AuthorizationActions.Delete, Sections.ADMIN])
  async remove(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('kind') kindRaw: string,
    @Query('profileId') profileIdRaw?: string
  ) {
    const kind = parseKindParam(kindRaw);
    const ctx = await this.resolveScope(
      org.id,
      { userId: user.id, orgRole: getOrgRole(org) },
      profileIdRaw
    );
    await this._credentialService.delete(
      org.id,
      ctx.scope,
      kind,
      ctx.profileId
    );
  }

  /**
   * Retorna a credencial EFETIVA (resolver completo: PROFILE → WORKSPACE)
   * sanitizada — sem expor a apiKey. Usado por componentes que precisam
   * saber qual modelo/options esta ativo para o perfil atual (ex: modal
   * AI Video que mostra "Modelo: Seedance 2.0").
   *
   * Nao requer permissao de ADMIN — qualquer usuario do org pode ver
   * o modelo configurado, ja que so e leitura de metadados.
   */
  @Get('/:kind/effective')
  async getEffective(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('kind') kindRaw: string
  ) {
    const kind = parseKindParam(kindRaw);
    try {
      const resolved = await this._resolver.resolve(
        org.id,
        kind,
        profile?.id
      );
      return {
        provider: resolved.provider,
        model: resolved.model,
        fallbackModel: resolved.fallbackModel,
        options: resolved.options,
      };
    } catch (e) {
      // 412 = nao configurado → retorna null para o frontend renderizar
      // o estado "configure suas chaves" sem mostrar erro intrusivo.
      if (e instanceof HttpException && e.getStatus() === 412) {
        return null;
      }
      throw e;
    }
  }

  @Post('/:kind/test')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async test(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('kind') kindRaw: string,
    @Query('profileId') profileIdRaw?: string
  ) {
    const kind = parseKindParam(kindRaw);
    const ctx = await this.resolveScope(
      org.id,
      { userId: user.id, orgRole: getOrgRole(org) },
      profileIdRaw
    );
    return this._credentialService.test(
      org.id,
      ctx.scope,
      kind,
      ctx.profileId
    );
  }
}
