import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateTelegramProvider extends LateBaseProvider {
  constructor() {
    super('telegram', 'Telegram', 4096);
  }
}
