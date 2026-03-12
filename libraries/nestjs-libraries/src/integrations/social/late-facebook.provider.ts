import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateFacebookProvider extends LateBaseProvider {
  constructor() {
    super('facebook', 'Facebook', 63206);
  }
}
