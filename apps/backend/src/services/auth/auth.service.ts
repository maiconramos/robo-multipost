import { Injectable, Logger } from '@nestjs/common';
import { Provider, User } from '@prisma/client';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { AuthService as AuthChecker } from '@gitroom/helpers/auth/auth.service';
import { AuthProviderManager } from '@gitroom/backend/services/auth/providers/providers.manager';
import dayjs from 'dayjs';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { ForgotReturnPasswordDto } from '@gitroom/nestjs-libraries/dtos/auth/forgot-return.password.dto';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { NewsletterService } from '@gitroom/nestjs-libraries/newsletter/newsletter.service';
import { isIssuedBeforeCutoff } from '@gitroom/nestjs-libraries/services/auth/session.token';
import {
  emailT,
  normalizeLang,
} from '@gitroom/nestjs-libraries/emails/i18n/email.i18n';
import { createHash } from 'crypto';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

// Logins sociais cujo providerToken e um access token do provedor.
const BOUND_TOKEN_PROVIDERS: string[] = [
  Provider.GITHUB,
  Provider.GOOGLE,
  Provider.GENERIC,
];
const BOUND_PROVIDER_TOKEN_TTL = 3600;

export const boundProviderTokenKey = (
  provider: string,
  token: unknown
): string | null => {
  if (!BOUND_TOKEN_PROVIDERS.includes(String(provider).toUpperCase())) {
    return null;
  }
  const value = typeof token === 'string' ? token : '';
  return `oauth-login-token:${String(provider).toUpperCase()}:${createHash(
    'sha256'
  )
    .update(value)
    .digest('hex')}`;
};

@Injectable()
export class AuthService {
  private readonly _logger = new Logger(AuthService.name);
  constructor(
    private _userService: UsersService,
    private _organizationService: OrganizationService,
    private _notificationService: NotificationService,
    private _emailService: EmailService,
    private _providerManager: AuthProviderManager
  ) {}
  async canRegister(provider: string) {
    if (
      process.env.DISABLE_REGISTRATION !== 'true' ||
      provider === Provider.GENERIC
    ) {
      return true;
    }

    return (await this._organizationService.getCount()) === 0;
  }

  async routeAuth(
    provider: Provider,
    body: CreateOrgUserDto | LoginUserDto,
    ip: string,
    userAgent: string,
    addToOrg?:
      | boolean
      | {
          email?: string;
          orgId: string;
          role: 'USER' | 'ADMIN';
          id: string;
          profileIds?: string[];
          profileRole?: 'MANAGER' | 'EDITOR' | 'VIEWER';
        },
    lang?: string
  ) {
    if (provider === Provider.LOCAL) {
      if (process.env.DISALLOW_PLUS && body.email.includes('+')) {
        throw new Error('Email with plus sign is not allowed');
      }
      if (body instanceof CreateOrgUserDto) {
        body.email = body.email.toLowerCase();
      }
      const user = await this._userService.getUserByEmail(body.email);
      if (body instanceof CreateOrgUserDto) {
        if (user) {
          throw new Error('Email already exists');
        }

        const inviteAllowsRegister = await this.inviteAllowsRegistration(
          addToOrg,
          body.email
        );
        if (!inviteAllowsRegister && !(await this.canRegister(provider))) {
          throw new Error('Registration is disabled');
        }

        // Registro via convite NAO cria workspace pessoal: a pessoa entra
        // apenas no workspace de quem convidou (modelo agencia/equipe). Só o
        // auto-cadastro (sem convite) cria um workspace proprio (SaaS).
        const joinInvite = await this.resolveInviteJoin(addToOrg, body.email);
        let createdUser: User;
        let addedOrg: any = false;
        if (joinInvite && addToOrg && typeof addToOrg !== 'boolean') {
          createdUser = (await this._organizationService.createUserForInvite(
            body,
            ip,
            userAgent
          )) as User;
          addedOrg = await this._organizationService.addUserToOrg(
            createdUser.id,
            addToOrg.id,
            addToOrg.orgId,
            addToOrg.role,
            addToOrg.profileIds,
            addToOrg.profileRole
          );
          if (!addedOrg) {
            // Entrada no workspace do convite falhou (tier sem team, convite
            // consumido, corrida): cria um workspace pessoal para nao deixar a
            // conta orfa (sem org — estado que quebraria o AuthMiddleware).
            this._logger.warn(
              `Invite join failed for org ${addToOrg.orgId}; created a personal workspace fallback instead.`
            );
            await this._organizationService.createOrgForUser(
              createdUser.id,
              body.company,
              lang
            );
          }
        } else {
          const create = await this._organizationService.createOrgAndUser(
            body,
            ip,
            userAgent,
            lang
          );
          createdUser = create.users[0].user;
        }

        const obj = { addedOrg, jwt: await this.jwt(createdUser) };
        const orgLang = normalizeLang(lang);
        await this._emailService.sendEmail(
          body.email,
          emailT('email_activate_subject', orgLang),
          emailT('email_activate_html', orgLang, {
            link: `${process.env.FRONTEND_URL}/auth/activate/${obj.jwt}`,
          }),
          'top',
          undefined,
          orgLang
        );
        return obj;
      }

      if (
        !user ||
        !(await AuthChecker.comparePasswordAsync(body.password, user.password))
      ) {
        throw new Error('Invalid user name or password');
      }

      if (!user.activated) {
        throw new Error('User is not activated');
      }

      return { addedOrg: false, jwt: await this.jwt(user) };
    }

    const { user, addedOrg } = await this.loginOrRegisterProvider(
      provider,
      body as CreateOrgUserDto,
      ip,
      userAgent,
      lang,
      addToOrg
    );

    return { addedOrg, jwt: await this.jwt(user) };
  }

