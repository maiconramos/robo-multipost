import { basename } from 'node:path';

import {
  parseReplayArguments,
  replayPostWorkflowHistory,
} from '../src/replay/post-workflow-replay';

const { historyPath, workflowId } = parseReplayArguments(process.argv.slice(2));

if (!historyPath) {
  process.stderr.write(
    'Uso: pnpm temporal:replay-post <tmp/temporal-replay/history.json> [workflowId]\n'
  );
  process.exitCode = 1;
} else {
  replayPostWorkflowHistory(historyPath, { workflowId })
    .then((result) => {
      process.stdout.write(
        `Replay compativel: ${result.workflowType} (${basename(
          result.historyPath
        )})\n`
      );
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha desconhecida no replay.';
      process.stderr.write(`Replay incompativel: ${message.slice(0, 500)}\n`);
      process.exitCode = 1;
    });
}
