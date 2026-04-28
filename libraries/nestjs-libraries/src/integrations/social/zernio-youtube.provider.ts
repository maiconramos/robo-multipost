import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioYoutubeProvider extends ZernioBaseProvider {
  constructor() {
    super('youtube', 'YouTube', 100000);
  }
}
