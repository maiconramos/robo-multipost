import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import {
  defineSignal,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
} from '@temporalio/workflow';
import { TypedSearchAttributes } from '@temporalio/common';
import dayjs from 'dayjs';
import { capitalize, sortBy } from 'lodash';
import {
  PendingCheckResponse,
  PostResponse,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { postId as postIdSearchParam } from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import {
  classifyPostActivityFailure,
  PostActivityFailureClassification,
} from './post.workflow.v1.1.2.helpers';

const HEARTBEAT_TIMEOUT = 3 * 60 * 1000;
const MAX_PENDING_CHECKS = 90;
const ACTION_ATTEMPTS = 5;

const supportActivities = (taskQueue: string) =>
  proxyActivities<PostActivity>({
    startToCloseTimeout: '10 minute',
    taskQueue,
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '2 minutes',
    },
  });

const mutationActivities = (taskQueue: string) =>
  proxyActivities<PostActivity>({
    startToCloseTimeout: '30 minute',
    scheduleToStartTimeout: '3 minute',
    heartbeatTimeout: HEARTBEAT_TIMEOUT,
    taskQueue,
    retry: { maximumAttempts: 1 },
  });

const checkActivities = (taskQueue: string) =>
  proxyActivities<PostActivity>({
    startToCloseTimeout: '2 minute',
    scheduleToStartTimeout: '3 minute',
    taskQueue,
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '10 seconds',
    },
  });

