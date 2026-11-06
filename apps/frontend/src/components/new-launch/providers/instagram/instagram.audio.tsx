'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  safeAudioPreviewUrl,
  safeInstagramAudioPreviewUrl,
} from '@gitroom/helpers/utils/instagram-audio-preview';
import type {
  InstagramAudio,
  InstagramAudioSearchResult,
} from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/instagram.dto';

function AudioThumbnail({ image }: { image?: string }) {
  const src = safeAudioPreviewUrl(image);
  const [failedSrc, setFailedSrc] = useState<string>();
  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-newBgColorInner"
    >
      {src && src !== failedSrc ? (
        <img
          src={src}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 opacity-50"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="M9 18V5l12-2v13M9 9l12-2" />
          <ellipse cx="6" cy="18" rx="3" ry="2" />
          <ellipse cx="18" cy="16" rx="3" ry="2" />
        </svg>
      )}
    </span>
  );
}

export function InstagramAudioSelector({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const t = useT();
  const { watch, setValue } = useSettings();
  const selected = watch('audio') as InstagramAudio | undefined;
  const { get } = useCustomProviderFunction();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('music');
  const [results, setResults] = useState<InstagramAudioSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState('');
  const [previewError, setPreviewError] = useState('');
  const player = useRef<HTMLAudioElement | null>(null);
  const stop = useCallback(() => {
    const sound = player.current;
    player.current = null;
    if (sound) {
      sound.onended = null;
      sound.onerror = null;
      sound.pause();
    }
    setPlaying('');
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (disabled) {
      stop();
      setOpen(false);
    }
  }, [disabled, stop]);
  useEffect(() => {
    stop();
    setPreviewError('');
    if (!open || disabled) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      get('audioSearch', { q: query, type: kind })
        .then((list) => {
          if (cancelled) return;
          if (!Array.isArray(list)) throw new Error();
          setResults(list);
        })
        .catch(() => {
          if (!cancelled) {
            setError(true);
            setResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, disabled, query, kind, get, stop]);
  const save = (value: InstagramAudio | undefined) =>
    setValue('audio', value, { shouldDirty: true, shouldValidate: true });
  const preview = async (audio: InstagramAudioSearchResult) => {
    if (playing === audio.id) {
      stop();
      return;
    }
    stop();
    setPreviewError('');
    const url = safeAudioPreviewUrl(audio.previewUrl);
    if (!url) return;
    const sound = new Audio(url);
    player.current = sound;
    const fail = () => {
      if (player.current !== sound) return;
      stop();
      setPreviewError(audio.id);
    };
    sound.onended = () => {
      if (player.current === sound) stop();
    };
    sound.onerror = fail;
    setPlaying(audio.id);
    try {
      await sound.play();
      // A play promise can settle after close, a new query or another preview.
      if (player.current !== sound) sound.pause();
    } catch {
      fail();
    }
  };
  return (
    <section className="mt-4 flex min-w-0 flex-col gap-3">
      <div>{t('instagram_reel_audio', 'Reel audio')}</div>
      {disabled && (
        <p className="text-xs opacity-70" role="status">
          {t(
            'instagram_audio_constraints',
            'Available for a single video Reel using Facebook Login. Remove the selected audio for other post types.'
          )}
        </p>
      )}
      {selected?.id && (
        <div className="flex flex-col gap-3 rounded-lg border border-newTableBorder p-3">
          <div className="flex items-center gap-3">
            <AudioThumbnail image={selected.image} />
            <div className="min-w-0 flex-1 break-words">
              {selected.title || selected.id}
              <div className="text-xs opacity-70">{selected.artist}</div>
            </div>
            <button
              type="button"
              className="underline"
              onClick={() => {
                stop();
                save(undefined);
              }}
            >
              {t('instagram_remove_audio', 'Remove audio')}
            </button>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            {t('instagram_audio_volume', 'Audio volume')} (
            {selected.audio_volume ?? 100})
            <input
              aria-label={t('instagram_audio_volume', 'Audio volume')}
              disabled={disabled}
              type="range"
              min={0}
              max={100}
              value={selected.audio_volume ?? 100}
              onChange={(e) =>
                save({ ...selected, audio_volume: Number(e.target.value) })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t('instagram_video_volume', 'Original video volume')} (
            {selected.video_volume ?? 100})
            <input
              aria-label={t('instagram_video_volume', 'Original video volume')}
              disabled={disabled}
              type="range"
              min={0}
              max={100}
              value={selected.video_volume ?? 100}
              onChange={(e) =>
                save({ ...selected, video_volume: Number(e.target.value) })
              }
            />
          </label>
        </div>
      )}
      {!disabled && (
        <button
          type="button"
          className="self-start rounded-lg border border-newTableBorder px-4 py-2"
          onClick={() => {
            stop();
            setOpen(!open);
          }}
        >
          {open
            ? t('cancel', 'Cancel')
            : selected?.id
            ? t('instagram_change_audio', 'Change audio')
            : t('instagram_add_audio', 'Add audio')}
        </button>
      )}
      {open && !disabled && (
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-xs">
            {t('instagram_audio_type', 'Audio type')}
            <select
              className="ml-2 rounded border border-newTableBorder bg-newBgColorInner p-2"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="music">{t('instagram_music', 'Music')}</option>
              <option value="original_sound">
                {t('instagram_original_sound', 'Original sound')}
              </option>
            </select>
          </label>
          <input
            className="w-full min-w-0 rounded-lg border border-newTableBorder bg-newBgColorInner p-3"
            aria-label={t(
              'instagram_search_audio',
              'Search audio (empty shows trending)'
            )}
            placeholder={t(
              'instagram_search_audio',
              'Search audio (empty shows trending)'
            )}
            maxLength={200}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading ? (
            <p role="status">{t('loading', 'Loading...')}</p>
          ) : error ? (
            <p role="alert" className="text-sm">
              {t(
                'instagram_audio_search_error',
                'Could not load audio. Reconnect using Facebook Login and check audio permissions.'
              )}
            </p>
          ) : !results.length ? (
            <p>{t('instagram_no_audio_found', 'No audio found')}</p>
          ) : (
            <ul className="max-h-60 overflow-y-auto rounded-lg border border-newTableBorder">
              {results.map((audio) => (
                <li
                  key={audio.id}
                  className="flex flex-wrap items-center gap-2 border-b border-newTableBorder p-2"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => {
                      stop();
                      save({
                        id: audio.id,
                        title: audio.title,
                        artist: audio.artist,
                        image: safeAudioPreviewUrl(audio.image),
                        audio_volume: 100,
                        video_volume: 100,
                      });
                      setOpen(false);
                    }}
                  >
                    <AudioThumbnail image={audio.image} />
                    <span className="min-w-0">
                      <span className="block break-words">
                        {audio.title || audio.id}
                      </span>
                      <span className="text-xs opacity-70">{audio.artist}</span>
                    </span>
                  </button>
                  {safeAudioPreviewUrl(audio.previewUrl) && (
                    <button type="button" onClick={() => preview(audio)}>
                      {playing === audio.id
                        ? t('stop', 'Stop')
                        : t('play', 'Play')}
                    </button>
                  )}
                  {(!safeAudioPreviewUrl(audio.previewUrl) ||
                    previewError === audio.id) &&
                    (safeInstagramAudioPreviewUrl(audio.platformPreviewUrl) ? (
                      <a
                        href={safeInstagramAudioPreviewUrl(
                          audio.platformPreviewUrl
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm underline"
                        onClick={stop}
                      >
                        {t(
                          'instagram_audio_listen_on_instagram',
                          'Listen on Instagram'
                        )}
                      </a>
                    ) : !safeAudioPreviewUrl(audio.previewUrl) ? (
                      <span className="text-xs opacity-70">
                        {t(
                          'instagram_audio_preview_unavailable',
                          'Preview unavailable'
                        )}
                      </span>
                    ) : null)}
                  {previewError === audio.id && (
                    <p role="alert" className="w-full text-xs">
                      {t(
                        'instagram_audio_preview_error',
                        'Could not play this preview. Try again or use the Instagram link when available.'
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