  // Decide se um convite pode liberar o registro mesmo com o registro publico
  // desativado (DISABLE_REGISTRATION). Um convite genuino nao basta: para nao
  // transformar o token num "abre instancia fechada", exigimos que
  //  (1) o convite seja um JWT valido e nao expirado (garantido por
  //      getOrgFromCookie: verifyJWT + timeLimit) — chega aqui como objeto;
  //  (2) o email do registrante bata com o email convidado (email-lock) — sem
  //      isso o token seria portador para qualquer identidade;
  //  (3) o convite ainda nao tenha sido consumido (guarda de replay).
  // Falhando qualquer condicao, o bypass e negado e o canRegister volta a
  // mandar (bloqueando o registro publico em instancia fechada).
  private async inviteAllowsRegistration(
    addToOrg:
      | boolean
      | { email?: string; id: string; [key: string]: unknown }
      | undefined,
    registrantEmail?: string
  ): Promise<boolean> {
    if (!addToOrg || typeof addToOrg === 'boolean') {
      return false;
    }
    const invitedEmail = addToOrg.email?.trim().toLowerCase();
    const normalizedRegistrant = registrantEmail?.trim().toLowerCase();
    if (!invitedEmail || !normalizedRegistrant || invitedEmail !== normalizedRegistrant) {
      return false;
    }
    if (await this._organizationService.isInviteConsumed(addToOrg.id)) {
      return false;
    }
    return true;
  }

  // Decide se o registro deve ENTRAR no workspace do convite (e portanto NAO
  // criar workspace pessoal). Honra convite por email (email precisa bater) e
  // convite por link sem email (bearer). Convite ja consumido nao vale.
  // Diferente de inviteAllowsRegistration (que exige email para o bypass de
  // DISABLE_REGISTRATION): aqui, link sem email tambem entra.
  private async resolveInviteJoin(
    addToOrg:
      | boolean
      | { email?: string; id: string; [key: string]: unknown }
      | undefined,
    registrantEmail?: string
  ): Promise<boolean> {
    if (!addToOrg || typeof addToOrg === 'boolean') {
      return false;
    }
    const invitedEmail = addToOrg.email?.trim().toLowerCase();
    const normalizedRegistrant = registrantEmail?.trim().toLowerCase();
    if (invitedEmail && invitedEmail !== normalizedRegistrant) {
      return false;
    }
    if (await this._organizationService.isInviteConsumed(addToOrg.id)) {
      return false;
    }
    return true;
  }

  /**
   * Convite para um usuario ja logado (POST /user/join-org). Convite com
   * e-mail so vale para a conta com esse e-mail, como no registro e no OAuth;
   * convite so com link (sem e-mail) continua valendo para quem tem o link.
   */
  public getInviteForUser(cookie: string | undefined, userEmail?: string) {
    const invite = this.getOrgFromCookie(cookie);
    if (!invite) {
      return false;
    }
    const invitedEmail =
      typeof invite.email === 'string' ? invite.email.trim().toLowerCase() : '';
    if (
      invitedEmail &&
      invitedEmail !== (userEmail ?? '').trim().toLowerCase()
    ) {
      return false;
    }
    return invite;
  }

