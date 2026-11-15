// Presentation routes only. Execution capabilities remain owned by each engine.
export const automationEntryOptions = {
  instagram: [
    {
      key: 'zernio_comment',
      icon: 'instagram',
      href: '/automations/zernio/new',
    },
    {
      key: 'comment',
      icon: 'instagram',
      href: '/automations/instagram/new?type=comment',
    },
    {
      key: 'story',
      icon: 'instagram',
      href: '/automations/instagram/new?type=story',
    },
    { key: 'repost', icon: 'instagram', href: '/automations/reposts/new' },
  ],
  facebook: [
    {
      key: 'comment',
      icon: 'facebook',
      href: '/automations/new?trigger=comment_on_post',
    },
    {
      key: 'message',
      icon: 'messenger',
      href: '/automations/new?trigger=messenger_message',
    },
  ],
} as const;
