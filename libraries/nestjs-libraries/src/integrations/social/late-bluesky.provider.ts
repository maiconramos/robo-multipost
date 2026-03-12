import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateBlueskyProvider extends LateBaseProvider {
  constructor() {
    super('bluesky', 'Bluesky', 300);
  }
}
