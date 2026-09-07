import {
  ActivityFailure,
  ApplicationFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from '@temporalio/common';
import { classifyPostActivityFailure } from './post.workflow.v1.1.2.helpers';

const activityFailure = (cause: Error) =>
  new ActivityFailure(
    'activity failed',
    'postSocialPending',
    'activity-1',
    RetryState.NON_RETRYABLE_FAILURE,
    'worker-1',
    cause
  );

describe('classifyPostActivityFailure', () => {
  it('permite repetir apenas timeout Schedule-To-Start', () => {
    expect(
      classifyPostActivityFailure(
        activityFailure(
          new TimeoutFailure(
            'not started',
            undefined,
            TimeoutType.SCHEDULE_TO_START
          )
        )
      )
    ).toEqual({ type: 'retry', message: '' });
  });

  it.each([undefined, ['postSocialPending: entered']])(
    'trata heartbeat timeout como resultado incerto mesmo com details=%p',
    (details) => {
      expect(
        classifyPostActivityFailure(
          activityFailure(
            new TimeoutFailure(
              'heartbeat timeout',
              details,
              TimeoutType.HEARTBEAT
            )
          )
        )
      ).toEqual({ type: 'timeout', message: '' });
    }
  );

  it('classifica refresh e rejeicao explicita do provider', () => {
    expect(
      classifyPostActivityFailure(
        activityFailure(
          ApplicationFailure.create({
            message: 'expired',
            type: 'refresh_token',
            nonRetryable: true,
          })
        )
      )
    ).toEqual({ type: 'refresh-token', message: 'expired' });

    expect(
      classifyPostActivityFailure(
        activityFailure(
          ApplicationFailure.create({
            message: 'rejected',
            type: 'bad_body',
            nonRetryable: true,
          })
        )
      )
    ).toEqual({ type: 'bad-body', message: 'rejected' });
  });

  it('nao considera erro desconhecido seguro para uma segunda mutacao', () => {
    expect(
      classifyPostActivityFailure(activityFailure(new Error('socket')))
    ).toEqual({ type: 'unknown', message: '' });
  });
});
