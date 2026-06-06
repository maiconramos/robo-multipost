'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { FacebookDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/facebook.dto';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { FacebookPreview } from '@gitroom/frontend/components/new-launch/providers/facebook/facebook.preview';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const FacebookSettings = () => {
  const t = useT();
  const { register, watch } = useSettings();
  const postCurrentType = watch('post_type');
  const postType = [
    {
      value: 'post',
      label: t('post_type_option_post_reel', 'Post / Reel'),
    },
    {
      value: 'story',
      label: t('post_type_option_story', 'Story'),
    },
  ];

  return (
    <>
      <Select
        label={t('post_type', 'Post Type')}
        {...register('post_type', {
          value: 'post',
        })}
      >
        <option value="">{t('select_post_type', 'Select Post Type...')}</option>
        {postType.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>

      {postCurrentType !== 'story' && (
        <Input
          label={t(
            'facebook_embedded_url',
            'Embedded URL (only for text Post)'
          )}
          {...register('url')}
        />
      )}
    </>
  );
};

export default withProvider<FacebookDto>({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: FacebookSettings,
  CustomPreviewComponent: FacebookPreview,
  dto: FacebookDto,
  checkValidity: async ([firstPost, ...otherPosts] = [], settings) => {
    if (settings?.post_type !== 'story') {
      return true;
    }

    if (!firstPost?.length) {
      return 'Stories should have at least one media';
    }

    const checkVideosLength = await Promise.all(
      firstPost
        ?.filter((f) => (f?.path?.indexOf?.('mp4') ?? -1) > -1)
        ?.flatMap((p) => p?.path)
        ?.map((p) => {
          return new Promise<number>((res) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = p;
            video.addEventListener('loadedmetadata', () => {
              res(video.duration);
            });
          });
        }) ?? []
    );

    for (const video of checkVideosLength) {
      if (video > 60) {
        return 'Facebook Stories video should be maximum 60 seconds';
      }
    }

    return true;
  },
  maximumCharacters: 63206,
});
