import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioFacebookProvider extends ZernioBaseProvider {
  constructor() {
    super('facebook', 'Facebook', 63206);
  }
}
