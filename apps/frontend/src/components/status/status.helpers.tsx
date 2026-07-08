'use client';

import { FC, ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PlatformIconBadge } from '@gitroom/frontend/components/launches/helpers/platform-icon.helper';
import { StatusProfileRef } from '@gitroom/nestjs-libraries/dtos/status/status.dto';

/**
 * Helpers compartilhados entre as abas do Status (Problemas e Histórico).
 * Extraídos da Fase 1 para evitar duplicação — mesma linguagem visual.
 */

// Link opcional para o Temporal Web UI (depuração). Sem a env, o link não
// aparece. Busca pelo search attribute `postId` (indexado) — robusto ao sufixo
// aleatório do workflowId.
const TEMPORAL_WEB_URL = process.env.NEXT_PUBLIC_TEMPORAL_WEB_URL;
const TEMPORAL_NAMESPACE =
  process.env.NEXT_PUBLIC_TEMPORAL_NAMESPACE || 'default';

export const temporalPostUrl = (postId: string): string | null =>
  TEMPORAL_WEB_URL
    ? `${TEMPORAL_WEB_URL.replace(/\/$/, '')}/namespaces/${TEMPORAL_NAMESPACE}/workflows?query=${encodeURIComponent(
        `postId="${postId}"`
      )}`
    : null;

// Avatar do canal com o badge da plataforma sobreposto (canto inferior direito)
// — deixa claro de qual rede é o canal. `identifier` ausente (canal removido) =>
// sem badge.
export const ChannelAvatar: FC<{
  picture: string | null;
  name: string;
  identifier?: string | null;
}> = ({ picture, name, identifier }) => (
  <div className="relative flex-none w-[28px] h-[28px]">
    {picture ? (
      <img
        src={picture}
        alt={name}
        className="w-[28px] h-[28px] rounded-full object-cover"
      />
    ) : (
      <div className="w-[28px] h-[28px] rounded-full bg-newBgColorInner" />
    )}
    {identifier && (
      <span className="absolute -bottom-[3px] -end-[3px] rounded-full bg-sixth p-[1px] flex">
        <PlatformIconBadge identifier={identifier} size={14} />
      </span>
    )}
  </div>
);

// Chip do perfil de origem — `null` => "Workspace" (canal/evento compartilhado).
export const ProfileChip: FC<{ profile: StatusProfileRef | null }> = ({
  profile,
}) => {
  const t = useT();
  return (
    <span className="text-[11px] px-[8px] py-[2px] rounded-[6px] bg-newBgColorInner text-customColor18 whitespace-nowrap flex-none">
      {profile?.name ?? t('status_profile_workspace', 'Workspace')}
    </span>
  );
};

export const DebugLink: FC<{ href: string; children: ReactNode }> = ({
  href,
  children,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="text-[12px] text-btnPrimary hover:underline whitespace-nowrap"
  >
    {children}
  </a>
);
