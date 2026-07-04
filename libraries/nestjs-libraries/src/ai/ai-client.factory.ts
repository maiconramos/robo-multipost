import { HttpException, Injectable } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import OpenAI from 'openai';
import {
  ImageOptions,
  TextOptions,
} from './ai-credential.schemas';
import { ResolvedAiCredential } from './ai-credential.service';
import { AiProviderResolverService } from './ai-provider-resolver.service';

const DEFAULT_TEXT_MODELS: Record<string, string> = {
  openrouter: 'openai/gpt-5.5',
  openai: 'gpt-5.5',
};

const DEFAULT_IMAGE_MODELS: Record<string, string> = {
  openrouter: 'google/gemini-3.1-flash-image-preview',
  openai: 'gpt-image-2',
};

export interface TextClientResult {
  provider: string;
  model: any;
  /** ID textual do modelo principal (ex: 'openai/gpt-5.5'). Usado por
   *  consumers para detectar features especificas (reasoning, etc). */
  modelId: string;
  fallbackModel: any | null;
  fallbackModelId: string | null;
  options: TextOptions;
  credentialId: string;
}

/** Modelos que sao "reasoning" e nao aceitam temperature/top_p.
 *  Inclui famílias o1/o3/o4 (legacy) e gpt-5+ (atual default da OpenAI,
 *  que tambem trata temperature como nao-suportado). Cobertos sufixos
 *  de variantes (pro/codex/mini/etc). */
const REASONING_MODEL_PREFIXES = [
  'o1',
  'o3',
  'o4',
  'openai/o1',
  'openai/o3',
  'openai/o4',
  'gpt-5',
  'openai/gpt-5',
];

export function isReasoningModel(modelId: string): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase();
  // Aceita o prefixo exato, ou seguido por separador `-` (ex: gpt-5-codex)
  // ou `.` (ex: gpt-5.5, gpt-5.4 — versionamento da OpenAI). Sem o `.`,
  // gpt-5.5 caia fora do filtro e o AI SDK emitia warning de temperature.
  return REASONING_MODEL_PREFIXES.some(
    (prefix) =>
      lower === prefix ||
      lower.startsWith(`${prefix}-`) ||
      lower.startsWith(`${prefix}.`)
  );
}

export interface ImageClientResult {
  provider: string;
  model: any;
  options: ImageOptions;
  credentialId: string;
}

@Injectable()
export class AiClientFactory {
  constructor(private _resolver: AiProviderResolverService) {}

  async text(
    organizationId: string,
    profileId?: string
  ): Promise<TextClientResult> {
    const credential = await this._resolver.resolve(
      organizationId,
      'TEXT',
      profileId
    );
    const modelId =
      credential.model ?? DEFAULT_TEXT_MODELS[credential.provider] ?? '';
    const fallbackId = credential.fallbackModel ?? null;
    return {
      provider: credential.provider,
      model: this.buildTextModel(credential),
      modelId,
      fallbackModel: fallbackId
        ? this.buildTextModel({
            ...credential,
            model: fallbackId,
          })
        : null,
      fallbackModelId: fallbackId,
      options: (credential.options as TextOptions) ?? {},
      credentialId: credential.id,
    };
  }

  async image(
    organizationId: string,
    profileId?: string
  ): Promise<ImageClientResult> {
    const credential = await this._resolver.resolve(
      organizationId,
      'IMAGE',
      profileId
    );
    return {
      provider: credential.provider,
      model: this.buildImageModel(credential),
      options: (credential.options as ImageOptions) ?? {},
      credentialId: credential.id,
    };
  }

