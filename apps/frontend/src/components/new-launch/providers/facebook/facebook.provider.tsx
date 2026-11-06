'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import {
  facebookAllowsComments,
  facebookStoryCommentError,
} from '@gitroom/nestjs-libraries/integrations/social/facebook.story-comments';
import { facebookBackgroundPreset } from '@gitroom/nestjs-libraries/integrations/social/facebook.background';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { getPresetBackground } from './facebook.background';
import {
  FacebookDto,
  FACEBOOK_PRESETS,
} from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/facebook.dto';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { FacebookPreview } from '@gitroom/frontend/components/new-launch/providers/facebook/facebook.preview';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';

export const FacebookSettings = () => {
  const t = useT();
  const { register, watch, setValue } = useSettings();
  const { integration, value } = useIntegration();
  // zernio-facebook reaproveita este componente; o titulo so existe na Graph API
  const supportsVideoTitle = integration?.identifier === 'facebook';
  const postCurrentType = watch('post_type');
  const selectedPreset = watch('text_format_preset_id');
  const plainText = stripHtmlValidation(
    'normal',
    value?.[0]?.content || '',
    true
  );
  const backgroundEligible = !!facebookBackgroundPreset({
    message: plainText,
    media: value?.[0]?.image,
    settings: {
      post_type: postCurrentType,
      url: watch('url'),
      text_format_preset_id: '1',
    },
  });

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
      <Select label={t('post_type', 'Post Type')} {...register('post_type')}>
        {postType.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>

      {postCurrentType === 'story' && (
        <p role="status" className="text-sm opacity-70">
          {t(
            'facebook_story_comments_unavailable',
            'Comments after publishing are not available for Facebook Stories. Remove comment blocks for this channel before publishing.'
          )}
        </p>
      )}
      {supportsVideoTitle && (
        <div className="flex flex-col gap-2">
          <Select
            label={t('facebook_background', 'Text background')}
            aria-label={t('facebook_background', 'Text background')}
            {...register('text_format_preset_id')}
          >
            <option value="">
              {t('facebook_background_none', 'No background')}
            </option>
            {FACEBOOK_PRESETS.map((preset) => (
              <option
                key={preset.id}
                value={preset.id}
                style={{
                  background: getPresetBackground(preset.id)?.background,
                  color: getPresetBackground(preset.id)?.text,
                }}
              >
                {t('facebook_preset_' + preset.id, preset.name)}
              </option>
            ))}
          </Select>
          <p className="text-xs opacity-70">
            {t(
              'facebook_background_note',
              'For text-only posts up to 130 characters, without links. Colors are approximate; unavailable backgrounds may be published as plain text.'
            )}
          </p>
          {selectedPreset && !backgroundEligible && (
            <p role="status" className="text-sm">
              {t(
                'facebook_background_ineligible',
                'The selected background does not apply to this post. It will be published without a background.'
              )}
            </p>
          )}
        </div>
      )}
      {!supportsVideoTitle && selectedPreset && (
        <div role="alert">
          {t(
            'facebook_background_native_only',
            'This background requires a native Facebook channel.'
          )}{' '}
          <button
            type="button"
            className="underline"
            onClick={() =>
              setValue('text_format_preset_id', undefined, {
                shouldDirty: true,
              })
            }
          >
            {t('facebook_background_remove', 'Remove background')}
          </button>
        </div>
      )}
      {postCurrentType !== 'story' && (
        <>
          <Input
            label={t(
              'facebook_embedded_url',
              'Embedded URL (only for text Post)'
            )}
            {...register('url')}
          />
          {supportsVideoTitle && (
            <Input
              label={t(
                'facebook_video_title',
                'Video Title (only for video Post)'
              )}
              {...register('title')}
            />
          )}
        </>
      )}
    </>
  );
};

export default withProvider<FacebookDto>({
  comments: (settings, identifier) =>
    facebookAllowsComments(settings, identifier),
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: FacebookSettings,
  CustomPreviewComponent: FacebookPreview,
  dto: FacebookDto,
  defaults: { post_type: 'post' },
  checkValidity: async (
    [firstPost, ...otherPosts] = [],
    settings,
    _extra,
    t,
    identifier = 'facebook'
  ) => {
    if (
      facebookStoryCommentError(
        settings,
        (firstPost ? 1 : 0) + otherPosts.length,
        identifier
      )
    ) {
      return (
        t?.(
          'facebook_story_comments_unavailable',
          'Comments after publishing are not available for Facebook Stories. Remove comment blocks for this channel before publishing.'
        ) ||
        'Comments after publishing are not available for Facebook Stories. Remove comment blocks for this channel before publishing.'
      );
    }
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