const {
  getPostV112,
  getPostsListV112,
  inAppNotification,
  changeState,
  updatePost,
  sendWebhooks,
  isCommentableForWorkflow,
} = proxyActivities<PostActivity>({
  startToCloseTimeout: '10 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

const poke = defineSignal('poke');

type HandledFailure =
  | PostActivityFailureClassification
  | { type: 'stop'; message: string };

export async function postWorkflowV112({
  taskQueue,
  postId,
  organizationId,
  postNow = false,
}: {
  taskQueue: string;
  postId: string;
  organizationId: string;
  postNow?: boolean;
}) {
  const {
    refreshTokenForWorkflow,
    internalPlugsForWorkflow,
    globalPlugsForWorkflow,
    processInternalPlug,
    processPlug,
  } = supportActivities(taskQueue);
  const { postSocialPending, postCommentV112, finalizePost } =
    mutationActivities(taskQueue);
  const { checkPostStatus } = checkActivities(taskQueue);

  let poked = false;
  setHandler(poke, () => {
    poked = true;
  });

  const firstPost = await getPostV112(organizationId, postId);
  if (!firstPost || (!postNow && firstPost.state !== 'QUEUE')) {
    return;
  }

  if (!postNow) {
    await sleep(
      dayjs(firstPost.publishDate).isBefore(dayjs())
        ? 0
        : dayjs(firstPost.publishDate).diff(dayjs(), 'millisecond')
    );
  }

  // Repeat intervals measure publishing time, not time spent waiting for the
  // original schedule.
  const startTime = new Date();
  const postsListBefore = await getPostsListV112(organizationId, postId);
  const [post] = postsListBefore;

  if (!post?.integration || (!postNow && post.state !== 'QUEUE')) {
    return;
  }

  if (post.integration.refreshNeeded) {
    await inAppNotification(
      post.organizationId,
      {
        subjectKey: 'notif_post_skipped_subject',
        messageKey: 'notif_post_reconnect',
        params: {
          provider: post.integration.providerIdentifier,
          integrationName: post.integration.name,
        },
        profileId: post.integration.profileId ?? post.profileId ?? null,
      },
      true,
      false,
      'info'
    );
    await changeState(
      post.id,
      'ERROR',
      'Refresh channel needed',
      postsListBefore
    );
    return;
  }

  if (post.integration.disabled) {
    await inAppNotification(
      post.organizationId,
      {
        subjectKey: 'notif_post_skipped_subject',
        messageKey: 'notif_post_disabled',
        params: {
          provider: post.integration.providerIdentifier,
          integrationName: post.integration.name,
        },
        profileId: post.integration.profileId ?? post.profileId ?? null,
      },
      true,
      false,
      'info'
    );
    await changeState(post.id, 'ERROR', 'Channel disabled', postsListBefore);
    return;
  }

  const toComment =
    postsListBefore.length > 1 &&
    (await isCommentableForWorkflow(post.integration.providerIdentifier));
  const postsList = toComment ? postsListBefore : [postsListBefore[0]];
  const postsResults: PostResponse[] = [];

  const handleActivityError = async (
    error: unknown,
    integrationId = post.integration.id
  ): Promise<HandledFailure> => {
    const classification = classifyPostActivityFailure(error);
    if (classification.type !== 'refresh-token') {
      return classification;
    }

    if (
      !(await refreshTokenForWorkflow(
        organizationId,
        integrationId,
        classification.message
      ))
    ) {
      return { type: 'stop', message: classification.message };
    }

    return { type: 'retry', message: classification.message };
  };

  const markUnconfirmed = async (error: unknown) => {
    await changeState(postsList[0].id, 'ERROR', error, postsList);
    await inAppNotification(
      post.organizationId,
      {
        subjectKey: 'notif_post_unconfirmed_subject',
        messageKey: 'notif_post_unconfirmed',
        params: {
          provider: capitalize(post.integration.providerIdentifier),
          integrationName: post.integration.name,
        },
        profileId: post.integration.profileId ?? post.profileId ?? null,
      },
      true,
      false,
      'fail'
    );
  };

  const notifyRejected = async (index: number, message: string) => {
    await inAppNotification(
      post.organizationId,
      {
        subjectKey:
          index === 0
            ? 'notif_post_error_subject'
            : 'notif_post_error_comments_subject',
        messageKey:
          index === 0 ? 'notif_post_error' : 'notif_post_error_comments',
        params: {
          provider: post.integration.providerIdentifier,
          integrationName: post.integration.name,
          error: message ? `: ${message}` : '',
        },
        profileId: post.integration.profileId ?? post.profileId ?? null,
      },
      true,
      false,
      'fail'
    );
  };

  const resolvePending = async (
    pending: PostResponse
  ): Promise<PostResponse | false> => {
    let pendingData = pending.pendingData;
    let consecutiveErrors = 0;

    for (let check = 0; check < MAX_PENDING_CHECKS; check++) {
      let finalizing = false;
      try {
        let result: PendingCheckResponse = await checkPostStatus(
          organizationId,
          post.integration.id,
          pendingData
        );

        if (result.status !== 'completed') {
          pendingData = result.pendingData;
        }

        if (result.status === 'ready') {
          finalizing = true;
          result = await finalizePost(
            organizationId,
            post.integration.id,
            result.pendingData
          );
        }

        if (result.status === 'completed') {
          return {
            id: pending.id,
            postId: result.postId,
            releaseURL: result.releaseURL,
            status: 'success',
          };
        }

        pendingData = result.pendingData;
        consecutiveErrors = 0;
      } catch (error) {
        const handled = await handleActivityError(error);

        if (handled.type === 'retry') {
          continue;
        }

        if (handled.type === 'stop') {
          await markUnconfirmed(error);
          return false;
        }

        if (handled.type === 'bad-body') {
          await changeState(postsList[0].id, 'ERROR', error, postsList);
          await notifyRejected(0, handled.message);
          return false;
        }

        // A failed read-only check may be retried. An unknown finalize result
        // is never finalized again directly: the next iteration checks remote
        // status first and only the provider can prove whether it is still safe.
        consecutiveErrors++;
        if (consecutiveErrors >= ACTION_ATTEMPTS) {
          break;
        }
        if (
          finalizing ||
          handled.type === 'timeout' ||
          handled.type === 'unknown'
        ) {
          await sleep('20 seconds');
          continue;
        }
      }

      await sleep('20 seconds');
    }

    await markUnconfirmed('Could not confirm the post status');
    return false;
  };

  for (let index = 0; index < postsList.length; index++) {
    const resultCountBefore = postsResults.length;
    let providerReturned = false;
    let databaseUpdated = false;

    for (let attempt = 0; attempt < ACTION_ATTEMPTS; attempt++) {
      try {
        if (index === 0) {
          postsResults.push(
            ...(await postSocialPending(organizationId, post.integration.id, [
              postsList[index],
            ]))
          );
        } else {
          if (postsList[index].delay) {
            await sleep(
              60_000 * Math.max(0, Number(postsList[index].delay ?? 0))
            );
          }
          postsResults.push(
            ...(await postCommentV112(
              postsResults[0].postId,
              postsResults.length === 1
                ? undefined
                : postsResults[index - 1].postId,
              organizationId,
              post.integration.id,
              [postsList[index]]
            ))
          );
        }

        providerReturned = true;
        if (!postsResults[index]) {
          await markUnconfirmed('Provider returned no publication result');
          return false;
        }

        if (postsResults[index].status === 'pending') {
          let resolved: PostResponse | false = false;
          try {
            resolved = await resolvePending(postsResults[index]);
          } catch (error) {
            try {
              await markUnconfirmed(error);
            } catch {
              // Preserve the original outcome when error persistence is down.
            }
          }
          if (!resolved) {
            return false;
          }
          postsResults[index] = resolved;
        }

        await updatePost(
          postsList[index].id,
          postsResults[index].postId,
          postsResults[index].releaseURL
        );
        databaseUpdated = true;

        if (index === 0) {
          await inAppNotification(
            post.organizationId,
            {
              subjectKey: 'notif_post_published_subject',
              messageKey: 'notif_post_published',
              params: {
                provider: capitalize(post.integration.providerIdentifier),
                url: postsResults[0].releaseURL,
              },
              profileId: post.integration.profileId ?? post.profileId ?? null,
            },
            true,
            true
          );
        }
        break;
      } catch (error) {
        if (providerReturned) {
          if (!databaseUpdated) {
            try {
              await markUnconfirmed(error);
            } catch {
              // The provider response still prevents another publish attempt.
            }
            return false;
          }
          break;
        }

        const handled = await handleActivityError(error);
        if (handled.type === 'retry') {
          continue;
        }

        if (handled.type === 'timeout' || handled.type === 'unknown') {
          try {
            await markUnconfirmed(error);
          } catch {
            // Do not turn persistence failure into a second mutation attempt.
          }
          return false;
        }

        await changeState(postsList[0].id, 'ERROR', error, postsList);
        if (handled.type === 'bad-body') {
          await notifyRejected(index, handled.message);
        }
        return false;
      }
    }

    if (postsResults.length === resultCountBefore) {
      await changeState(
        postsList[0].id,
        'ERROR',
        'No activity worker accepted the publication',
        postsList
      );
      return false;
    }
  }

  await sendWebhooks(
    postsResults[0].postId,
    post.organizationId,
    post.integration.id
  );

  const internalPlugsList = await internalPlugsForWorkflow(
    organizationId,
    post.integration.id,
    JSON.parse(post.settings)
  );
  const globalPlugsList = (
    await globalPlugsForWorkflow(organizationId, post.integration.id)
  ).reduce((all, current) => {
    for (let currentRun = 1; currentRun <= current.totalRuns; currentRun++) {
      all.push({
        ...current,
        delay: current.delay * currentRun,
      });
    }
    return all;
  }, []);
  const repeatPost = !post.intervalInDays
    ? []
    : [
        {
          type: 'repeat-post',
          delay:
            post.intervalInDays * 24 * 60 * 60 * 1000 -
            (new Date().getTime() - startTime.getTime()),
        },
      ];
  const actions = sortBy(
    [...internalPlugsList, ...globalPlugsList, ...repeatPost],
    'delay'
  );

  while (actions.length > 0) {
    const action = actions.shift();
    if (!action) {
      continue;
    }
    await sleep(Math.max(0, Number(action.delay ?? 0)));

    if (action.type === 'internal-plug') {
      for (let attempt = 0; attempt < ACTION_ATTEMPTS; attempt++) {
        try {
          await processInternalPlug({
            ...action,
            post: postsResults[0].postId,
          });
          break;
        } catch (error) {
          const handled = await handleActivityError(error, action.integration);
          if (handled.type !== 'retry') {
            break;
          }
        }
      }
    }

    if (action.type === 'global') {
      for (let attempt = 0; attempt < ACTION_ATTEMPTS; attempt++) {
        try {
          const processed = await processPlug({
            ...action,
            postId: postsResults[0].postId,
          });
          if (processed) {
            const indexes = actions
              .reduce<number[]>((all, current, currentIndex) => {
                if (current.plugId === action.plugId) {
                  all.push(currentIndex);
                }
                return all;
              }, [])
              .reverse();
            for (const currentIndex of indexes) {
              actions.splice(currentIndex, 1);
            }
          }
          break;
        } catch (error) {
          const handled = await handleActivityError(error);
          if (handled.type !== 'retry') {
            break;
          }
        }
      }
    }

    if (action.type === 'repeat-post') {
      await startChild(postWorkflowV112, {
        parentClosePolicy: 'ABANDON',
        args: [{ taskQueue, postId, organizationId, postNow: true }],
        workflowId: `post_${post.id}_${makeId(10)}`,
        typedSearchAttributes: new TypedSearchAttributes([
          { key: postIdSearchParam, value: postId },
        ]),
      });
    }
  }
}
