import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { AgentGraphService } from '@gitroom/nestjs-libraries/agent/agent.graph.service';

@Injectable()
export class AgentRun {
  constructor(private _agentGraphService: AgentGraphService) {}
  @Command({
    command: 'run:agent',
    describe: 'Run the agent',
  })
  async agentRun() {
    // Stub de desenvolvimento. Nao existe metodo createGraph no AgentGraphService;
    // o grafo real roda via AgentGraphService.start(orgId, body, profileId) com
    // parametros reais. Mantido apenas para registrar o comando e nao quebrar o
    // build do apps/commands.
    console.log(
      'run:agent e um stub de desenvolvimento. Use AgentGraphService.start(orgId, body, profileId) com parametros reais.'
    );
  }
}
