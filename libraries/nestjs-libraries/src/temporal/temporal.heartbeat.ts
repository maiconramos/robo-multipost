import { Context } from '@temporalio/activity';

const HEARTBEAT_INTERVAL = 15_000;
const DETAILS = Symbol.for('multipost.postHeartbeatDetails');

const readDetails = (context: any): unknown => context[DETAILS];

export const setHeartbeatDetails = (details: string): void => {
  try {
    const context = Context.current() as any;
    context[DETAILS] = details;
  } catch {
    // Calls shared with HTTP handlers/providers outside Temporal are a no-op.
  }
};

export const withHeartbeat = async <T>(
  operation: () => Promise<T>
): Promise<T> => {
  try {
    const context = Context.current() as any;
    setHeartbeatDetails(`${context.info?.activityType || 'activity'}: entered`);
  } catch {
    // The activity wrapper can be exercised safely in unit tests/HTTP paths.
  }

  let logged = false;
  const interval = setInterval(() => {
    try {
      const context = Context.current() as any;
      context.heartbeat(readDetails(context));
    } catch (error) {
      if (!logged) {
        logged = true;
        console.error('withHeartbeat: heartbeat failed', error);
      }
    }
  }, HEARTBEAT_INTERVAL);

  try {
    return await operation();
  } finally {
    clearInterval(interval);
  }
};
