/* Isolated real-Mastra HTTP proof. All identities, providers and media storage are local fakes. */
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
function stub(relative, exports) {
  const id = require.resolve(path.join(root, relative));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
const classes = {};
for (const [relative, name] of [
  ['chat/mastra.service.ts', 'MastraService'],
  [
    'database/prisma/organizations/organization.service.ts',
    'OrganizationService',
  ],
  ['database/prisma/oauth/oauth.service.ts', 'OAuthService'],
  ['database/prisma/profiles/profile.service.ts', 'ProfileService'],
  ['database/prisma/media/media.service.ts', 'MediaService'],
  ['database/prisma/posts/post-management.service.ts', 'PostManagementService'],
  ['database/prisma/posts/posts.service.ts', 'PostsService'],
  ['database/prisma/integrations/integration.service.ts', 'IntegrationService'],
  [
    'database/prisma/notifications/notification.service.ts',
    'NotificationService',
  ],
]) {
  classes[name] = class {};
  stub('libraries/nestjs-libraries/src/' + relative, { [name]: classes[name] });
}
const source = Buffer.alloc(6 * 1024 ** 2, 17);
Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
).copy(source);
let saves = 0;
const saved = [];
stub('libraries/nestjs-libraries/src/upload/upload.factory.ts', {
  UploadFactory: {
    createStorage: () => ({
      uploadFile: async (file) => {
        assert(file.buffer.equals(source));
        return { originalname: 'image.png', path: '/uploads/test.png' };
      },
    }),
  },
});
const { startMcp } = require(path.join(
  root,
  'libraries/nestjs-libraries/src/chat/start.mcp.ts'
));
const { MediaTransferService } = require(path.join(
  root,
  'libraries/nestjs-libraries/src/upload/media-transfer.service.ts'
));
const { UploadMediaTool } = require(path.join(
  root,
  'libraries/nestjs-libraries/src/chat/tools/media.upload.tool.ts'
));
const { GetAccountContextTool } = require(path.join(
  root,
  'libraries/nestjs-libraries/src/chat/tools/operational.query.tool.ts'
));
const { IntegrationListTool } = require(path.join(
  root,
  'libraries/nestjs-libraries/src/chat/tools/integration.list.tool.ts'
));
const express = require(path.join(root, 'node_modules/express'));
const org = { id: 'test-org', name: 'Test', apiKey: 'NEVER_EXPOSE_ORG_KEY' };
const available = [
  { id: 'default', name: 'Default', isDefault: true },
  { id: 'client-a', name: 'Client A', isDefault: false },
  { id: 'client-b', name: 'Client B', isDefault: false },
];
const profiles = {
  getProfileByApiKey: async (key) =>
    key === 'profile-a-test' ? { ...available[1], organization: org } : null,
  getProfileById: async (organizationId, id) =>
    organizationId === org.id
      ? available.find((p) => p.id === id) || null
      : null,
  getProfilesByOrgId: async (organizationId) =>
    organizationId === org.id ? available : [],
};
const transfer = new MediaTransferService({
  saveFile: async (organizationId, name, mediaPath, _unused, profileId) => {
    assert.equal(organizationId, org.id);
    assert.equal(profileId, 'client-b');
    saves++;
    saved.push(profileId);
    return { id: 'saved-' + saves, name, path: mediaPath, originalName: name };
  },
});
const integrations = {
  getIntegrationsList: async () => [
    {
      id: 'channel-b',
      profileId: 'client-b',
      name: 'Client B IG',
      providerIdentifier: 'instagram',
    },
    {
      id: 'channel-a',
      profileId: 'client-a',
      name: 'Client A IG',
      providerIdentifier: 'instagram',
    },
  ],
};
const tools = {
  getAccountContextTool: new GetAccountContextTool(profiles).run(),
  integrationList: new IntegrationListTool(integrations, profiles).run(),
  uploadMediaTool: new UploadMediaTool(transfer, profiles).run(),
};
const services = new Map([
  [
    classes.MastraService,
    {
      mastra: async () => ({
        getAgent: () => ({ listTools: async () => tools }),
      }),
    },
  ],
  [
    classes.OrganizationService,
    {
      getOrgByApiKey: async (key) => (key === 'organization-test' ? org : null),
    },
  ],
  [
    classes.OAuthService,
    {
      getOrgByOAuthToken: async (key) =>
        key === 'pos_test' ? { organization: org } : null,
    },
  ],
  [classes.ProfileService, profiles],
]);
(async () => {
  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.NEXT_PUBLIC_BACKEND_URL = base;
  process.env.FRONTEND_URL = 'https://frontend.invalid';
  try {
    await startMcp({
      get: (token) => services.get(token),
      use: app.use.bind(app),
      getHttpServer: () => server,
    });
    let id = 0;
    async function rpc(
      endpoint,
      method,
      params = {},
      key = 'organization-test',
      modern = false
    ) {
      const modernHeaders = modern
        ? {
            'MCP-Protocol-Version': '2026-07-28',
            'Mcp-Method': method,
            ...(params.name ? { 'Mcp-Name': params.name } : {}),
          }
        : {};
      if (modern)
        params = {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': {
              name: 'modern-local-proof',
              version: '1',
            },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        };
      const response = await fetch(base + endpoint, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...modernHeaders,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      });
      const raw = await response.text();
      const body = JSON.parse(
        raw.startsWith('event:')
          ? raw
              .split('\n')
              .find((line) => line.startsWith('data: '))
              .slice(6)
          : raw
      );
      assert.equal(response.status, 200, JSON.stringify(body));
      assert(!body.error, JSON.stringify(body.error));
      return body.result;
    }
    const initialized = await rpc('/mcp', 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'local-proof', version: '1' },
    });
    assert(initialized.instructions.includes('getAccountContextTool'));
    assert(initialized.instructions.includes('mesma chave'));
    async function call(endpoint, name, args = {}, key) {
      const result = await rpc(
        endpoint,
        'tools/call',
        { name, arguments: args },
        key
      );
      const text = result.content.find((c) => c.type === 'text')?.text;
      assert(text, 'MCP tool did not return text');
      if (result.isError) return { transportToolError: text };
      return JSON.parse(text);
    }
    const missing = await call('/mcp', 'uploadMediaTool', {
      filename: 'image.png',
      base64: 'YQ==',
    });
    assert.equal(JSON.parse(missing.errors)[0].error, 'PROFILE_REQUIRED');
    assert(missing.errors.includes('getAccountContextTool'));
    assert.equal(saves, 0);
    const account = await call('/mcp', 'getAccountContextTool');
    assert.equal(account.output.credentialScope, 'organization');
    assert.equal(account.output.profile, null);
    assert(!JSON.stringify(account).includes('NEVER_EXPOSE_ORG_KEY'));
    const selected = account.output.profiles.find((p) => p.name === 'Client B');
    assert.equal(selected.id, 'client-b');
    const channels = await call('/mcp', 'integrationList', {
      profileId: selected.id,
    });
    assert.deepEqual(
      channels.output.map((c) => c.id),
      ['channel-b']
    );
    const listed = await rpc('/mcp', 'tools/list');
    assert(listed.tools.some((tool) => tool.name === 'getAccountContextTool'));
    const discovered = await rpc(
      '/mcp',
      'server/discover',
      {},
      'organization-test',
      true
    );
    assert(discovered.instructions.includes('mesma chave'));
    const modernList = await rpc(
      '/mcp',
      'tools/list',
      {},
      'organization-test',
      true
    );
    assert(modernList.tools.some((tool) => tool.name === 'uploadMediaTool'));
    const modernContext = await rpc(
      '/mcp',
      'tools/call',
      { name: 'getAccountContextTool', arguments: {} },
      'organization-test',
      true
    );
    assert(
      JSON.parse(modernContext.content.find((c) => c.type === 'text').text)
        .output.credentialScope === 'organization'
    );
    const concurrent = await Promise.all([
      call('/mcp', 'integrationList', { profileId: 'client-a' }),
      call('/mcp', 'integrationList', { profileId: 'client-b' }),
    ]);
    assert.deepEqual(
      concurrent.map((result) => result.output.map((channel) => channel.id)),
      [['channel-a'], ['channel-b']]
    );
    const base64 = source.toString('base64');
    for (const [endpoint, key] of [
      ['/mcp', 'organization-test'],
      ['/mcp/organization-test', 'organization-test'],
      ['/mcp-oauth', 'pos_test'],
    ]) {
      const result = await call(
        endpoint,
        'uploadMediaTool',
        { filename: 'image.png', base64, profileId: selected.id },
        key
      );
      assert(result.output.id.startsWith('saved-'));
      assert.equal(result.scope.profile.id, 'client-b');
    }
    const modernUpload = await rpc(
      '/mcp',
      'tools/call',
      {
        name: 'uploadMediaTool',
        arguments: { filename: 'image.png', base64, profileId: selected.id },
      },
      'organization-test',
      true
    );
    assert.equal(
      JSON.parse(modernUpload.content.find((c) => c.type === 'text').text).scope
        .profile.id,
      'client-b'
    );
    assert.equal(saves, 4);
    assert.deepEqual(saved, ['client-b', 'client-b', 'client-b', 'client-b']);
    const oversized = await call('/mcp', 'uploadMediaTool', {
      filename: 'image.png',
      base64: Buffer.alloc(source.length + 1).toString('base64'),
      profileId: selected.id,
    });
    assert(
      oversized.transportToolError?.includes('Tool validation failed') ||
        oversized.errors?.includes('INVALID_TOOL_INPUT')
    );
    assert.equal(saves, 4);
    const cross = await call(
      '/mcp',
      'uploadMediaTool',
      { filename: 'image.png', base64: 'YQ==', profileId: selected.id },
      'profile-a-test'
    );
    assert(cross.errors.includes('PROFILE_KEY_MISMATCH'));
    assert.equal(saves, 4);
    const unchanged = await call('/mcp', 'getAccountContextTool');
    assert.equal(unchanged.output.profile, null);
    const before = saves;
    const tooLarge = await fetch(base + '/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer organization-test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: 'NEVER_EXPOSE_PAYLOAD',
        padding: 'x'.repeat(12 * 1024 ** 2),
      }),
    });
    assert.equal(tooLarge.status, 413);
    assert(!(await tooLarge.text()).includes('NEVER_EXPOSE_PAYLOAD'));
    assert.equal(saves, before);
    console.log(
      'MCP_HTTP_PROOF=' +
        JSON.stringify({
          bytes: source.length,
          sha256: crypto.createHash('sha256').update(source).digest('hex'),
          endpoints: 3,
          saves,
          sameOrganizationCredential: true,
          defaultNeverSelected: true,
          profileKeyMismatchBlocked: true,
          oversizedBodyRejected: true,
          modernProtocolVerified: true,
          concurrentIsolationVerified: true,
        })
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error('MCP_HTTP_PROOF_FAILED', error.stack);
  process.exitCode = 1;
});
