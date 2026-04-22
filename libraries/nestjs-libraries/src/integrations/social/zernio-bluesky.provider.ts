import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioBlueskyProvider extends ZernioBaseProvider {
  constructor() {
    super('bluesky', 'Bluesky', 300);
  }
}