  /**
   * Resolve a credencial de TEXTO da UI (Configuracoes > Modelos de IA) e
   * devolve a config crua pronta pra construir um cliente OpenAI-compativel
   * (`new OpenAI({ apiKey, baseURL })`). Usado pelos endpoints do CopilotKit
   * (`/copilot/agent`, `/copilot/chat`) para nao dependerem mais da env var
   * `OPENAI_API_KEY` — a IA passa a seguir 100% o provedor configurado na UI,
   * seja OpenAI ou OpenRouter, herdando o compartilhamento default->perfil de
   * `AiProviderResolverService.resolve`.
   *
   * OpenRouter e OpenAI-compativel via `baseURL`; OpenAI direto usa o default
   * do SDK (undefined => https://api.openai.com/v1).
   */
  async openAiCompatibleTextConfig(
    organizationId: string,
    profileId?: string
  ): Promise<{
    provider: string;
    apiKey: string;
    baseURL?: string;
    model: string;
  }> {
    const credential = await this._resolver.resolve(
      organizationId,
      'TEXT',
      profileId
    );
    const model =
      credential.model ?? DEFAULT_TEXT_MODELS[credential.provider] ?? '';

    switch (credential.provider) {
      case 'openrouter':
        return {
          provider: 'openrouter',
          apiKey: credential.apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          model,
        };
      case 'openai':
        return {
          provider: 'openai',
          apiKey: credential.apiKey,
          baseURL: undefined,
          model,
        };
      default:
        throw new HttpException(
          `Provider sem suporte para chat: ${credential.provider}`,
          400
        );
    }
  }

  /**
   * Constroi um cliente OpenAI-compativel (SDK `openai`) a partir da credencial
   * de TEXTO da UI, pronto para o `OpenAIAdapter` do CopilotKit. Mantem a
   * construcao do SDK e o manuseio da apiKey decriptada DENTRO da library — o
   * controller so recebe o cliente pronto (nao importa o SDK nem toca na chave).
   *
   * Shim de compatibilidade: o `OpenAIAdapter` do CopilotKit foi escrito para o
   * `openai` v4 e chama `openai.beta.chat.completions.stream(...)`. No `openai`
   * v6 (versao deste monorepo) esse helper saiu de `beta` e virou
   * `chat.completions.stream`. Religamos `beta.chat -> chat` para o adapter
   * voltar a funcionar sem precisar fazer downgrade do SDK.
   */
  async buildOpenAiCompatibleClient(
    organizationId: string,
    profileId?: string
  ): Promise<{ client: OpenAI; model: string }> {
    const cfg = await this.openAiCompatibleTextConfig(
      organizationId,
      profileId
    );
    const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
    const beta = (client as any).beta;
    if (beta && !beta.chat) {
      beta.chat = (client as any).chat;
    }
    return { client, model: cfg.model };
  }

  /**
   * Helper para Mastra Agent — retorna funcao async que resolve a credencial
   * em runtime. Permite trocar credencial sem reiniciar o agente.
   */
  textForMastra(organizationId: string, profileId?: string) {
    return async () => {
      const result = await this.text(organizationId, profileId);
      return result.model;
    };
  }

  private buildTextModel(credential: ResolvedAiCredential) {
    const modelId =
      credential.model ?? DEFAULT_TEXT_MODELS[credential.provider];
    if (!modelId) {
      throw new HttpException(
        `Modelo nao definido e provider sem default: ${credential.provider}`,
        500
      );
    }

    switch (credential.provider) {
      case 'openrouter': {
        const provider = createOpenRouter({ apiKey: credential.apiKey });
        return provider(modelId);
      }
      case 'openai': {
        const provider = createOpenAI({ apiKey: credential.apiKey });
        return provider(modelId);
      }
      default:
        throw new HttpException(
          `Provider sem suporte para texto: ${credential.provider}`,
          400
        );
    }
  }

  /**
   * OpenRouter ainda nao expoe `imageModel()` via AI SDK — geracao de imagem
   * via OpenRouter usa o endpoint chat com `modalities: ['image']` (resolvido
   * no MediaService no Bloco C). Aqui retornamos a instancia do provider
   * para o consumer decidir o caminho.
   */
  private buildImageModel(credential: ResolvedAiCredential) {
    const modelId =
      credential.model ?? DEFAULT_IMAGE_MODELS[credential.provider];
    if (!modelId) {
      throw new HttpException(
        `Modelo nao definido e provider sem default: ${credential.provider}`,
        500
      );
    }

    switch (credential.provider) {
      case 'openrouter': {
        const provider = createOpenRouter({ apiKey: credential.apiKey });
        return (provider as any)(modelId);
      }
      case 'openai': {
        const provider = createOpenAI({ apiKey: credential.apiKey });
        return provider.imageModel(modelId);
      }
      default:
        throw new HttpException(
          `Provider sem suporte para imagem: ${credential.provider}`,
          400
        );
    }
  }
}
