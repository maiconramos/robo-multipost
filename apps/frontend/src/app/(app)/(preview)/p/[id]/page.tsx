import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
import { getPlatformIconPath } from '@gitroom/frontend/components/launches/helpers/platform-icon.helper';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import SafeImage from '@gitroom/react/helpers/safe.image';
import Link from 'next/link';
import { CommentsComponents } from '@gitroom/frontend/components/preview/comments.components';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { VideoOrImage } from '@gitroom/react/helpers/video.or.image';
import { CopyClient } from '@gitroom/frontend/components/preview/copy.client';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { RenderPreviewDateClient } from '@gitroom/frontend/components/preview/render.preview.date.client';

dayjs.extend(utc);
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Robô MultiPost' : 'Gitroom'} Preview`,
  description: '',
};
export default async function Auth(
  props: {
    params: Promise<{
      id: string;
    }>;
    searchParams?: Promise<{
      share?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    id
  } = params;

  const post = await (await internalFetch(`/public/posts/${id}`)).json();
  const t = await getT();
  if (!post.length) {
    return (
      <div className="text-white fixed start-0 top-0 w-full h-full flex justify-center items-center text-[20px]">
        {t('post_not_found', 'Post not found')}
      </div>
    );
  }
  return (
    <div>
      <div className="mx-auto w-full max-w-[1346px] py-3 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="min-w-[55px]">
                <Link
                  href="/"
                  className="text-2xl flex items-center justify-center gap-[10px] text-textColor order-1"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    xmlSpace="preserve"
                    style={{
                      fillRule: 'evenodd',
                      clipRule: 'evenodd',
                      strokeLinejoin: 'round',
                      strokeMiterlimit: 2,
                    }}
                    viewBox="0 0 732 93"
                    height={55}
                  >
                    <use xlinkHref="#preview-logo-a" width="274" height="92" y="1.296" />
                    <use xlinkHref="#preview-logo-b" width="75" height="89" x="270.72" y="2.304" />
                    <use xlinkHref="#preview-logo-c" width="375" height="93" x="357.552" />
                    <defs>
                      <image xlinkHref="data:image/png;base64,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" id="preview-logo-a" width="274" height="92" />
                      <image xlinkHref="data:image/png;base64,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" id="preview-logo-b" width="75" height="89" />
                      <image xlinkHref="data:image/png;base64,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" id="preview-logo-c" width="375" height="93" />
                    </defs>
                  </svg>

                </Link>
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-400 flex items-center gap-[20px]">
            {!!searchParams?.share && (
              <div>
                <CopyClient />
              </div>
            )}
            <div className="flex-1">
              {t('publication_date', 'Publication Date:')}{' '}
              <RenderPreviewDateClient date={post[0].publishDate} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row text-white w-full max-w-[1346px] mx-auto">
        <div className="flex-1">
          <div className="gap-[20px] flex flex-col">
            {post.map((p: any, index: number) => (
              <div
                key={String(p.id)}
                className="relative px-4 py-4 bg-third border border-tableBorder"
              >
                <div className="flex space-x-3">
                  <div>
                    <div className="flex shrink-0 rounded-full h-30 w-30 relative">
                      <div className="w-[50px] h-[50px] z-[20]">
                        <img
                          className="w-full h-full relative z-[20] bg-black aspect-square rounded-full border-tableBorder"
                          alt={post[0].integration.name}
                          src={post[0].integration.picture}
                        />
                      </div>
                      <div className="absolute -end-[5px] -bottom-[5px] w-[30px] h-[30px] z-[20]">
                        <img
                          className="w-full h-full bg-black aspect-square rounded-full border-tableBorder"
                          alt={post[0].integration.providerIdentifier}
                          src={getPlatformIconPath(post[0].integration.providerIdentifier)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center space-x-2">
                      <h2 className="text-sm font-semibold">
                        {post[0].integration.name}
                      </h2>
                      <span className="text-sm text-gray-500">
                        @{post[0].integration.profile}
                      </span>
                    </div>
                    <div className="flex flex-col gap-[20px]">
                      <div
                        className="text-sm whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{
                          __html: p.content,
                        }}
                      />
                      <div className="flex w-full gap-[10px]">
                        {JSON.parse(p?.image || '[]').map((p: any) => (
                          <div
                            key={p.name}
                            className="flex-1 rounded-[10px] max-h-[500px] overflow-hidden"
                          >
                            <VideoOrImage
                              isContain={true}
                              src={p.path}
                              autoplay={true}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-full lg:w-96 lg:flex-shrink-0">
          <div className="p-4 pt-0">
            <CommentsComponents postId={id} />
          </div>
        </div>
      </div>
    </div>
  );
}
