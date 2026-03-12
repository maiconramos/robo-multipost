import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateGoogleBusinessProvider extends LateBaseProvider {
  constructor() {
    super('googlebusiness', 'Google Business', 1500);
  }
}
