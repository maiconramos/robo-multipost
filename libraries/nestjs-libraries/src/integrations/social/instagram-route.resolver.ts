import { InstagramMessagingService } from '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service';

// Integrations conectadas via Instagram Login API (graph.instagram.com + IG
// User Token) devem rotear comentários/DMs/follow-check/stories para
// graph.instagram.com, pois o Page Access Token de Facebook Login não tem
// acesso Standard ao campo is_user_follow_business nem ao endpoint de
// messaging. Standard Access no fluxo de IG Login dispensa App Review —
// crítico para instâncias self-hosted de alunos.
export const IG_LOGIN_GRAPH = 'graph.instagram.com';
export const FB_LOGIN_GRAPH = 'graph.facebook.com';

export interface IgRoute {
  token: string;
  host: string;
  useIgGraph: boolean;
}

export interface IgRouteIntegrationInput {
  token: string;
  providerIdentifier?: string | null;
  organizationId: string;
  profileId?: string | null;
  internalId: string;
}

/**
 * Escolhe token + host da Meta Graph API para qualquer activity que toque
 * endpoints de Instagram (comentários, DMs, follow-check, stories, reposts).
 *
 * Prioridade:
 *   1. integration conectada via Instagram Login API
 *      (providerIdentifier='instagram-standalone'): usa o proprio
 *      integration.token + graph.instagram.com.
 *   2. integration conectada via Facebook Login ('instagram') MAS com
 *      IG User Token cadastrado em Settings > Credenciais: usa esse token
 *      + graph.instagram.com. Dispensa reconectar via Standalone quando
 *      o aluno ja tem o token gerado direto no Meta Dashboard.
 *   3. Fallback: integration.token (Page Access Token) + graph.facebook.com.
 *      Funciona apenas com Advanced Access a instagram_manage_messages /
 *      is_user_follow_business (App Review).
 */
export async function resolveIgRoute(
  integration: IgRouteIntegrationInput,
  messaging: InstagramMessagingService
): Promise<IgRoute> {
  if (integration.providerIdentifier === 'instagram-standalone') {
    return {
      token: integration.token,
      host: IG_LOGIN_GRAPH,
      useIgGraph: true,
    };
  }

  const igToken = await messaging.resolveIgUserToken(
    integration.organizationId,
    integration.profileId || null,
    integration.internalId
  );
  if (igToken) {
    return { token: igToken, host: IG_LOGIN_GRAPH, useIgGraph: true };
  }

  return {
    token: integration.token,
    host: FB_LOGIN_GRAPH,
    useIgGraph: false,
  };
}
