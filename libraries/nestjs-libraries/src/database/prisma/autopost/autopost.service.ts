import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { AutopostDto } from '@gitroom/nestjs-libraries/dtos/autopost/autopost.dto';
import dayjs from 'dayjs';
import { END, START, StateGraph } from '@langchain/langgraph';
import { AutoPost, Integration } from '@prisma/client';
import { BaseMessage } from '@langchain/core/messages';
import striptags from 'striptags';
import { ChatOpenAI, DallEAPIWrapper } from '@langchain/openai';
import { JSDOM } from 'jsdom';
import { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import {
  UNTRUSTED_SOURCE_RULE,
  wrapUntrustedSource,
} from '@gitroom/nestjs-libraries/ai/untrusted.source';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import Parser from 'rss-parser';
import {
  decodeText,
  fetchPublicUrl,
} from '@gitroom/nestjs-libraries/upload/public-url.fetch';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
const parser = new Parser();

// Feed e pagina do artigo vem de terceiros: SSRF-safe, com teto de bytes (o
// `parseURL` do rss-parser fazia http cru, seguia 5 redirects e nao limitava).
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_ARTICLE_BYTES = 5 * 1024 * 1024;
// o rss-parser mandava UA/Accept proprios; sem eles, feeds atras de WAF
// respondem 403 ou HTML
const FEED_HEADERS = {
  'User-Agent': 'RoboMultipost/1.0 (+https://github.com/maiconramos/robo-multipost)',
  Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
};
const ARTICLE_HEADERS = {
  'User-Agent': FEED_HEADERS['User-Agent'],
  Accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.5',
};

interface WorkflowChannelsState {
  messages: BaseMessage[];
  integrations: Integration[];
  body: AutoPost;
  description: string;
  image: string;
  id: string;
  load: {
    date: string;
    url: string;
    description: string;
  };
}

const model = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
  model: 'gpt-4.1',
  temperature: 0.7,
});

const dalle = new DallEAPIWrapper({
  apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
  model: 'gpt-image-1',
});

const generateContent = z.object({
  socialMediaPostContent: z
    .string()
    .describe('Content for social media posts max 120 chars'),
});

const dallePrompt = z.object({
  generatedTextToBeSentToDallE: z
    .string()
    .describe('Generated prompt from description to be sent to DallE'),
});

export const MAX_AUTOPOSTS_PER_ORG = 200;

@Injectable()
export class AutopostService {
  constructor(
    private _autopostsRepository: AutopostRepository,
    private _temporalService: TemporalService,
    private _integrationService: IntegrationService,
    private _postsService: PostsService
  ) {}

  async stopAll(org: string) {
    const getAll = (await this.getAutoposts(org)).filter((f) => f.active);
    for (const autopost of getAll) {
      await this.changeActive(org, autopost.id, false);
    }
  }

  getAutoposts(orgId: string, profileId?: string) {
    return this._autopostsRepository.getAutoposts(orgId, profileId);
  }

  async createAutopost(orgId: string, body: AutopostDto, id?: string, profileId?: string) {
    // cada regra e um cron que baixa o feed e pode gerar texto/imagem com IA:
    // teto por organizacao (agencia com muitos clientes cabe com folga)
    if (
      !id &&
      (await this._autopostsRepository.countActiveAutoposts(orgId)) >=
        MAX_AUTOPOSTS_PER_ORG
    ) {
      throw new HttpException(
        `Limite de ${MAX_AUTOPOSTS_PER_ORG} regras de RSS automático por organização.`,
        HttpStatus.BAD_REQUEST
      );
    }
    const data = await this._autopostsRepository.createAutopost(
      orgId,
      body,
      id,
      profileId
    );

    await this.processCron(body.active, orgId, data.id);

    return data;
  }

  async changeActive(orgId: string, id: string, active: boolean, profileId?: string) {
    const data = await this._autopostsRepository.changeActive(
      orgId,
      id,
      active,
      profileId
    );
    await this.processCron(active, orgId, id);
    return data;
  }

