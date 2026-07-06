import { proxyActivities, sleep } from '@temporalio/workflow';
import { EmailActivity } from '@gitroom/orchestrator/activities/email.activity';

const { sendDigestEmail, getUserOrgs, setStreak } =
  proxyActivities<EmailActivity>({
    startToCloseTimeout: '10 minute',
    taskQueue: 'main',
    cancellationType: 'ABANDON',
  });

export async function streakWorkflow({
  organizationId,
}: {
  organizationId: string;
}) {
  await setStreak(organizationId, 'start');
  await sleep(79200000);
  const userOrgs = await getUserOrgs(organizationId);
  const lang = userOrgs?.language ?? undefined;
  for (const user of userOrgs?.users || []) {
    if (!user.user.sendStreakEmails) {
      continue;
    }
    await sendDigestEmail(
      user.user.email,
      [
        {
          subjectKey: 'notif_streak_subject',
          messageKey: 'notif_streak',
          type: 'info',
        },
      ],
      lang,
      'bottom'
    );
  }
  await sleep(7200000);
  await setStreak(organizationId, 'end');
}
