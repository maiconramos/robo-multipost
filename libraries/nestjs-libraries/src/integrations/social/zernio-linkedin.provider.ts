import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioLinkedinProvider extends ZernioBaseProvider {
  constructor() {
    super('linkedin', 'LinkedIn', 3000);
  }
}
