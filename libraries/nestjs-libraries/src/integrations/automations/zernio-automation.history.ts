import { createHash } from 'node:crypto';
import type {
  AutomationExecutionDetail,
  AutomationExecutionStep,
  AutomationExecutionSummary,
  AutomationHistoryQueryDto,
  AutomationExecutionPage,
  HistoryStatus,
} from '../../dtos/flows/automation-history.dto';
import { automationHistoryQuerySchema } from '../../dtos/flows/automation-history.dto';
import type { FlowScope } from '../../dtos/flows/flow-v2.dto';
import { object, zernioFail } from './zernio-automation.contract';
const text = (v: unknown, max = 2000) =>
  typeof v === 'string' ? v.slice(0, max) : null;
const date = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(new Date(v).getTime())
    ? new Date(v).toISOString()
    : null;
const state = (r: Record<string, any>): HistoryStatus =>
  r.status === 'failed' || r.commentReplyStatus === 'failed'
    ? 'failed'
    : r.status === 'gated'
    ? 'waiting'
    : r.status === 'pending' || r.commentReplyStatus === 'pending'
    ? 'running'
    : r.status === 'sent'
    ? 'completed'
    : r.status === 'skipped'
    ? 'skipped'
    : 'unknown';
interface Args {
  scope: FlowScope;
  flowId: string;
  integrationId: string;
  accountName: string;
  query: AutomationHistoryQueryDto;
  executionId?: string;
  read: (skip: number, limit: number) => Promise<Record<string, any>>;
}
export async function zernioHistory(
  a: Args
): Promise<AutomationExecutionPage | AutomationExecutionDetail> {
  if (
    !automationHistoryQuerySchema.safeParse(a.query).success ||
    (a.query.from &&
      a.query.to &&
      new Date(a.query.from).getTime() > new Date(a.query.to).getTime())
  )
    zernioFail('INVALID_HISTORY_QUERY');
  const limit = a.query.limit ?? 25;
  const fingerprint = (filters: boolean) =>
    createHash('sha256')
      .update(
        JSON.stringify([
          a.scope.organizationId,
          a.scope.profileId,
          a.flowId,
          ...(filters
            ? [a.query.status || 'all', a.query.from || '', a.query.to || '']
            : []),
        ])
      )
      .digest('hex');
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const decode = (value: string, code: string) => {
    try {
      if (value.length > 512) throw new Error();
      const v = object(JSON.parse(Buffer.from(value, 'base64url').toString()));
      if (
        typeof v.id !== 'string' ||
        v.id.length > 100 ||
        typeof v.scope !== 'string' ||
        !Number.isInteger(v.offset) ||
        v.offset < 0 ||
        v.offset > 1000000
      )
        throw new Error();
      return v;
    } catch {
      zernioFail(code);
    }
  };
  const selected = a.executionId
    ? decode(a.executionId, 'INVALID_EXECUTION_ID')
    : null;
  if (selected && selected.scope !== fingerprint(false))
    zernioFail('EXECUTION_NOT_FOUND', 404);
  const cursor = a.query.cursor
    ? decode(a.query.cursor, 'INVALID_HISTORY_CURSOR')
    : null;
  if (cursor && cursor.scope !== fingerprint(true))
    zernioFail('INVALID_HISTORY_CURSOR');
  const summary = (
    r: Record<string, any>,
    offset = 0
  ): AutomationExecutionSummary => {
    const status = state(r);
    const startedAt = date(r.createdAt);
    if (!startedAt) zernioFail('ZERNIO_INVALID_RESPONSE', 502);
    return {
      id: encode({ id: r.id, scope: fingerprint(false), offset }),
      status,
      channel: 'instagram',
      trigger: 'comment_on_post',
      actorName: text(r.commenterName, 200) || text(r.commenterUsername, 200),
      actorId: text(r.commenterId, 200),
      text: text(r.commentText),
      textTruncated:
        typeof r.commentText === 'string' && r.commentText.length > 2000,
      accountName: a.accountName,
      startedAt,
      completedAt: null,
      guidance:
        status === 'waiting'
          ? 'waiting_interaction'
          : status === 'unknown'
          ? 'outcome_unknown'
          : status === 'failed'
          ? 'failed'
          : null,
    };
  };
  const detail = (r: Record<string, any>): AutomationExecutionDetail => {
    const step = (
      kind: AutomationExecutionStep['kind'],
      status: AutomationExecutionStep['status'],
      at: string | null
    ): AutomationExecutionStep => ({
      id: `${r.id}:${kind}`,
      kind,
      status,
      at,
      message: null,
    });
    const steps = [step('TRIGGER', 'completed', date(r.createdAt))];
    const statuses: Record<string, AutomationExecutionStep['status']> = {
      sent: 'accepted',
      failed: 'failed',
      pending: 'started',
      gated: 'waiting',
      skipped: 'skipped',
    };
    steps.push(step('SEND_DM', statuses[r.status] || 'unknown', null));
    if (r.commentReplyStatus)
      steps.push(
        step(
          'REPLY_COMMENT',
          statuses[r.commentReplyStatus] || 'unknown',
          date(r.publicReplyPostedAt)
        )
      );
    return {
      ...summary(r, selected?.offset || 0),
      id: a.executionId!,
      steps,
      logTruncated: false,
      technical: {
        flowId: a.flowId,
        engine: 'zernio',
        integrationId: a.integrationId,
        revision: null,
        postId: null,
      },
    };
  };
  const items: AutomationExecutionSummary[] = [];
  let anchored = !cursor,
    lastId: string | null = null;
  // Provider supports offset only. Seek the previous anchor again so incoming logs
  // do not silently shift the next page. Stop with an explicit expiry when too old.
  const start = Math.max(0, ((selected || cursor)?.offset || 0) - 100);
  for (let batch = 0; batch < 10; batch++) {
    const skip = start + batch * 100;
    const response = await a.read(skip, 100);
    if (!Array.isArray(response.logs) || response.logs.length > 100)
      zernioFail('ZERNIO_INVALID_RESPONSE', 502);
    const logs = response.logs as Record<string, any>[];
    for (let index = 0; index < logs.length; index++) {
      const r = object(logs[index]);
      if (typeof r.id !== 'string' || r.id.length > 100)
        zernioFail('ZERNIO_INVALID_RESPONSE', 502);
      if (selected) {
        if (r.id === selected.id) return detail(r);
        continue;
      }
      if (!anchored) {
        if (r.id === cursor!.id) anchored = true;
        continue;
      }
      lastId = r.id;
      const s = summary(r, skip + index);
      if (
        (!a.query.status ||
          a.query.status === 'all' ||
          s.status === a.query.status) &&
        (!a.query.from ||
          s.startedAt >= new Date(a.query.from).toISOString()) &&
        (!a.query.to || s.startedAt <= new Date(a.query.to).toISOString())
      )
        items.push(s);
      if (items.length === limit)
        return {
          items,
          nextCursor:
            index < logs.length - 1 || response.pagination?.hasMore
              ? encode({
                  id: lastId,
                  scope: fingerprint(true),
                  offset: skip + index,
                })
              : null,
        };
    }
    if (!response.pagination?.hasMore || !logs.length) {
      if (selected) zernioFail('EXECUTION_NOT_FOUND', 404);
      if (!anchored) zernioFail('HISTORY_CURSOR_EXPIRED', 409);
      return { items, nextCursor: null };
    }
    if (anchored && !selected && lastId)
      return {
        items,
        nextCursor: lastId
          ? encode({
              id: lastId,
              scope: fingerprint(true),
              offset: skip + logs.length - 1,
            })
          : null,
      };
  }
  if (selected) zernioFail('EXECUTION_NOT_FOUND', 404);
  zernioFail('HISTORY_CURSOR_EXPIRED', 409);
}