  public getOrgFromCookie(cookie?: string) {
    if (!cookie) {
      return false;
    }

    try {
      const getOrg: any = AuthChecker.verifyJWT(cookie);
      // Todo JWT da instancia usa o mesmo segredo: so o formato de convite
      // (campos certos, com os tipos certos) serve aqui.
      if (
        !getOrg ||
        typeof getOrg.orgId !== 'string' ||
        typeof getOrg.id !== 'string' ||
        !['USER', 'ADMIN'].includes(getOrg.role) ||
        !getOrg.timeLimit ||
        dayjs(getOrg.timeLimit).isBefore(dayjs())
      ) {
        return false;
      }

      return getOrg as {
        email: string;
        role: 'USER' | 'ADMIN';
        orgId: string;
        id: string;
        profileIds?: string[];
        profileRole?: 'MANAGER' | 'EDITOR' | 'VIEWER';
      };
    } catch (err) {
      return false;
    }
  }

  private async loginOrRegisterProvider(
    provider: Provider,
    body: CreateOrgUserDto,
    ip: string,
    userAgent: string,
    lang?: string,
    addToOrg?:
      | boolean
      | {
          email?: string;
          orgId: string;
          role: 'USER' | 'ADMIN';
          id: string;
          profileIds?: string[];
          profileRole?: 'MANAGER' | 'EDITOR' | 'VIEWER';
        }
  ) {
    // Token de acesso do provedor so vale se veio da nossa troca de code
    // (checkExists): um token emitido para OUTRO app (outro site com "Entrar
    // com Google/GitHub", outro app no mesmo IdP) logava na conta da vitima.
    const boundKey = boundProviderTokenKey(provider, body.providerToken);
    if (boundKey && !(await ioRedis.get(boundKey))) {
      throw new Error('Invalid provider token');
    }

    const providerInstance = this._providerManager.getProvider(provider);
    const providerUser = await providerInstance.getUser(body.providerToken);

    if (!providerUser) {
      throw new Error('Invalid provider token');
    }
    if (boundKey) {
      await ioRedis.del(boundKey);
    }

    const user = await this._userService.getUserByProvider(
      providerUser.id,
      provider
    );
    if (user) {
      // Usuario OAuth ja existe: login. Se veio por convite valido, entra no
      // workspace convidado (sem criar nada novo).
      const joinInvite = await this.resolveInviteJoin(
        addToOrg,
        providerUser.email
      );
      const addedOrg =
        joinInvite && addToOrg && typeof addToOrg !== 'boolean'
          ? await this._organizationService.addUserToOrg(
              user.id,
              addToOrg.id,
              addToOrg.orgId,
              addToOrg.role,
              addToOrg.profileIds,
              addToOrg.profileRole
            )
          : false;
      return { user, addedOrg };
    }

    // Email-lock: o convite so libera o registro para a identidade OAuth cujo
    // email confirmado bate com o email convidado.
    const inviteAllowsRegister = await this.inviteAllowsRegistration(
      addToOrg,
      providerUser.email
    );
    if (!inviteAllowsRegister && !(await this.canRegister(provider))) {
      throw new Error('Registration is disabled');
    }

    const dtoLike = {
      company: body.company,
      email: providerUser.email,
      password: '',
      provider,
      providerId: providerUser.id,
      datafast_visitor_id: body.datafast_visitor_id,
    };

    // Registro via convite nao cria workspace pessoal (igual ao LOCAL).
    const joinInvite = await this.resolveInviteJoin(
      addToOrg,
      providerUser.email
    );
    let createdUser: User;
    let addedOrg: any = false;
    let postRegOrgId: string;
    if (joinInvite && addToOrg && typeof addToOrg !== 'boolean') {
      createdUser = (await this._organizationService.createUserForInvite(
        dtoLike,
        ip,
        userAgent
      )) as User;
      addedOrg = await this._organizationService.addUserToOrg(
        createdUser.id,
        addToOrg.id,
        addToOrg.orgId,
        addToOrg.role,
        addToOrg.profileIds,
        addToOrg.profileRole
      );
      postRegOrgId = addToOrg.orgId;
      if (!addedOrg) {
        // Fallback: entrada no convite falhou -> workspace pessoal (nao orfao).
        this._logger.warn(
          `Invite join failed for org ${addToOrg.orgId} (OAuth); created a personal workspace fallback instead.`
        );
        const fallback = await this._organizationService.createOrgForUser(
          createdUser.id,
          dtoLike.company,
          lang
        );
        postRegOrgId = fallback.id;
      }
    } else {
      const create = await this._organizationService.createOrgAndUser(
        dtoLike,
        ip,
        userAgent,
        lang
      );
      createdUser = create.users[0].user;
      postRegOrgId = create.id;
    }

    this._track('register', providerUser.email, body.datafast_visitor_id).catch(
      (err) => {}
    );

    await NewsletterService.register(providerUser.email);

    try {
      if (providerInstance?.postRegistration) {
        await providerInstance.postRegistration(body.providerToken, postRegOrgId);
      }
    } catch (err) {
      // Don't fail registration if postRegistration fails
    }

    return { user: createdUser, addedOrg };
  }

