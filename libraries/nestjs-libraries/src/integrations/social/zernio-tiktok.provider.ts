import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioTikTokProvider extends ZernioBaseProvider {
  constructor() {
    super('tiktok', 'TikTok', 2200);
  }
}
