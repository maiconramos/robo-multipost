import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioRedditProvider extends ZernioBaseProvider {
  constructor() {
    super('reddit', 'Reddit', 40000);
  }
}
