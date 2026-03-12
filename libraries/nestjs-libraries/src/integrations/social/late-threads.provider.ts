import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateThreadsProvider extends LateBaseProvider {
  constructor() {
    super('threads', 'Threads', 500);
  }
}
