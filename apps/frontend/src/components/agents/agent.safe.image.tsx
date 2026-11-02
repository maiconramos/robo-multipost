'use client';

import { FC, ReactNode, useMemo } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  isOwnMediaUrl,
  ownMediaPrefixes,
} from '@gitroom/helpers/utils/inline.images';

// Imagem no markdown da resposta do assistente. Uma pagina lida pela pesquisa
// na web pode fazer o modelo responder ![x](https://site/?d=<dados da conversa>)
// e o navegador buscaria a imagem sozinho, entregando os dados. So a midia da
// propria instancia carrega automaticamente; o resto vira um link para clicar.
// tipado como o ComponentsMap do CopilotKit (props genericas do markdown)
export const AgentSafeImage: FC<{ children?: ReactNode }> = (props) => {
  const { src, alt } = props as { src?: unknown; alt?: unknown };
  const t = useT();
  const { frontEndUrl, cloudflareUrl } = useVariables();
  const own = useMemo(
    () =>
      isOwnMediaUrl(
        src,
        ownMediaPrefixes({ frontendUrl: frontEndUrl, cloudflareUrl })
      ),
    [src, frontEndUrl, cloudflareUrl]
  );

  if (own) {
    return (
      <img
        src={src as string}
        alt={typeof alt === 'string' ? alt : ''}
        className="max-w-full rounded-[8px]"
      />
    );
  }
  if (typeof src !== 'string' || !/^https?:\/\//i.test(src)) {
    return null;
  }
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="underline"
    >
      {t('agent_external_image', 'Imagem externa (clique para abrir)')}
    </a>
  );
};
