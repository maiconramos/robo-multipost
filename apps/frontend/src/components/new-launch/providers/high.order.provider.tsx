'use client';

import React, {
  FC,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
} from 'react';
import {
  useForm,
  useWatch,
  FormProvider,
  DefaultValues,
} from 'react-hook-form';
import { IsOptional } from 'class-validator';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { GeneralPreviewComponent } from '@gitroom/frontend/components/launches/general.preview.component';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { InternalChannels } from '@gitroom/frontend/components/launches/internal.channels';
import { createPortal } from 'react-dom';
import { useMediaSettingsValues } from '@gitroom/frontend/components/new-launch/media.settings.values';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { getPlatformIconPath } from '@gitroom/frontend/components/launches/helpers/platform-icon.helper';

class Empty {
  @IsOptional()
  empty: string;
}

export enum PostComment {
  ALL,
  POST,
  COMMENT,
}

interface CharacterCondition {
  format: 'no-pictures' | 'with-pictures';
  type: 'post' | 'comment';
  maximumCharacters: number;
}

export const withProvider = function <T extends object>(params: {
  comments?:
    | boolean
    | 'no-media'
    | ((settings: T, identifier: string) => boolean | 'no-media');
  postComment: PostComment;
  minimumCharacters: CharacterCondition[];
  SettingsComponent: FC<{
    values?: any;
  }> | null;
  CustomPreviewComponent?: FC<{
    maximumCharacters?: number;
  }>;
  dto?: any;
  // Valores padrao das settings do provider. Precisam ficar aqui (e nao em
  // `register(name, { value })`) porque a prop `values` do useForm sobrescreve
  // todo campo montado que nao esteja no objeto — ver o merge no useForm abaixo.
  defaults?: DefaultValues<T>;
  checkValidity?: (
    value: Array<
      Array<{
        path: string;
        thumbnail?: string;
      }>
    >,
    settings: T,
    additionalSettings: any,
    t?: (key: string, defaultValue: string) => string,
    // identificador do canal (ex.: 'tiktok' vs 'zernio-tiktok'): componentes
    // compartilhados com os canais Zernio usam para limitar checagens nativas
    identifier?: string,
    contents?: string[]
  ) => Promise<string | true>;
  maximumCharacters?:
    | number
    | ((additionalSettings: any, values?: any) => number);
  inlineImages?: boolean | ((values: any, identifier?: string) => boolean);
}) {
  const {
    postComment,
    SettingsComponent,
    CustomPreviewComponent,
    dto,
    defaults,
    checkValidity,
    maximumCharacters,
  } = params;

  const Wrapped = forwardRef((props: { id: string }, ref) => {
    const t = useT();
    const fetch = useFetch();
    const {
      current,
      selectedIntegration,
      setCurrent,
      internal,
      global,
      date,
      isGlobal,
      tab,
      setTotalChars,
      justCurrent,
      allIntegrations,
      setPostComment,
      setEditor,
      setInlineImages,
      dummy,
      setChars,
      setComments,
      setHide,
    } = useLaunchStore(
      useShallow((state) => ({
        // canal com data propria (lote de um post existente)
        date: state.channelDates[props.id] || state.date,
        tab: state.tab,
        global: state.global,
        dummy: state.dummy,
        internal: state.internal.find((p) => p.integration.id === props.id),
        integrations: state.selectedIntegrations,
        setHide: state.setHide,
        allIntegrations: state.integrations,
        justCurrent: state.current,
        current: state.current === props.id,
        isGlobal: state.current === 'global',
        setCurrent: state.setCurrent,
        setComments: state.setComments,
        setTotalChars: state.setTotalChars,
        setPostComment: state.setPostComment,
        setEditor: state.setEditor,
        setInlineImages: state.setInlineImages,
        setChars: state.setChars,
        selectedIntegration: state.selectedIntegrations.find(
          (p) => p.integration.id === props.id
        ),
      }))
    );

    // com midia, o painel de miniaturas mantem as configuracoes visiveis
    // mesmo sem configuracao do canal (upstream #2285)
    const hasMediaSettings = useMediaSettingsValues().some(
      (p) => p.media?.length
    );

    const getInternalPlugs = useCallback(async () => {
      return (
        await fetch(
          `/integrations/${selectedIntegration.integration.identifier}/internal-plugs`
        )
      ).json();
    }, [selectedIntegration.integration.identifier]);
    const { data, isLoading } = useSWR(
      `internal-${selectedIntegration.integration.identifier}`,
      getInternalPlugs,
      {
        revalidateOnReconnect: true,
      }
    );

    const value = useMemo(() => {
      if (internal?.integrationValue?.length) {
        return internal.integrationValue;
      }

      return global;
    }, [internal, global, isGlobal]);

    const form = useForm({
      resolver: classValidatorResolver(dto || Empty),
      // `defaultValues` cobre o post novo; o merge cobre editar/duplicar/set.
      // As settings salvas sao espalhadas por ultimo e sempre vencem o default,
      // entao nenhum post existente e reescrito — o default so preenche buraco
      // (ex.: post Facebook salvo antes de `post_type` existir).
      defaultValues: defaults,
      ...(Object.keys(selectedIntegration.settings).length > 0
        ? { values: { ...defaults, ...selectedIntegration.settings } }
        : {}),
      mode: 'all',
      criteriaMode: 'all',
      reValidateMode: 'onChange',
    });

    // Settings control inline pictures and reactive character limits (X Articles).
    const values = useWatch({
      control: form.control,
      disabled:
        typeof params.inlineImages !== 'function' &&
        typeof maximumCharacters !== 'function' &&
        typeof params.comments !== 'function',
    });
    const comments =
      typeof params.comments === 'function'
        ? params.comments(values, selectedIntegration.integration.identifier)
        : params.comments ?? true;
    const characterLimit =
      typeof maximumCharacters === 'number'
        ? maximumCharacters
        : maximumCharacters?.(
            JSON.parse(
              selectedIntegration.integration.additionalSettings || '[]'
            ),
            values
          ) || 1000000;
    useEffect(() => {
      if (!setTotalChars) {
        return;
      }

      setChars(props.id, characterLimit);

      if (isGlobal) {
        setComments(true);
        setPostComment(PostComment.ALL);
        setTotalChars(0);
        setEditor('normal');
        setInlineImages(false);
      }

      if (current) {
        setComments(comments);
        setEditor(selectedIntegration?.integration.editor);
        setPostComment(postComment);
        setTotalChars(characterLimit);
      }
    }, [
      justCurrent,
      current,
      isGlobal,
      setTotalChars,
      characterLimit,
      comments,
    ]);

    const inlineImages =
      typeof params.inlineImages === 'function'
        ? params.inlineImages(
            values,
            selectedIntegration.integration.identifier
          )
        : !!params.inlineImages;
    useEffect(() => {
      if (current) {
        setInlineImages(inlineImages);
      }
    }, [current, inlineImages]);

    useImperativeHandle(
      ref,
      () => ({
        isValid: async () => {
          const settings = form.getValues();
          return {
            id: props.id,
            identifier: selectedIntegration.integration.identifier,
            integration: selectedIntegration.integration,
            valid: await form.trigger(),
            err: form.formState.errors,
            errors: checkValidity
              ? await checkValidity(
                  value.map((p) => p.media || []),
                  settings,
                  JSON.parse(
                    selectedIntegration.integration.additionalSettings || '[]'
                  ),
                  t,
                  selectedIntegration.integration.identifier,
                  value.map((p) => p.content)
                )
              : true,
            settings,
            values: value,
            maximumCharacters: characterLimit,
            fix: () => {
              setCurrent(props.id);
              setHide(true);
            },
            preview: () => {
              setCurrent(props.id);
              setHide(true);
            },
          };
        },
        getValues: () => {
          return {
            id: props.id,
            identifier: selectedIntegration.integration.identifier,
            values: value,
            settings: form.getValues(),
          };
        },
        trigger: () => {
          return form.trigger();
        },
      }),
      [value, characterLimit]
    );

    return (
      <IntegrationContext.Provider
        value={{
          date,
          integration: selectedIntegration.integration,
          allIntegrations,
          value: value.map((p) => ({
            id: p.id,
            content: p.content,
            image: p.media,
          })),
        }}
      >
        <FormProvider {...form}>
          <div
            className={clsx(
              'border border-borderPreview rounded-[12px] shadow-previewShadow',
              !current && 'hidden'
            )}
          >
            {current &&
              (tab === 0 ||
                (!SettingsComponent && !data?.internalPlugs?.length)) &&
              !value?.[0]?.content?.length && (
                <div>
                  {t(
                    'start_writing_your_post',
                    'Start writing your post for a preview'
                  )}
                </div>
              )}
            {current &&
              (tab === 0 ||
                (!SettingsComponent && !data?.internalPlugs?.length)) &&
              !!value?.[0]?.content?.length &&
              (CustomPreviewComponent ? (
                <CustomPreviewComponent maximumCharacters={characterLimit} />
              ) : (
                <GeneralPreviewComponent maximumCharacters={characterLimit} />
              ))}
            {(SettingsComponent || !!data?.internalPlugs?.length) &&
              createPortal(
                <div
                  data-id={props.id}
                  className={
                    isGlobal
                      ? 'bg-newSettings pb-[12px] px-[12px]'
                      : 'hidden bg-newSettings px-[12px] pb-[12px]'
                  }
                >
                  {isGlobal && (
                    <style>{`#wrapper-settings {display: flex !important} #social-empty {display: block !important;}`}</style>
                  )}
                  {isGlobal && (
                    <div className="flex py-[20px] items-center gap-[15px]">
                      <div className="relative">
                        <SafeImage
                          alt={selectedIntegration?.integration.name!}
                          width={42}
                          height={42}
                          className="min-w-[42px] min-h-[42px] w-[42px] h-[42px] rounded-full"
                          src={selectedIntegration?.integration.picture}
                        />
                        <SafeImage
                          alt={selectedIntegration?.integration.identifier}
                          width={16}
                          height={16}
                          className="rounded-[16px] min-w-[16px] min-h-[16px] w-[16px] h-[16px] absolute bottom-0 end-0"
                          src={getPlatformIconPath(
                            selectedIntegration?.integration.identifier || ''
                          )}
                        />
                      </div>
                      <div className="text-[20px]">
                        {selectedIntegration?.integration.name}
                      </div>
                    </div>
                  )}
                  <SettingsComponent />
                  {!!data?.internalPlugs?.length && !dummy && (
                    <InternalChannels plugs={data?.internalPlugs} />
                  )}
                </div>,
                document.querySelector('#social-settings') ||
                  document.createElement('div')
              )}
            {current &&
              !SettingsComponent &&
              !hasMediaSettings &&
              createPortal(
                <style>{`#wrapper-settings {display: none !important;} #social-empty {display: block !important;}`}</style>,
                document.querySelector('#social-settings') ||
                  document.createElement('div')
              )}
          </div>
        </FormProvider>
      </IntegrationContext.Provider>
    );
  });
  (Wrapped as any).__settings = { SettingsComponent };
  return Wrapped;
};

export const getProviderSettingsMeta = (component: unknown) =>
  (component as any)?.__settings as
    | { SettingsComponent: FC<{ values?: any }> | null }
    | undefined;