  async processCron(active: boolean, orgId: string, id: string) {
    if (active) {
      try {
        return await this._temporalService.client
          .getRawClient()
          ?.workflow.start('autoPostWorkflow', {
            workflowId: `autopost-${id}`,
            // workflow ja rodando le as configuracoes a cada execucao: mantem
            // (upstream d883bfa1)
            workflowIdConflictPolicy: 'USE_EXISTING',
            taskQueue: 'main',
            args: [{ id, immediately: true }],
            typedSearchAttributes: new TypedSearchAttributes([
              {
                key: organizationId,
                value: orgId,
              },
            ]),
          });
      } catch (err) {
        // nunca cair no terminate abaixo e matar um autopost ativo
        return false;
      }
    }

    try {
      return await this._temporalService.terminateWorkflow(`autopost-${id}`);
    } catch (err) {
      return false;
    }
  }

  async deleteAutopost(orgId: string, id: string, profileId?: string) {
    const data = await this._autopostsRepository.deleteAutopost(orgId, id, profileId);
    await this.processCron(false, orgId, id);
    return data;
  }

  async loadXML(url: string) {
    try {
      // URL do feed e configurada pelo usuario (como um webhook): respeita o
      // opt-out self-hosted, igual ao `OnlyURL` de `POST /autopost/send`.
      const feed = await fetchPublicUrl(url, {
        maxBytes: MAX_FEED_BYTES,
        honorSsrfOptOut: true,
        headers: FEED_HEADERS,
      });
      const { items } = await parser.parseString(
        decodeText(feed.buffer, feed.contentType)
      );
      const findLast = items.reduce(
        (all: any, current: any) => {
          if (dayjs(current.pubDate).isAfter(all.pubDate)) {
            return current;
          }
          return all;
        },
        { pubDate: dayjs().subtract(100, 'years') }
      );

      return {
        success: true,
        date: findLast.pubDate,
        url: findLast.link,
        description: striptags(
          findLast?.['content:encoded'] ||
            findLast?.content ||
            findLast?.description ||
            ''
        )
          .replace(/\n/g, ' ')
          .trim(),
      };
    } catch (err) {
      /** sent **/
    }

    return { success: false };
  }

  static state = () =>
    new StateGraph<WorkflowChannelsState>({
      channels: {
        messages: {
          reducer: (currentState, updateValue) =>
            currentState.concat(updateValue),
          default: (): BaseMessage[] => [],
        },
        body: null,
        description: null,
        load: null,
        image: null,
        integrations: null,
        id: null,
      },
    });

  async loadUrl(url: string) {
    try {
      // link do item vem do publicador do feed: nunca herda o opt-out, pode
      // ser http (blogs antigos) — o guard roda na conexao de qualquer forma
      const page = await fetchPublicUrl(url, {
        maxBytes: MAX_ARTICLE_BYTES,
        allowHttp: true,
        headers: ARTICLE_HEADERS,
      });
      const loadDom = new JSDOM(decodeText(page.buffer, page.contentType));
      loadDom.window.document
        .querySelectorAll('script')
        .forEach((s) => s.remove());
      loadDom.window.document
        .querySelectorAll('style')
        .forEach((s) => s.remove());
      // remove all html, script and styles
      return striptags(loadDom.window.document.body.innerHTML);
    } catch (err) {
      return '';
    }
  }

  async generateDescription(state: WorkflowChannelsState) {
    if (!state.body.generateContent) {
      return {
        ...state,
        description: state.body.content,
      };
    }

    const description =
      state.load.description || (await this.loadUrl(state.load.url));
    if (!description) {
      return {
        ...state,
        description: '',
      };
    }

    const structuredOutput = model.withStructuredOutput(generateContent);
    const { socialMediaPostContent } = await ChatPromptTemplate.fromTemplate(
      `
        You are an assistant that gets raw 'description' of a content and generate a social media post content.
        Rules:
        - Maximum 100 chars
        - Try to make it a short as possible to fit any social media
        - Add line breaks between sentences (\\n) 
        - Don't add hashtags
        - Add emojis when needed
        - {untrustedRule}
        
        'description':
        {content}
      `
    )
      .pipe(structuredOutput)
      .invoke({
        // item do feed vem de terceiros: dado, nunca instrucao
        content: wrapUntrustedSource(description, state.load.url),
        untrustedRule: UNTRUSTED_SOURCE_RULE,
      });

    return {
      ...state,
      description: socialMediaPostContent,
    };
  }

