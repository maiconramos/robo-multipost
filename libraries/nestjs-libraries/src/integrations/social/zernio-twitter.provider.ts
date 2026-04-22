import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioTwitterProvider extends ZernioBaseProvider {
  constructor() {
    super('twitter', 'Twitter/X', 280);
  }
}
