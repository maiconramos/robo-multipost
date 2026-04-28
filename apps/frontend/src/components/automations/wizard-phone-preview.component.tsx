'use client';

import { FC, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface PhonePreviewProps {
  variant?: 'comment' | 'story';
  postThumb?: string;
  postCaption?: string;
  replyMessage?: string;
  dmMessage?: string;
  dmButtonText?: string;
  dmButtonUrl?: string;
  storyThumb?: string;
  storyMode?: 'all' | 'specific' | 'next_publication';
  commenterName?: string;
  integrationPicture?: string;
  integrationName?: string;
  activeTab?: 'post' | 'comments' | 'dm' | 'story';
  onTabChange?: (tab: 'post' | 'comments' | 'dm' | 'story') => void;
}

type Tab = 'post' | 'comments' | 'dm' | 'story';

export const WizardPhonePreview: FC<PhonePreviewProps> = ({
  variant = 'comment',
  postThumb,
  postCaption,
  replyMessage,
  dmMessage,
  dmButtonText,
  dmButtonUrl,
  storyThumb,
  storyMode = 'all',
  commenterName = 'usuario',
  integrationPicture,
  integrationName,
  activeTab,
  onTabChange,
}) => {
  const t = useT();
  const defaultTab: Tab = variant === 'story' ? 'story' : 'comments';
  const [internalTab, setInternalTab] = useState<Tab>(defaultTab);
  const tab = activeTab ?? internalTab;
  const setTab = (next: Tab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

  const tabs: { key: Tab; label: string }[] =
    variant === 'story'
      ? [
          { key: 'story', label: t('preview_tab_story', 'Story') },
          { key: 'dm', label: t('preview_tab_dm', 'DM') },
        ]
      : [
          { key: 'post', label: t('preview_tab_post', 'Publicar') },
          { key: 'comments', label: t('preview_tab_comments', 'Comentarios') },
          { key: 'dm', label: t('preview_tab_dm', 'DM') },
        ];

  return (
    <div className="flex flex-col items-center select-none">
      {/* Phone frame */}
      <div
        className="relative flex flex-col rounded-[44px] overflow-hidden"
        style={{
          width: 290,
          height: 580,
          background: '#0a0a0a',
          border: '3px solid #2a2a2a',
          boxShadow: '0 0 0 1px #111, 0 24px 48px rgba(0,0,0,0.6)',
        }}
      >
        {/* Status bar + notch area */}
        <div
          className="relative flex-shrink-0 flex items-center justify-between px-[20px]"
          style={{ height: 44, paddingTop: 10 }}
        >
          {/* Time */}
          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>6:07</span>

          {/* Dynamic island / notch */}
          <div
            className="absolute left-1/2 -translate-x-1/2 top-[10px] rounded-full"
            style={{ width: 100, height: 26, background: '#000', zIndex: 10 }}
          />

          {/* Signal icons */}
          <div className="flex items-center gap-[5px]">
            {/* Signal bars */}
            <svg width="16" height="11" viewBox="0 0 16 11" fill="white">
              <rect x="0" y="8" width="3" height="3" rx="0.5" />
              <rect x="4" y="5.5" width="3" height="5.5" rx="0.5" />
              <rect x="8" y="3" width="3" height="8" rx="0.5" />
              <rect x="12" y="0" width="3" height="11" rx="0.5" />
            </svg>
            {/* WiFi */}
            <svg width="14" height="11" viewBox="0 0 14 11" fill="white">
              <path d="M7 8.5a1 1 0 110 2 1 1 0 010-2z" />
              <path d="M3.5 6C4.8 4.7 6.3 4 7 4s2.2.7 3.5 2" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              <path d="M1 3.5C3 1.3 5 0 7 0s4 1.3 6 3.5" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            </svg>
            {/* Battery */}
            <div className="relative flex items-center" style={{ width: 24, height: 12 }}>
              <div style={{ width: 21, height: 11, border: '1px solid rgba(255,255,255,0.5)', borderRadius: 3, padding: 1.5 }}>
                <div style={{ width: '80%', height: '100%', background: '#fff', borderRadius: 1.5 }} />
              </div>
              <div style={{ width: 2, height: 5, background: 'rgba(255,255,255,0.4)', borderRadius: '0 1px 1px 0', marginLeft: 1 }} />
            </div>
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── STORY TAB ── */}
          {tab === 'story' && (
            <div
              className="flex-1 flex flex-col"
              style={{
                background: storyThumb
                  ? `url(${storyThumb}) center/cover no-repeat`
                  : '#1a1a1a',
                position: 'relative',
              }}
            >
              {/* Progress bar */}
              <div className="flex gap-[4px] px-[12px] pt-[8px]">
                <div style={{ flex: 1, height: 2, background: '#fff', borderRadius: 1 }} />
                <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.3)', borderRadius: 1 }} />
                <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.3)', borderRadius: 1 }} />
              </div>

              {/* Story header */}
              <div className="flex items-center justify-between px-[12px] py-[10px]">
                <div className="flex items-center gap-[8px]">
                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', padding: 2 }}>
                    {integrationPicture ? (
                      <img src={integrationPicture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#222' }} />
                    )}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
                    {integrationName || commenterName}
                  </span>
                </div>
                <span style={{ color: '#fff', fontSize: 18, lineHeight: 1 }}>×</span>
              </div>

              {/* Body placeholder when no thumb */}
              {!storyThumb && (
                <div className="flex-1 flex items-center justify-center px-[20px] text-center">
                  <p style={{ fontSize: 12, color: '#fff' }}>
                    {storyMode === 'specific'
                      ? t(
                          'story_preview_specific_hint',
                          'Sua automacao sera aplicada ao story selecionado'
                        )
                      : storyMode === 'next_publication'
                      ? t(
                          'story_preview_next_hint',
                          'Sua automacao sera aplicada ao proximo story publicado'
                        )
                      : t(
                          'story_preview_all_hint',
                          'Sua automacao funcionara em qualquer story'
                        )}
                  </p>
                </div>
              )}

              {/* Reply input */}
              <div className="px-[12px] pb-[14px] mt-auto">
                <div className="flex items-center gap-[8px]">
                  <div
                    style={{
                      flex: 1,
                      borderRadius: 24,
                      border: '1px solid rgba(255,255,255,0.6)',
                      background: 'rgba(0,0,0,0.2)',
                      padding: '8px 14px',
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
                      {t('preview_story_reply_placeholder', 'Enviar mensagem...')}
                    </span>
                  </div>
                  <span style={{ fontSize: 18 }}>❤️</span>
                  <span style={{ fontSize: 18 }}>✈️</span>
                </div>
              </div>
            </div>
          )}

          {/* ── POST TAB ── */}
          {tab === 'post' && (
            <div className="flex-1 overflow-y-auto" style={{ background: '#0a0a0a' }}>
              {/* Instagram post header */}
              <div className="flex items-center justify-between px-[12px] py-[8px]">
                <div className="flex items-center gap-[8px]">
                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', padding: 2 }}>
                    {integrationPicture ? (
                      <img src={integrationPicture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#222' }} />
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>
                    {integrationName || commenterName}
                  </span>
                </div>
                <span style={{ color: '#fff', fontSize: 18, lineHeight: 1 }}>···</span>
              </div>

              {/* Post image */}
              {postThumb ? (
                <img src={postThumb} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', aspectRatio: '1/1', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 11, color: '#666' }}>
                    {t('preview_no_post', 'Selecione um post')}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between px-[12px] py-[8px]">
                <div className="flex items-center gap-[12px]">
                  {/* Heart */}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" /></svg>
                  {/* Comment */}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  {/* Share */}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                </div>
                {/* Bookmark */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
              </div>

              {/* Caption */}
              <div className="px-[12px] pb-[12px]">
                <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{integrationName || commenterName} </span>
                <span style={{ fontSize: 11, color: '#ccc' }}>
                  {postCaption || t('preview_no_caption', 'Nenhuma legenda')}
                </span>
              </div>
            </div>
          )}

          {/* ── COMMENTS TAB ── */}
          {tab === 'comments' && (
            <div className="flex flex-col" style={{ flex: 1, background: '#0a0a0a', overflow: 'hidden' }}>
              {/* Post thumbnail mini */}
              {postThumb && (
                <img src={postThumb} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block', flexShrink: 0 }} />
              )}

              {/* Comment drawer */}
              <div
                className="flex flex-col flex-1"
                style={{ background: '#111', borderRadius: '20px 20px 0 0', marginTop: postThumb ? -12 : 0, overflow: 'hidden' }}
              >
                {/* Drawer handle */}
                <div className="flex items-center justify-between px-[14px] pt-[14px] pb-[10px] flex-shrink-0">
                  <div style={{ width: 36, height: 4, background: '#333', borderRadius: 2, margin: '0 auto', marginBottom: 10 }} />
                </div>
                <div className="flex items-center justify-between px-[14px] pb-[10px] flex-shrink-0">
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                    {t('preview_tab_comments', 'Comentarios')}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                </div>

                {/* Comments list */}
                <div className="flex-1 overflow-y-auto px-[14px] pb-[8px] space-y-[12px]">
                  {/* User comment */}
                  <div className="flex gap-[8px]">
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#333', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 10, color: '#aaa' }}>
                        {commenterName} · {t('preview_comment_now', 'Agora')}
                      </div>
                      <div style={{ fontSize: 11, color: '#fff', marginTop: 2 }}>
                        {t('preview_user_comment', 'Incrivel! Eu quero!')}
                      </div>
                      <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                        {t('preview_reply_action', 'Responder')}
                      </div>

                      {/* Auto reply */}
                      {replyMessage && (
                        <div className="flex gap-[6px] mt-[8px]">
                          <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: integrationPicture ? 'transparent' : '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {integrationPicture ? (
                              <img src={integrationPicture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" /></svg>
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: '#aaa' }}>
                              {integrationName || t('preview_your_page', 'Sua Página')} · {t('preview_comment_now', 'Agora')}
                            </div>
                            <div style={{ fontSize: 11, color: '#fff', marginTop: 2, whiteSpace: 'pre-wrap' }}>
                              {interpolatePreview(replyMessage, commenterName)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Emoji row */}
                <div className="flex items-center gap-[8px] px-[14px] py-[8px] flex-shrink-0" style={{ borderTop: '1px solid #222' }}>
                  {['❤️','🙌','🔥','👏','😍','🥲','😮','😂'].map((e) => (
                    <span key={e} style={{ fontSize: 16 }}>{e}</span>
                  ))}
                </div>

                {/* Comment input */}
                <div className="flex items-center gap-[8px] px-[14px] py-[10px] flex-shrink-0" style={{ borderTop: '1px solid #222' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#333', flexShrink: 0 }} />
                  <div style={{ flex: 1, background: '#222', borderRadius: 18, padding: '7px 12px' }}>
                    <span style={{ fontSize: 10, color: '#666' }}>
                      {t('preview_comment_placeholder', 'Insira um comentario para o nome de usuario...')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── DM TAB ── */}
          {tab === 'dm' && (
            <div className="flex flex-col flex-1" style={{ background: '#0a0a0a', overflow: 'hidden' }}>
              {/* DM header */}
              <div className="flex items-center gap-[8px] px-[12px] py-[10px] flex-shrink-0" style={{ borderBottom: '1px solid #1a1a1a' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: integrationPicture ? 'transparent' : 'linear-gradient(45deg,#6366f1,#8b5cf6)' }}>
                  {integrationPicture && <img src={integrationPicture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{integrationName || commenterName}</div>
                </div>
                <div className="ml-auto flex items-center gap-[12px]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-[12px] py-[12px] flex flex-col gap-[10px]">
                {dmMessage ? (
                  <>
                    {/* Page message (left, dark bubble) */}
                    <div className="flex items-end gap-[6px]">
                      <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: integrationPicture ? 'transparent' : 'linear-gradient(45deg,#6366f1,#8b5cf6)' }}>
                        {integrationPicture && <img src={integrationPicture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </div>
                      <div style={{ background: '#262626', borderRadius: '18px 18px 18px 4px', padding: '8px 12px', maxWidth: '72%' }}>
                        <p style={{ fontSize: 11, color: '#fff', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                          {interpolatePreview(dmMessage, commenterName)}
                        </p>
                        {dmButtonText && dmButtonUrl && (
                          <div
                            style={{
                              marginTop: 8,
                              background: '#3d3d9a',
                              borderRadius: 12,
                              padding: '6px 10px',
                              fontSize: 10,
                              color: '#fff',
                              textAlign: 'center',
                            }}
                          >
                            {dmButtonText}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* User reply (right, purple) */}
                    <div className="flex justify-end">
                      <div style={{ background: '#3d3d9a', borderRadius: '18px 18px 4px 18px', padding: '8px 12px', maxWidth: '72%' }}>
                        <p style={{ fontSize: 11, color: '#fff' }}>
                          {t('preview_user_response', 'Me envie o link')}
                        </p>
                      </div>
                    </div>

                    {/* Follow-up from page */}
                    <div className="flex items-end gap-[6px]">
                      <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: integrationPicture ? 'transparent' : 'linear-gradient(45deg,#6366f1,#8b5cf6)' }}>
                        {integrationPicture && <img src={integrationPicture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </div>
                      <div style={{ background: '#262626', borderRadius: '18px 18px 18px 4px', padding: '8px 12px', maxWidth: '72%' }}>
                        <p style={{ fontSize: 11, color: '#fff' }}>
                          {t('preview_follow_up', 'Escreva uma mensagem')}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p style={{ fontSize: 11, color: '#555' }}>
                      {t('preview_no_dm', 'Nenhuma DM configurada')}
                    </p>
                  </div>
                )}
              </div>

              {/* Input bar */}
              <div className="flex items-center gap-[8px] px-[12px] py-[10px] flex-shrink-0" style={{ borderTop: '1px solid #1a1a1a' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M8 12a4 4 0 118 0" /><line x1="12" y1="16" x2="12" y2="16.01" /></svg>
                <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 20, padding: '7px 12px', border: '1px solid #333' }}>
                  <span style={{ fontSize: 10, color: '#555' }}>
                    {t('preview_message_input', 'Mensagem...')}
                  </span>
                </div>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
              </div>
            </div>
          )}
        </div>

        {/* Bottom tabs (ManyChat style) */}
        <div
          className="flex-shrink-0 flex items-center"
          style={{ background: '#111', borderTop: '1px solid #1e1e1e', padding: '8px 12px 12px' }}
        >
          {tabs.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              style={{
                flex: 1,
                padding: '6px 4px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: tab === tabItem.key ? 600 : 400,
                color: tab === tabItem.key ? '#fff' : '#666',
                background: tab === tabItem.key ? '#2a2a2a' : 'transparent',
                border: tab === tabItem.key ? '1px solid #333' : '1px solid transparent',
                transition: 'all 0.15s',
                cursor: 'pointer',
              }}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

function interpolatePreview(template: string, commenterName: string): string {
  return template
    .replace(/\{commenter_name\}/g, commenterName)
    .replace(/\{comment_text\}/g, 'Incrivel! Eu quero!')
    .replace(/\{media_id\}/g, '12345');
}
