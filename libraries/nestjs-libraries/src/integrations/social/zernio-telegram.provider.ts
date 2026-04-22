import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioTelegramProvider extends ZernioBaseProvider {
  constructor() {
    super('telegram', 'Telegram', 4096);
  }
}
