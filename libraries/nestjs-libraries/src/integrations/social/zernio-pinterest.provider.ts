import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioPinterestProvider extends ZernioBaseProvider {
  constructor() {
    super('pinterest', 'Pinterest', 500);
  }
}
