import { readFile as nodeReadFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

import { Worker } from '@temporalio/worker';

const POST_WORKFLOW_TYPES = new Set([
  'postWorkflowV101',
  'postWorkflowV102',
  'postWorkflowV112',
]);

type ReadFile = (path: string, encoding: BufferEncoding) => Promise<string>;
type RunReplayHistory = (
  options: { workflowsPath: string },
  history: unknown,
  workflowId?: string
) => Promise<void>;

interface ReplayDependencies {
  cwd?: string;
  readFile?: ReadFile;
  runReplayHistory?: RunReplayHistory;
  workflowsPath?: string;
  workflowId?: string;
}

interface ReplayResult {
  historyPath: string;
  workflowType: string;
}

export function parseReplayArguments(argv: string[]): {
  historyPath?: string;
  workflowId?: string;
} {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const [historyPath, workflowId] = args;
  return { historyPath, workflowId };
}

export function resolveReplayHistoryPath(
  input: string,
  cwd = process.cwd()
): string {
  const replayDirectory = resolve(cwd, 'tmp/temporal-replay');
  const historyPath = resolve(cwd, input);
  const relativePath = relative(replayDirectory, historyPath);

  if (
    !relativePath ||
    relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    relativePath === '..' ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      'O historico deve ficar em tmp/temporal-replay, diretorio ignorado pelo Git.'
    );
  }

  if (extname(historyPath).toLowerCase() !== '.json') {
    throw new Error('O historico de replay deve ser um arquivo .json.');
  }

  return historyPath;
}

function getPostWorkflowType(history: unknown): string {
  if (!history || typeof history !== 'object') {
    throw new Error('Historico Temporal invalido: objeto JSON ausente.');
  }

  const events = (history as { events?: unknown }).events;
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('Historico Temporal invalido: events vazio ou ausente.');
  }

  const firstEvent = events[0] as {
    workflowExecutionStartedEventAttributes?: {
      workflowType?: { name?: unknown };
    };
  };
  const workflowType =
    firstEvent.workflowExecutionStartedEventAttributes?.workflowType?.name;

  if (
    typeof workflowType !== 'string' ||
    !POST_WORKFLOW_TYPES.has(workflowType)
  ) {
    throw new Error(
      'O JSON nao pertence a um workflow de publicacao suportado (V101, V102 ou V112).'
    );
  }

  return workflowType;
}

const runReplayHistory: RunReplayHistory = (options, history, workflowId) =>
  Worker.runReplayHistory(options, history, workflowId);

export async function replayPostWorkflowHistory(
  input: string,
  dependencies: ReplayDependencies = {}
): Promise<ReplayResult> {
  const historyPath = resolveReplayHistoryPath(input, dependencies.cwd);
  const rawHistory = await (dependencies.readFile ?? nodeReadFile)(
    historyPath,
    'utf8'
  );

  let history: unknown;
  try {
    history = JSON.parse(rawHistory);
  } catch {
    throw new Error('Historico Temporal invalido: JSON malformado.');
  }

  const workflowType = getPostWorkflowType(history);
  await (dependencies.runReplayHistory ?? runReplayHistory)(
    {
      workflowsPath:
        dependencies.workflowsPath ?? require.resolve('../workflows'),
    },
    history,
    dependencies.workflowId
  );

  return { historyPath, workflowType };
}
