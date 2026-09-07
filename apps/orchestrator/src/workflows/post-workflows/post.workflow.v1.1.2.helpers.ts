import {
  ActivityFailure,
  ApplicationFailure,
  TimeoutFailure,
  TimeoutType,
} from '@temporalio/common';

export type PostActivityFailureClassification = {
  type: 'retry' | 'refresh-token' | 'bad-body' | 'timeout' | 'unknown';
  message: string;
};

export const classifyPostActivityFailure = (
  err: unknown
): PostActivityFailureClassification => {
  if (err instanceof ActivityFailure && err.cause instanceof TimeoutFailure) {
    // Schedule-To-Start proves that no worker began the activity. Every other
    // timeout may have happened after an external mutation and is therefore
    // an unknown outcome, even when no heartbeat details reached Temporal.
    return err.cause.timeoutType === TimeoutType.SCHEDULE_TO_START
      ? { type: 'retry', message: '' }
      : { type: 'timeout', message: '' };
  }

  const cause =
    err instanceof ActivityFailure && err.cause instanceof ApplicationFailure
      ? err.cause
      : undefined;

  if (cause?.type === 'refresh_token') {
    return { type: 'refresh-token', message: cause.message || '' };
  }

  if (cause?.type === 'bad_body') {
    return { type: 'bad-body', message: cause.message || '' };
  }

  return { type: 'unknown', message: '' };
};
