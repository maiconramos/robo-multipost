import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateRedditProvider extends LateBaseProvider {
  constructor() {
    super('reddit', 'Reddit', 40000);
  }
}