  async generatePicture(state: WorkflowChannelsState) {
    const structuredOutput = model.withStructuredOutput(dallePrompt);
    const { generatedTextToBeSentToDallE } =
      await ChatPromptTemplate.fromTemplate(
        `
        You are an assistant that gets description and generate a prompt that will be sent to DallE to generate pictures.
        {untrustedRule}
        
        content:
        {content}
      `
      )
        .pipe(structuredOutput)
        .invoke({
          // texto do feed ou o post gerado a partir da pagina: ambos derivam
          // de conteudo de terceiros
          content: wrapUntrustedSource(
            state.load.description || state.description,
            state.load.url
          ),
          untrustedRule: UNTRUSTED_SOURCE_RULE,
        });

    const image = await dalle.invoke(generatedTextToBeSentToDallE);

    return { ...state, image };
  }

  async schedulePost(state: WorkflowChannelsState) {
    const nextTime = await this._postsService.findFreeDateTime(
      state.integrations[0].organizationId
    );

    await this._postsService.createPost(state.integrations[0].organizationId, {
      date: nextTime + 'Z',
      order: makeId(10),
      shortLink: false,
      type: 'draft',
      tags: [],
      posts: state.integrations.map((i) => ({
        settings: {
          __type: i.providerIdentifier as any,
          title: '',
          tags: [],
          subreddit: [],
        },
        group: makeId(10),
        integration: { id: i.id },
        value: [
          {
            id: makeId(10),
            delay: 0,
            content:
              state.description.replace(/\n/g, '\n\n') +
              '\n\n' +
              state.load.url,
            image: !state.image
              ? []
              : [
                  {
                    id: makeId(10),
                    name: makeId(10),
                    path: state.image,
                    organizationId: state.integrations[0].organizationId,
                  },
                ],
          },
        ],
      })),
    });
  }

  async updateUrl(state: WorkflowChannelsState) {
    await this._autopostsRepository.updateUrl(state.id, state.load.url);
  }

  async startAutopost(id: string) {
    const getPost = await this._autopostsRepository.getAutopost(id);
    if (!getPost || !getPost.active) {
      return;
    }

    const load = await this.loadXML(getPost.url);
    if (!load.success || load.url === getPost.lastUrl) {
      return;
    }

    const integrations = await this._integrationService.getIntegrationsList(
      getPost.organizationId,
      getPost.profileId || undefined
    );

    const parseIntegrations = JSON.parse(getPost.integrations || '[]') || [];
    const neededIntegrations = integrations.filter((i) =>
      parseIntegrations.some((ii: any) => ii.id === i.id)
    );

    const integrationsToSend =
      parseIntegrations.length === 0 ? integrations : neededIntegrations;
    if (integrationsToSend.length === 0) {
      return;
    }

    const state = AutopostService.state();
    const workflow = state
      .addNode('generate-description', this.generateDescription.bind(this))
      .addNode('generate-picture', this.generatePicture.bind(this))
      .addNode('schedule-post', this.schedulePost.bind(this))
      .addNode('update-url', this.updateUrl.bind(this))
      .addEdge(START, 'generate-description')
      .addConditionalEdges(
        'generate-description',
        (state: WorkflowChannelsState) => {
          if (!state.description) {
            return 'schedule-post';
          }
          if (state.body.addPicture) {
            return 'generate-picture';
          }
          return 'schedule-post';
        }
      )
      .addEdge('generate-picture', 'schedule-post')
      .addEdge('schedule-post', 'update-url')
      .addEdge('update-url', END);

    const app = workflow.compile();
    await app.invoke({
      messages: [],
      id,
      body: getPost,
      load,
      integrations: integrationsToSend,
    });
  }
}
