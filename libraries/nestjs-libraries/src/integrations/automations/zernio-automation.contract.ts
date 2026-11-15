import { HttpException } from '@nestjs/common';
import type { AutomationConfiguration } from '../../dtos/flows/automation-management.dto';
export function zernioFail(code: string, status = 400): never {
  throw new HttpException(code, status);
}
export const object = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
export function zernioPayload(c: AutomationConfiguration): Record<string, any> {
  if (
    (c.platform && c.platform !== 'instagram') ||
    (c.triggerType && c.triggerType !== 'comment_on_post')
  )
    zernioFail('ZERNIO_COMMENTS_ONLY');
  if (
    !['all', 'specific'].includes(c.postMode || '') ||
    (c.postMode === 'specific' && c.postIds?.length !== 1) ||
    (c.postMode === 'all' && c.postIds?.length)
  )
    zernioFail('ZERNIO_POST_MODE_UNSUPPORTED');
  if (c.matchMode === 'all') zernioFail('ZERNIO_MATCH_MODE_UNSUPPORTED');
  if (
    c.scheduledPostId ||
    c.aliasMediaIds?.length ||
    c.storyIds?.length ||
    c.matchReactions !== undefined ||
    c.priority !== undefined ||
    c.requireFollow ||
    c.openingDmMessage ||
    c.followGateMessage ||
    c.openingDmButtonText ||
    c.alreadyFollowedButtonText ||
    c.gateExhaustedMessage ||
    c.maxGateAttempts !== undefined
  )
    zernioFail('ZERNIO_OPTION_UNSUPPORTED');
  const variants =
    c.dmVariants ||
    (c.dmMessages || [c.dmMessage || '']).map((message) => ({
      message,
      buttonText: c.dmButtonText,
      buttonUrl: c.dmButtonUrl,
    }));
  if (!variants.length || variants.some((v) => !v.message.trim()))
    zernioFail('ZERNIO_DM_REQUIRED');
  const first = variants[0];
  if (
    variants.some(
      (v) =>
        (v.buttonText || '') !== (first.buttonText || '') ||
        (v.buttonUrl || '') !== (first.buttonUrl || '')
    )
  )
    zernioFail('ZERNIO_SHARED_BUTTON_REQUIRED');
  const replies = c.replyMessages || (c.replyMessage ? [c.replyMessage] : []);
  if (variants.length > 6 || replies.length > 6)
    zernioFail('ZERNIO_VARIATIONS_LIMIT');
  if (
    (first.buttonText || '').length > 20 ||
    variants.some((v) => v.message.length > (first.buttonText ? 640 : 1000))
  )
    zernioFail('ZERNIO_MESSAGE_TOO_LONG');
  const personalize = (s: string) => {
    const mapped = s.split('{commenter_name}').join('{{name}}');
    if (
      /\{(?!\{(?:name|first_name|username)\}\})[^}]*\}/.test(
        mapped.replace(/\{\{(?:name|first_name|username)\}\}/g, '')
      )
    )
      zernioFail('ZERNIO_VARIABLE_UNSUPPORTED');
    return mapped;
  };
  return {
    name: c.name,
    trigger: 'comment',
    keywords: c.keywords || [],
    matchMode: c.matchMode === 'exact' ? 'exact' : 'contains',
    platformPostId: c.postMode === 'specific' ? c.postIds![0] : null,
    postId: null,
    postTitle: null,
    dmMessage: personalize(first.message),
    dmMessageVariations: variants.slice(1).map((v) => personalize(v.message)),
    buttons: first.buttonText
      ? [
          {
            type: 'url',
            title: personalize(first.buttonText),
            url: first.buttonUrl,
          },
        ]
      : [],
    publicReplyPolicy: 'after_dm',
    commentReply: personalize(replies[0] || ''),
    commentReplyVariations: replies.slice(1).map(personalize),
    isActive: false,
    linkTracking: false,
    alsoMatchInDms: false,
    repeatPolicy: { mode: 'once' },
  };
}
export interface ZernioRemoteBinding {
  automationId: string;
  accountId: string;
  profileId: string;
}
export interface ZernioOperation {
  id: string;
  type: 'create' | 'update' | 'status';
  phase?: 'create_paused' | 'apply';
  startedAt: string;
  desiredStatus: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  configuration: AutomationConfiguration;
}
export interface ZernioDefinition {
  schemaVersion: 1;
  configuration: AutomationConfiguration;
  remote?: ZernioRemoteBinding;
  sync: {
    state: 'idle' | 'pending' | 'unknown';
    operation?: ZernioOperation;
    errorCode?: string;
  };
}
export function zernioDefinition(v: unknown): ZernioDefinition {
  const d = object(v);
  if (
    d.schemaVersion !== 1 ||
    !d.configuration ||
    !['idle', 'pending', 'unknown'].includes(d.sync?.state)
  )
    zernioFail('ZERNIO_INVALID_SAVED_CONFIGURATION', 409);
  return d as ZernioDefinition;
}
