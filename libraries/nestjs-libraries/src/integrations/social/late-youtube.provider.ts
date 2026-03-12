import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateYoutubeProvider extends LateBaseProvider {
  constructor() {
    super('youtube', 'YouTube', 100000);
  }
}