  private async _track(
    name: string,
    email: string,
    datafast_visitor_id: string
  ) {
    if (email && datafast_visitor_id && process.env.DATAFAST_API_KEY) {
      try {
        await fetch('https://datafa.st/api/v1/goals', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.DATAFAST_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            datafast_visitor_id: datafast_visitor_id,
            name: name,
            metadata: {
              email,
            },
          }),
        });
      } catch (err) {}
    }
  }

  async forgot(email: string) {
    const user = await this._userService.getUserByEmail(email);
    if (!user || user.providerName !== Provider.LOCAL) {
      return false;
    }

    const resetValues = AuthChecker.signJWT({
      id: user.id,
      expires: dayjs().add(20, 'minutes').format('YYYY-MM-DD HH:mm:ss'),
    });

    const lang = normalizeLang(
      await this._organizationService.getFirstOrgLanguageByUserId(user.id)
    );
    await this._notificationService.sendEmail(
      user.email,
      emailT('email_reset_subject', lang),
      emailT('email_reset_html', lang, {
        link: `${process.env.FRONTEND_URL}/auth/forgot/${resetValues}`,
        minutes: 20,
      }),
      undefined,
      lang
    );
  }

  async forgotReturn(body: ForgotReturnPasswordDto) {
    const user = AuthChecker.verifyJWT(body.token) as {
      id: string;
      expires: string;
      iat?: number;
    };
    if (
      !user ||
      typeof user.id !== 'string' ||
      !user.expires ||
      dayjs(user.expires).isBefore(dayjs())
    ) {
      return false;
    }

    // Uso unico: a troca grava User.sessionsValidAfter, e todo link emitido
    // antes dela (inclusive este) deixa de valer.
    const current = await this._userService.getUserById(user.id);
    if (
      !current ||
      current.providerName !== Provider.LOCAL ||
      isIssuedBeforeCutoff(user.iat, current.sessionsValidAfter)
    ) {
      return false;
    }

    return this._userService.updatePassword(user.id, body.password);
  }

  async activate(code: string, tracking: string) {
    const user = AuthChecker.verifyJWT(code) as {
      id: string;
      activated: boolean;
      email: string;
    };
    if (user.id && !user.activated) {
      const getUserAgain = await this._userService.getUserByEmail(user.email);
      if (getUserAgain.activated) {
        return false;
      }
      await this._userService.activateUser(user.id);
      user.activated = true;
      this._track('register', user.email, tracking).catch((err) => {});
      await NewsletterService.register(user.email);
      return this.jwt(user as any);
    }

    return false;
  }

  async resendActivationEmail(email: string) {
    const user = await this._userService.getUserByEmail(email);

    if (!user) {
      throw new Error('User not found');
    }

    if (user.activated) {
      throw new Error('Account is already activated');
    }

    const jwt = await this.jwt(user);

    const lang = normalizeLang(
      await this._organizationService.getFirstOrgLanguageByUserId(user.id)
    );
    await this._emailService.sendEmail(
      user.email,
      emailT('email_activate_subject', lang),
      emailT('email_activate_html', lang, {
        link: `${process.env.FRONTEND_URL}/auth/activate/${jwt}`,
      }),
      'top',
      undefined,
      lang
    );

    return true;
  }

  oauthLink(provider: string, query?: any) {
    const providerInstance = this._providerManager.getProvider(provider);
    return providerInstance.generateLink(query);
  }

  async checkExists(provider: string, code: string, redirectUri?: string) {
    const providerInstance = this._providerManager.getProvider(provider);
    const token = await providerInstance.getToken(code, redirectUri);
    const user = await providerInstance.getUser(token);
    if (!user) {
      throw new Error('Invalid user');
    }
    const checkExists = await this._userService.getUserByProvider(
      user.id,
      provider as Provider
    );
    if (checkExists) {
      return { jwt: await this.jwt(checkExists) };
    }

    // conta nova: o token volta ao navegador para o /auth/register; marca que
    // ele saiu da nossa troca de code (ver loginOrRegisterProvider)
    const boundKey = boundProviderTokenKey(provider, token);
    if (boundKey) {
      await ioRedis.set(boundKey, '1', 'EX', BOUND_PROVIDER_TOKEN_TTL);
    }
    return { token };
  }

  private async jwt(user: User) {
    if (user.password) {
      delete user.password;
    }
    return AuthChecker.signJWT(user);
  }
}
