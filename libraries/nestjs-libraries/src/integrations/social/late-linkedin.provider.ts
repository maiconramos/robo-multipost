import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateLinkedinProvider extends LateBaseProvider {
  constructor() {
    super('linkedin', 'LinkedIn', 3000);
  }
}
