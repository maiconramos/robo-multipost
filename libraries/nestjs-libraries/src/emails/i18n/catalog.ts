/**
 * Catalogo de traducao dos e-mails do backend/orchestrator (pt/en).
 *
 * Chaves flat snake_case + interpolacao {{var}} (mesma convencao do i18next do
 * frontend). NAO ha camada de i18n no backend alem deste modulo — todo e-mail
 * transacional e toda notificacao resolvem o texto por aqui.
 *
 * IMPORTANTE (paridade com o frontend): as chaves de MENSAGEM de notificacao
 * (as `notif_*` que NAO terminam em `_subject`) sao usadas tanto aqui (e-mail)
 * quanto no sininho in-app via `useT()`. Elas DEVEM existir tambem em
 * `libraries/react-shared-libraries/src/translation/locales/{pt,en}/translation.json`
 * com o MESMO texto e os MESMOS `{{params}}`. O teste `email.i18n.spec.ts`
 * garante essa paridade (NOTIFICATION_MESSAGE_KEYS).
 */

export type EmailLang = 'pt' | 'en';
export type EmailCatalog = Record<string, string>;

/**
 * Chaves de MENSAGEM de notificacao (contentKey) — renderizadas no sininho e no
 * e-mail. Devem ter paridade com o translation.json do frontend.
 */
export const NOTIFICATION_MESSAGE_KEYS = [
  'notif_channel_refresh_failed',
  'notif_post_reconnect',
  'notif_post_disabled',
  'notif_post_published',
  'notif_post_error',
  'notif_post_error_comments',
  'notif_streak',
] as const;

const pt: EmailCatalog = {
  // --- Transacionais (somente e-mail) ---
  email_activate_subject: 'Ative sua conta',
  email_activate_html:
    'Clique <a href="{{link}}">aqui</a> para ativar sua conta.',
  email_reset_subject: 'Redefina sua senha',
  email_reset_html:
    'Você solicitou a redefinição da sua senha.<br />Clique <a href="{{link}}">aqui</a> para redefinir sua senha.<br />O link expira em {{minutes}} minutos.',
  email_invite_subject: 'Você foi convidado para uma organização',
  email_invite_html:
    'Você foi convidado para participar de uma organização. Clique <a href="{{link}}">aqui</a> para entrar.<br />O link expira em 1 hora.',
  email_invite_profile_subject: 'Você foi convidado para um perfil',
  email_invite_profile_html:
    'Você foi convidado para o(s) perfil(is) <strong>{{profiles}}</strong> como <strong>{{role}}</strong>. Clique <a href="{{link}}">aqui</a> para entrar.<br />O link expira em 1 hora.',
  email_role_viewer: 'Visualizador',
  email_role_manager: 'Gerente',
  email_role_editor: 'Editor',
  email_role_owner: 'Proprietário',

  // --- Rodapé do wrapper compartilhado ---
  email_footer_preferences:
    'Você pode alterar suas preferências de notificação nas <a href="{{url}}">configurações da conta.</a>',

  // --- Digest ---
  email_digest_subject: '[Multipost] Suas últimas notificações',

  // --- Notificações: assuntos (somente e-mail/digest) ---
  notif_channel_refresh_failed_subject:
    '⚠️ Seu canal {{name}} foi desconectado e parou de publicar',
  notif_post_skipped_subject:
    'Não foi possível publicar no {{provider}} para {{integrationName}}',
  notif_post_published_subject: 'Sua publicação foi feita no {{provider}}',
  notif_post_error_subject:
    'Erro ao publicar no {{provider}} para {{integrationName}}',
  notif_post_error_comments_subject:
    'Erro ao publicar comentários no {{provider}} para {{integrationName}}',
  notif_streak_subject: 'Lembrete de sequência',

  // --- Notificações: mensagens (sininho + e-mail) — paridade com frontend ---
  notif_channel_refresh_failed:
    'O canal {{name}} ({{provider}}) foi desconectado e parou de publicar porque a conexão expirou. Reconecte em {{url}} para voltar a publicar.',
  notif_post_reconnect:
    'Não foi possível publicar no {{provider}} para {{integrationName}} porque você precisa reconectá-lo. Ative-o e tente novamente.',
  notif_post_disabled:
    'Não foi possível publicar no {{provider}} para {{integrationName}} porque está desativado. Ative-o e tente novamente.',
  notif_post_published:
    'Sua publicação foi feita no {{provider}} em {{url}}',
  notif_post_error:
    'Ocorreu um erro ao publicar no {{provider}}{{error}}',
  notif_post_error_comments:
    'Ocorreu um erro ao publicar comentários no {{provider}}{{error}}',
  notif_streak:
    '<p>Você está prestes a perder sua sequência em duas horas! Agende uma publicação agora para mantê-la!</p>',
};

const en: EmailCatalog = {
  // --- Transactional (email only) ---
  email_activate_subject: 'Activate your account',
  email_activate_html:
    'Click <a href="{{link}}">here</a> to activate your account.',
  email_reset_subject: 'Reset your password',
  email_reset_html:
    'You have requested to reset your password.<br />Click <a href="{{link}}">here</a> to reset your password.<br />The link will expire in {{minutes}} minutes.',
  email_invite_subject: 'You have been invited to join an organization',
  email_invite_html:
    'You have been invited to join an organization. Click <a href="{{link}}">here</a> to join.<br />The link will expire in 1 hour.',
  email_invite_profile_subject: 'You have been invited to a profile',
  email_invite_profile_html:
    'You have been invited to the profile(s) <strong>{{profiles}}</strong> as <strong>{{role}}</strong>. Click <a href="{{link}}">here</a> to join.<br />The link will expire in 1 hour.',
  email_role_viewer: 'Viewer',
  email_role_manager: 'Manager',
  email_role_editor: 'Editor',
  email_role_owner: 'Owner',

  // --- Shared wrapper footer ---
  email_footer_preferences:
    'You can change your notification preferences in your <a href="{{url}}">account settings.</a>',

  // --- Digest ---
  email_digest_subject: '[Multipost] Your latest notifications',

  // --- Notifications: subjects (email/digest only) ---
  notif_channel_refresh_failed_subject:
    '⚠️ Your {{name}} channel was disconnected and stopped publishing',
  notif_post_skipped_subject:
    "We couldn't post to {{provider}} for {{integrationName}}",
  notif_post_published_subject: 'Your post has been published on {{provider}}',
  notif_post_error_subject:
    'Error posting on {{provider}} for {{integrationName}}',
  notif_post_error_comments_subject:
    'Error posting comments on {{provider}} for {{integrationName}}',
  notif_streak_subject: 'Streak Reminder',

  // --- Notifications: messages (bell + email) — parity with frontend ---
  notif_channel_refresh_failed:
    'The channel {{name}} ({{provider}}) was disconnected and stopped publishing because its connection expired. Reconnect at {{url}} to resume publishing.',
  notif_post_reconnect:
    "We couldn't post to {{provider}} for {{integrationName}} because you need to reconnect it. Please enable it and try again.",
  notif_post_disabled:
    "We couldn't post to {{provider}} for {{integrationName}} because it's disabled. Please enable it and try again.",
  notif_post_published:
    'Your post has been published on {{provider}} at {{url}}',
  notif_post_error:
    'An error occurred while posting on {{provider}}{{error}}',
  notif_post_error_comments:
    'An error occurred while posting comments on {{provider}}{{error}}',
  notif_streak:
    '<p>You are about to lose your streak in two hours! schedule a post now to keep it!</p>',
};

export const CATALOG: Record<EmailLang, EmailCatalog> = { pt, en };
