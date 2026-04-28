import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioThreadsProvider extends ZernioBaseProvider {
  constructor() {
    super('threads', 'Threads', 500);
  }
}
