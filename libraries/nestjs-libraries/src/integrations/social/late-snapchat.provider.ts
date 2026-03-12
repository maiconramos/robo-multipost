import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateSnapchatProvider extends LateBaseProvider {
  constructor() {
    super('snapchat', 'Snapchat', 2200);
  }
}
