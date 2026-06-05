# Postiz NodeJS SDK

This is the NodeJS SDK for [Postiz](https://postiz.com).

You can start by installing the package:

```bash
npm install @postiz/node
```

## Usage
```typescript
import Postiz from '@postiz/node';
const postiz = new Postiz('your api key', 'your self-hosted instance (optional)');
```

The available methods are:
- `post(posts: CreatePostDto)` - Schedule a post to Postiz
- `postList(filters: GetPostsDto)` - Get a list of posts
- `upload(file: Buffer, extension: string)` - Upload a file to Postiz
- `integrations()` - Get a list of connected channels
- `deletePost(id: string)` - Delete a post by ID

### Instagram comment automations (Flows)
- `createFlow(body: QuickCreateFlowDto)` - Create an Instagram comment/story automation. When `postMode` is omitted it defaults to `next_publication` (the automation auto-binds to the next post published on that channel — ideal to chain after publishing).
- `listFlows(filters?: { integrationId?: string; profileId?: string })` - List automations
- `getFlow(id: string)` - Get a single automation
- `updateFlow(id: string, body: QuickCreateFlowDto)` - Update an automation
- `setFlowStatus(id: string, status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED')` - Activate/pause/archive
- `deleteFlow(id: string)` - Delete an automation

```typescript
// "When someone comments EU QUERO on my next Instagram post, DM them the blog link"
await postiz.createFlow({
  name: 'Receita - link no DM',
  integrationId: 'your-instagram-integration-id',
  triggerType: 'comment_on_post',
  postMode: 'next_publication',
  keywords: ['EU QUERO'],
  matchMode: 'any',
  replyMessage: 'Te mandei no direct! 💬',
  dmMessage: 'Aqui está a receita completa 👇',
  dmButtonText: 'Ver receita',
  dmButtonUrl: 'https://seu-blog.com/receita-de-bolo',
});
```

> The DM button URL must be a public `https` URL. A per-profile API key can only create automations on its own profile's Instagram channels.

Alternatively you can use the SDK with curl, check the [Postiz API documentation](https://docs.postiz.com/public-api) for more information.