'use client';

import React, { useCallback, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useZernioSettings } from '@gitroom/frontend/hooks/use-zernio-settings.hook';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';

const UsageBar: React.FC<{
  label: string;
  used: number;
  limit: number;
}> = ({ label, used, limit }) => {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isWarning = percentage >= 80 && percentage < 100;
  const isDanger = percentage >= 100;

  let barColor = 'bg-forth';
  if (isWarning) barColor = 'bg-customColor13';
  if (isDanger) barColor = 'bg-customColor19';

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex justify-between text-[13px]">
        <span>{label}</span>
        <span className="text-customColor18">
          {used} / {limit}
        </span>
      </div>
      <div className="h-[6px] rounded-full bg-fifth overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isWarning && (
        <div className="text-[12px] text-customColor13">
          Você está próximo do limite
        </div>
      )}
      {isDanger && (
        <div className="text-[12px] text-customColor19">
          Limite atingido.{' '}
          <a
            href="https://zernio.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:font-bold"
          >
            Atualize em zernio.com
          </a>
        </div>
      )}
    </div>
  );
};

interface ZernioCredentialsCardProps {
  configured: boolean;
  onMutate: () => void;
}

export const ZernioCredentialsCard: React.FC<ZernioCredentialsCardProps> = ({
  configured,
  onMutate,
}) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const decision = useDecisionModal();
  const { data, isLoading, mutate } = useZernioSettings();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleConnect = useCallback(async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/settings/zernio', {
        method: 'POST',
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      if (res.ok) {
        setApiKey('');
        await mutate();
        onMutate();
        toaster.show('Zernio conectado com sucesso', 'success');
      } else {
        toaster.show('Erro ao conectar Zernio. Verifique sua API key.', 'warning');
      }
    } finally {
      setSaving(false);
    }
  }, [apiKey, fetch, mutate, onMutate, toaster]);

  const handleDisconnect = useCallback(async () => {
    const approved = await decision.open({
      title: 'Remover conexão Zernio?',
      description:
        'Isso irá remover sua API key do Zernio. As publicações via Zernio deixarão de funcionar.',
      approveLabel: 'Sim, remover',
      cancelLabel: 'Cancelar',
    });
    if (!approved) return;
    await fetch('/settings/zernio', { method: 'DELETE' });
    await mutate();
    onMutate();
    toaster.show('Conexão Zernio removida', 'success');
  }, [decision, fetch, mutate, onMutate, toaster]);

  const usage = data?.usage ?? null;

  return (
    <div className="bg-sixth border-fifth border rounded-[4px] overflow-hidden">
      <div
        className="flex items-center justify-between p-[16px] cursor-pointer hover:bg-boxHover transition-colors"
        onClick={toggle}
      >
        <div className="flex items-center gap-[12px]">
          <img
            src="/icons/platforms/zernio.png"
            alt="Zernio"
            className="w-[24px] h-[24px] object-contain"
          />
          <div className="text-[15px] font-[500]">Zernio</div>
          {configured ? (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-customColor42/20 text-customColor42 px-[10px] py-[2px] text-[12px]">
              <span className="w-[6px] h-[6px] rounded-full bg-customColor42 inline-block" />
              Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-fifth px-[10px] py-[2px] text-[12px] text-customColor18">
              Não conectado
            </span>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={clsx('transition-transform', expanded && 'rotate-180')}
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {expanded && (
        <div className="border-t border-fifth p-[16px] flex flex-col gap-[16px]">
          <div className="text-[13px] text-customColor18">
            Use o Zernio para publicar em qualquer rede social sem precisar de
            aprovação de app própria.
          </div>
          {isLoading ? (
            <div className="animate-pulse text-[14px]">Carregando...</div>
          ) : !configured ? (
            <>
              <div className="flex flex-col gap-[6px]">
                <div className="text-[14px]">Zernio API Key</div>
                <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] text-textColor placeholder-textColor flex items-center">
                  <input
                    className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor px-[16px]"
                    type="password"
                    placeholder="sk_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConnect();
                      }
                    }}
                  />
                </div>
                <div className="text-[12px] text-customColor18">
                  Obtenha sua API key em{' '}
                  <a
                    href="https://zernio.com/dashboard/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:font-bold"
                  >
                    zernio.com/dashboard/api-keys
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-[12px]">
                <Button
                  onClick={handleConnect}
                  loading={saving}
                  disabled={!apiKey.trim()}
                >
                  Conectar
                </Button>
                <a
                  href="https://zernio.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[14px] text-customColor18 underline hover:font-bold"
                >
                  Criar conta no Zernio (gratuito)
                </a>
              </div>
            </>
          ) : (
            <>
              {usage && (
                <div className="flex flex-col gap-[16px]">
                  {usage.planName && (
                    <div className="text-[14px]">
                      Plano:{' '}
                      <span className="font-semibold">{usage.planName}</span>
                    </div>
                  )}
                  <UsageBar
                    label="Uploads"
                    used={usage.uploads.used}
                    limit={usage.uploads.limit}
                  />
                  <UsageBar
                    label="Perfis"
                    used={usage.profiles.used}
                    limit={usage.profiles.limit}
                  />
                  {usage.lastReset && (
                    <div className="text-[12px] text-customColor18">
                      Último reset:{' '}
                      {new Date(usage.lastReset).toLocaleDateString('pt-BR')}
                    </div>
                  )}
                </div>
              )}
              <div>
                <Button onClick={handleDisconnect} secondary>
                  Remover conexão
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ZernioCredentialsCard;
