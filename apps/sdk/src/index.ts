import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { QuickCreateFlowDto } from '@gitroom/nestjs-libraries/dtos/flows/flow.dto';
import fetch, { FormData } from 'node-fetch';

export type FlowStatusInput = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

function toQueryString(obj: Record<string, any>): string {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

export default class Postiz {
  constructor(
    private _apiKey: string,
    private _path = 'https://api.postiz.com'
  ) {}

  async post(posts: CreatePostDto) {
    return (
      await fetch(`${this._path}/public/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
        body: JSON.stringify(posts),
      })
    ).json();
  }

  async postList(filters: GetPostsDto) {
    return (
      await fetch(`${this._path}/public/v1/posts?${toQueryString(filters)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  async upload(file: Buffer, extension: string) {
    const formData = new FormData();
    const type =
      extension === 'png'
        ? 'image/png'
        : extension === 'jpg'
        ? 'image/jpeg'
        : extension === 'gif'
        ? 'image/gif'
        : extension === 'jpeg'
        ? 'image/jpeg'
        : 'image/jpeg';

    const blob = new Blob([file], { type });
    formData.append('file', blob, extension);

    return (
      await fetch(`${this._path}/public/v1/upload`, {
        method: 'POST',
        // @ts-ignore
        body: formData,
        headers: {
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  async integrations() {
    return (
      await fetch(`${this._path}/public/v1/integrations`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  deletePost(id: string) {
    return fetch(`${this._path}/public/v1/posts/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this._apiKey,
      },
    });
  }

  // --- Automacoes de comentario do Instagram (Flows) ---

  /**
   * Cria uma automacao de comentario/story do Instagram. Quando `postMode` nao
   * e informado, o backend usa `next_publication` (a automacao se conecta ao
   * proximo post publicado no canal — ideal para encadear apos publicar).
   */
  async createFlow(body: QuickCreateFlowDto) {
    return (
      await fetch(`${this._path}/public/v1/flows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
        body: JSON.stringify(body),
      })
    ).json();
  }

  async listFlows(filters?: { integrationId?: string; profileId?: string }) {
    const qs = filters ? `?${toQueryString(filters)}` : '';
    return (
      await fetch(`${this._path}/public/v1/flows${qs}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  async getFlow(id: string) {
    return (
      await fetch(`${this._path}/public/v1/flows/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  async updateFlow(id: string, body: QuickCreateFlowDto) {
    return (
      await fetch(`${this._path}/public/v1/flows/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
        body: JSON.stringify(body),
      })
    ).json();
  }

  async setFlowStatus(id: string, status: FlowStatusInput) {
    return (
      await fetch(`${this._path}/public/v1/flows/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
        body: JSON.stringify({ status }),
      })
    ).json();
  }

  deleteFlow(id: string) {
    return fetch(`${this._path}/public/v1/flows/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this._apiKey,
      },
    });
  }
}
