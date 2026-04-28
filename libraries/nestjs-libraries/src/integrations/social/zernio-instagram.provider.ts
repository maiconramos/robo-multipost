import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioInstagramProvider extends ZernioBaseProvider {
  constructor() {
    super('instagram', 'Instagram', 2200);
  }
}
