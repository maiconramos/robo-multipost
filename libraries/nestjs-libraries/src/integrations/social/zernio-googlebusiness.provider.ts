import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioGoogleBusinessProvider extends ZernioBaseProvider {
  constructor() {
    super('googlebusiness', 'Google Business', 1500);
  }
}
