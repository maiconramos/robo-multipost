'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  useProfilesList,
  ProfileListItem,
} from '@gitroom/frontend/components/settings/profile-persona.hooks';
import {
  useKnowledgeDocuments,
  KnowledgeDocument,
} from '@gitroom/frontend/components/settings/knowledge-base.hooks';

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const StatusBadge: React.FC<{ doc: KnowledgeDocument; t: (k: string, f: string) => string }> = ({
  doc,
  t,
}) => {
  if (doc.status === 'READY') {
    return (
      <span className="text-customColor42">
        {t('kb_ready', 'Ready')} ({doc.chunkCount})
      </span>
    );
  }
  if (doc.status === 'PROCESSING') {
    return <span className="text-customColor18">{t('kb_processing', 'Processing...')}</span>;
  }
  return (
    <span className="text-customColor19" title={doc.errorMessage || ''}>
      {t('kb_failed', 'Failed')}
    </span>
  );
};

export const KnowledgeBaseSettingsSection: React.FC = () => {
  const t = useT();
  const toaster = useToaster();
  const fetchRaw = useFetch();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: profiles } = useProfilesList();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!selectedProfileId && profiles && profiles.length > 0) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  const { data, mutate, isLoading } = useKnowledgeDocuments(selectedProfileId);

  const handleUpload = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const file = ev.target.files?.[0];
      if (!file || !selectedProfileId) return;
      setUploading(true);
      try {
        const body = new FormData();
        body.append('file', file);
        const res = await fetchRaw(
          `/settings/profiles/${selectedProfileId}/knowledge/upload`,
          { method: 'POST', body }
        );
        if (res.ok) {
          toaster.show(t('kb_uploaded', 'Upload started'), 'success');
          await mutate();
        } else {
          const err = await res.json().catch(() => ({}));
          toaster.show(err.message || t('kb_upload_error', 'Upload failed'), 'warning');
        }
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [selectedProfileId, fetchRaw, mutate, toaster, t]
  );

  const handleDelete = useCallback(
    async (documentId: string) => {
      if (!selectedProfileId) return;
      const res = await fetchRaw(
        `/settings/profiles/${selectedProfileId}/knowledge/${documentId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        toaster.show(t('kb_deleted', 'Document deleted'), 'success');
        await mutate();
      }
    },
    [selectedProfileId, fetchRaw, mutate, toaster, t]
  );

  const enabled = data?.enabled !== false;

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('kb_title', 'Knowledge Base')}</h3>
      <div className="text-customColor18 mt-[4px] text-[13px]">
        {t(
          'kb_description',
          'Upload briefings, catalogs, and other documents. The AI agent can cite facts from them when generating posts.'
        )}
      </div>

      {!enabled && (
        <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[16px] text-customColor18 text-[13px]">
          {t(
            'kb_disabled_banner',
            'Knowledge Base is disabled. Requires pgvector extension and ENABLE_KNOWLEDGE_BASE=true.'
          )}
        </div>
      )}

      {enabled && (
        <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[20px] flex flex-col gap-[14px]">
          <div className="flex flex-col gap-[6px]">
            <label className="text-[13px] text-textColor">
              {t('persona_select_profile', 'Profile')}
            </label>
            <select
              className="h-[36px] bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[8px] outline-none max-w-[380px]"
              value={selectedProfileId ?? ''}
              onChange={(e) => setSelectedProfileId(e.target.value || null)}
            >
              {(profiles || []).map((p: ProfileListItem) => (
                <option key={p.id} value={p.id}>
                  {p.isDefault ? `${p.name} (default)` : p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-[8px]">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              loading={uploading}
            >
              {t('kb_upload', 'Upload document')}
            </Button>
            <span className="text-customColor18 text-[12px]">
              {t('kb_upload_hint', 'PDF, TXT or MD, max 10MB')}
            </span>
          </div>

          <div className="overflow-hidden border border-newTableBorder rounded-[6px]">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-newTableHeader text-customColor18 text-left">
                  <th className="px-[12px] py-[10px] font-medium">
                    {t('kb_filename', 'File')}
                  </th>
                  <th className="px-[12px] py-[10px] font-medium">
                    {t('kb_size', 'Size')}
                  </th>
                  <th className="px-[12px] py-[10px] font-medium">
                    {t('kb_status', 'Status')}
                  </th>
                  <th className="px-[12px] py-[10px] font-medium">
                    {t('ai_credits_actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={4} className="px-[12px] py-[16px] text-center text-customColor18">
                      {t('persona_loading', 'Loading...')}
                    </td>
                  </tr>
                )}
                {!isLoading && (data?.documents?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={4} className="px-[12px] py-[16px] text-center text-customColor18">
                      {t('kb_empty', 'No documents uploaded yet')}
                    </td>
                  </tr>
                )}
                {(data?.documents || []).map((doc) => (
                  <tr key={doc.id} className="border-t border-tableBorder">
                    <td className="px-[12px] py-[10px]">{doc.filename}</td>
                    <td className="px-[12px] py-[10px]">{formatSize(doc.sizeBytes)}</td>
                    <td className="px-[12px] py-[10px]">
                      <StatusBadge doc={doc} t={t} />
                    </td>
                    <td className="px-[12px] py-[10px]">
                      <Button onClick={() => handleDelete(doc.id)} secondary>
                        {t('kb_delete', 'Delete')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseSettingsSection;
