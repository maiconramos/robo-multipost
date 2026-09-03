'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { WordpressPostType } from '@gitroom/frontend/components/new-launch/providers/wordpress/wordpress.post.type';
import { WordpressTerms } from '@gitroom/frontend/components/new-launch/providers/wordpress/wordpress.terms';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';
import { WordpressDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/wordpress.dto';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const WordpressSettings: FC = () => {
  const form = useSettings();
  const t = useT();
  return (
    <>
      <Input label={t('label_title', 'Title')} {...form.register('title')} />
      <WordpressPostType {...form.register('type')} />
      <Select
        label={t('wordpress_status_label', 'Status')}
        {...form.register('status')}
      >
        <option value="publish">
          {t('wordpress_status_publish', 'Publish')}
        </option>
        <option value="draft">{t('wordpress_status_draft', 'Draft')}</option>
        <option value="pending">
          {t('wordpress_status_pending', 'Pending')}
        </option>
        <option value="private">
          {t('wordpress_status_private', 'Private')}
        </option>
      </Select>
      <WordpressTerms
        func="categoriesList"
        label={t('wordpress_categories_label', 'Categories')}
        name="categories"
      />
      <WordpressTerms
        func="tagsList"
        label={t('wordpress_tags_label', 'WordPress Tags')}
        name="tags"
      />
      <MediaComponent
        label={t('label_cover_picture', 'Cover picture')}
        description={t('wordpress_add_cover_picture', 'Add a cover picture')}
        {...form.register('main_image')}
      />
    </>
  );
};
export default withProvider<WordpressDto>({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: WordpressSettings,
  CustomPreviewComponent: undefined, // WordpressPreview,
  dto: WordpressDto,
  checkValidity: undefined,
  maximumCharacters: 100000,
  defaults: { status: 'publish' },
});
