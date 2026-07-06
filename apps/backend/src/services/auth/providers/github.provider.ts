import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';

@AuthProvider({ provider: 'GITHUB' })
export class GithubProvider extends AuthProviderAbstract {
  generateLink(): string {
    return `https://github.com/login/oauth/authorize?client_id=${
      process.env.GITHUB_CLIENT_ID
    }&scope=user:email&redirect_uri=${encodeURIComponent(
      `${process.env.FRONTEND_URL}/settings`
    )}`;
  }

  async getToken(code: string, _redirectUri?: string): Promise<string> {
    const { access_token } = await (
      await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${process.env.FRONTEND_URL}/settings`,
        }),
      })
    ).json();

    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string }> {
    const data = await (
      await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();

    const emails: Array<{
      email: string;
      primary?: boolean;
      verified?: boolean;
    }> = await (
      await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();

    // Somente o email PRIMARIO e VERIFICADO — nunca `emails[0]` cru: a lista
    // pode conter emails secundarios nao confirmados (ex.: alguem adiciona o
    // email de outra pessoa sem provar posse), e a ordem nao e garantida.
    // O restante do fluxo (email-lock de convite) confia neste valor.
    const primaryVerified = (emails || []).find(
      (e) => e.primary && e.verified
    );
    if (!primaryVerified?.email) {
      throw new Error('No verified primary email on the GitHub account');
    }

    return {
      email: primaryVerified.email,
      id: String(data.id),
    };
  }
}
