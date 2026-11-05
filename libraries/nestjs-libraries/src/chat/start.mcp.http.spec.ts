import { execFile } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';

it('inicializa MCP real, descobre cliente e envia 6 MiB nos tres endpoints HTTP', async () => {
  const result = await promisify(execFile)(
    process.execPath,
    [
      '-r',
      require.resolve('ts-node/register/transpile-only'),
      '-r',
      require.resolve('tsconfig-paths/register'),
      join(__dirname, 'test-fixtures/mcp-http-smoke.cjs'),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TS_NODE_PROJECT: join(
          process.cwd(),
          'tools/tsconfig.media-upload.json'
        ),
        REDIS_URL: '',
      },
      maxBuffer: 1024 * 1024,
      timeout: 90000,
    }
  );
  const line = result.stdout
    .split('\n')
    .find((line) => line.startsWith('MCP_HTTP_PROOF='));
  expect(line).toBeDefined();
  expect(JSON.parse(line!.slice('MCP_HTTP_PROOF='.length))).toMatchObject({
    bytes: 6 * 1024 ** 2,
    endpoints: 3,
    saves: 4,
    sameOrganizationCredential: true,
    defaultNeverSelected: true,
    profileKeyMismatchBlocked: true,
    oversizedBodyRejected: true,
    modernProtocolVerified: true,
    concurrentIsolationVerified: true,
  });
}, 100000);
