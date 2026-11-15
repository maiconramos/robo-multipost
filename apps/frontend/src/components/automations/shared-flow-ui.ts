import { assertPrivateVariantRepresentation } from '@gitroom/nestjs-libraries/database/prisma/flows/private-message-variants';
import {
  normalizeDefinition,
  type CommentDefinition,
} from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
import type { FlowChannelDto } from '@gitroom/nestjs-libraries/dtos/flows/flow-v2.dto';

export function connectionSettingsUrl(provider: string, integrationId: string) {
  if (provider === 'zernio-instagram') return '/settings?tab=credentials';
  const key =
    provider === 'facebook' ? 'facebookAutomation' : 'instagramAutomation';
  return `/settings?tab=credentials&${key}=${encodeURIComponent(
    integrationId
  )}${provider === 'facebook' ? '' : '#meta-instagram'}`;
}
export interface DraftProblem {
  field: 'name' | 'channels' | 'posts' | 'definition';
  code: string;
  nodeId?: string;
}
export function validateSharedDraft(
  name: string,
  channels: FlowChannelDto[],
  definition: CommentDefinition
): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!name.trim()) problems.push({ field: 'name', code: 'NAME_REQUIRED' });
  if (!channels.length)
    problems.push({ field: 'channels', code: 'CHANNEL_REQUIRED' });
  if (channels.some((c) => c.postMode === 'scheduled' && !c.scheduledPostId))
    problems.push({ field: 'posts', code: 'POST_REQUIRED' });
  if (channels.some((c) => c.postMode === 'specific' && !c.postIds.length))
    problems.push({ field: 'posts', code: 'POST_REQUIRED' });
  try {
    normalizeDefinition(definition);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_GRAPH';
    const invalid = definition.nodes.find((node) => {
      try {
        const cfg = JSON.parse(node.data);
        if (node.type === 'SEND_DM') assertPrivateVariantRepresentation(cfg);
        return (
          ['SEND_DM', 'REPLY_COMMENT'].includes(node.type) &&
          ((!cfg.message?.trim() &&
            !cfg.messages?.length &&
            !cfg.variants?.length) ||
            (cfg.messages !== undefined &&
              (!Array.isArray(cfg.messages) ||
                !cfg.messages.length ||
                cfg.messages.length > 10 ||
                cfg.messages.some(
                  (message: unknown) =>
                    typeof message !== 'string' ||
                    !message.trim() ||
                    message.length >
                      (node.type === 'SEND_DM'
                        ? cfg.buttonText
                          ? 640
                          : 2000
                        : 2200)
                ))) ||
            cfg.message?.length >
              (node.type === 'SEND_DM'
                ? cfg.buttonText
                  ? 640
                  : 2000
                : 2200) ||
            ((cfg.buttonText || cfg.buttonUrl) &&
              (!cfg.buttonText?.trim() ||
                cfg.buttonText.length > 20 ||
                !/^https:\/\//.test(cfg.buttonUrl))))
        );
      } catch {
        return true;
      }
    });
    problems.push({ field: 'definition', code, nodeId: invalid?.id });
  }
  return problems;
}

/** Only safe, product-facing guidance. Do not display raw provider error bodies. */
export function executionGuidance(status: string, error?: string | null) {
  if (status === 'SKIPPED_CONFLICT') return 'messenger_run_skipped';
  if (status === 'SKIPPED_CONDITION') return 'messenger_run_condition';
  if (status === 'UNKNOWN') return 'shared_run_unknown';
  if (!error && status !== 'FAILED') return null;
  if (/TOKEN|AUTH|PERMISSION|CREDENTIAL|CHANNEL_NOT_READY/.test(error || ''))
    return 'shared_run_connection';
  if (/WINDOW|EXPIRED/.test(error || '')) return 'shared_run_expired';
  return 'shared_run_failed';
}

export function sharedFailureCode(status: number, body: unknown): string {
  const message =
    body && typeof body === 'object' && 'message' in body
      ? body.message
      : undefined;
  if (typeof message === 'string' && /^[A-Z_]{1,80}$/.test(message))
    return message;
  return status === 409 ? 'REVISION_CONFLICT' : 'INVALID_FLOW';
}
