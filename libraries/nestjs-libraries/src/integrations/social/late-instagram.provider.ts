import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LateInstagramProvider extends LateBaseProvider {
  constructor() {
    super('instagram', 'Instagram', 2200);
  }
}
