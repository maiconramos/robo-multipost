import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
initializeSentry('orchestrator', true);
import 'source-map-support/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import { NestFactory } from '@nestjs/core';
import { AppModule } from '@gitroom/orchestrator/app.module';
import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT || 3002;

  // Health check eh nice-to-have: workers Temporal funcionam sem ele.
  // Se o port estiver ocupado (zombie de boot anterior, OOM partial,
  // socket em TIME_WAIT), nao crashamos o processo inteiro — apenas
  // logamos e seguimos com os workers funcionais. Evita loop de crash
  // EADDRINUSE que derrubava workers saudaveis em ciclos de ~30s.
  try {
    await app.listen(port);
    console.log(`Orchestrator health check listening on port ${port}`);
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      console.warn(
        `[Orchestrator] Port ${port} ocupado — health check HTTP nao iniciado, mas workers Temporal seguem funcionais. ` +
          `Provavel causa: instancia anterior nao liberou o socket (zombie de OOM partial ou TIME_WAIT). ` +
          `Resolucao: docker restart no container limpa o port.`
      );
    } else {
      throw err;
    }
  }
}


bootstrap();
