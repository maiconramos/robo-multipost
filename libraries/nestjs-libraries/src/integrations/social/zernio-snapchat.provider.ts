import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioSnapchatProvider extends ZernioBaseProvider {
  constructor() {
    super('snapchat', 'Snapchat', 2200);
  }
}
