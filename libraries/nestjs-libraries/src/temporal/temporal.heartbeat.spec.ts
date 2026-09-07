import { Context } from '@temporalio/activity';
import { setHeartbeatDetails, withHeartbeat } from './temporal.heartbeat';

describe('temporal heartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('envia o ultimo marcador sem misturar contexto entre activities', async () => {
    const heartbeat = jest.fn();
    const context = {
      heartbeat,
      info: { activityType: 'postSocialPending' },
    };
    jest.spyOn(Context, 'current').mockReturnValue(context as any);

    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const execution = withHeartbeat(async () => {
      setHeartbeatDetails('instagram: publish');
      await waiting;
      return 'done';
    });

    jest.advanceTimersByTime(15_000);
    expect(heartbeat).toHaveBeenCalledWith('instagram: publish');

    finish();
    await expect(execution).resolves.toBe('done');
  });

  it('vira no-op fora de uma activity Temporal', () => {
    jest.spyOn(Context, 'current').mockImplementation(() => {
      throw new Error('no activity context');
    });

    expect(() => setHeartbeatDetails('ignored')).not.toThrow();
  });
});
