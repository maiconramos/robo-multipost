import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateTwitterProvider extends LateBaseProvider {
  constructor() {
    super('twitter', 'Twitter/X', 280);
  }
}
